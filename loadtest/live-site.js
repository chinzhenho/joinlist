// Load test for a deployed Joinlist (default: the live site), with the rate limiter ON.
//
//   k6 run loadtest/live-site.js
//   k6 run -e API=https://joinlist.onrender.com -e RACERS=40 -e SEATS=10 -e BROWSERS=100 loadtest/live-site.js
//
// What happens:
//   setup    : 1 organiser + RACERS attendees sign up, slowly (the server allows 10 sign-ups a minute per IP),
//              and the organiser publishes an event with SEATS seats.
//   browse   : BROWSERS people keep opening the event list and the event page (with a second's pause between).
//   race     : while that's going on, all RACERS attendees press Register at the same moment.
//   teardown : checks the seats on the server (exactly SEATS confirmed, the rest waiting) and deletes every
//              test account again, which also cancels the test event.

import http from 'k6/http'
import exec from 'k6/execution'
import { check, sleep, fail } from 'k6'
import { Counter, Trend } from 'k6/metrics'

const API = __ENV.API || 'https://joinlist.onrender.com'
const RACERS = Number(__ENV.RACERS || 40)
const SEATS = Number(__ENV.SEATS || 10)
const BROWSERS = Number(__ENV.BROWSERS || 100)
const PASSWORD = 'load-test-pw-1'
const SIGNUP_GAP_S = 6.5 // stay under 10 sign-ups per minute

const confirmed = new Counter('race_confirmed')
const waitlisted = new Counter('race_waitlisted')
const raceTime = new Trend('race_register_ms', true)
const pageTime = new Trend('browse_page_ms', true)

export const options = {
  setupTimeout: `${Math.ceil((RACERS + 2) * SIGNUP_GAP_S + 120)}s`,
  teardownTimeout: '5m',
  scenarios: {
    browse: {
      executor: 'ramping-vus',
      exec: 'browse',
      startVUs: 0,
      stages: [
        { duration: '20s', target: BROWSERS },
        { duration: '60s', target: BROWSERS },
        { duration: '10s', target: 0 },
      ],
    },
    race: {
      executor: 'per-vu-iterations',
      exec: 'race',
      vus: RACERS,
      iterations: 1,
      startTime: '40s', // in the middle of the busiest browsing
      maxDuration: '2m',
    },
  },
  thresholds: {
    'http_req_failed{scenario:browse}': ['rate<0.01'],
    'http_req_failed{scenario:race}': ['rate==0'],
    race_confirmed: [`count==${SEATS}`],
    race_waitlisted: [`count==${RACERS - SEATS}`],
  },
}

const json = { headers: { 'Content-Type': 'application/json' } }
const auth = (token) => ({ headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } })

function signUp(name, run) {
  const email = `load-${run}-${name}@joinlist.test`
  for (let attempt = 0; attempt < 5; attempt++) {
    const res = http.post(`${API}/api/auth/register`, JSON.stringify({ name, email, password: PASSWORD }), json)
    if (res.status === 201) return res.json('token')
    if (res.status === 429) {
      sleep(30) // the per-minute window hasn't reset yet
      continue
    }
    fail(`sign-up failed: ${res.status} ${res.body}`)
  }
  fail('sign-up kept being rate limited')
}

export function setup() {
  const run = Math.random().toString(36).slice(2, 8)
  console.log(`Signing up ${RACERS + 1} test accounts, about ${Math.ceil(((RACERS + 1) * SIGNUP_GAP_S) / 60)} min...`)
  const organiser = signUp('organiser', run)
  sleep(SIGNUP_GAP_S)
  const tokens = []
  for (let i = 0; i < RACERS; i++) {
    tokens.push(signUp(`person${i}`, run))
    sleep(SIGNUP_GAP_S)
  }
  const now = Date.now()
  const created = http.post(
    `${API}/api/events`,
    JSON.stringify({
      title: `Load test ${run} (temporary)`,
      description: 'Made by the automated load test. Cancelled automatically when the test ends.',
      location: 'k6',
      startsAt: new Date(now + 3 * 86400e3).toISOString(),
      registrationOpensAt: new Date(now - 60e3).toISOString(),
      registrationClosesAt: new Date(now + 2 * 86400e3).toISOString(),
      capacity: SEATS,
    }),
    auth(organiser),
  )
  const eventId = created.json('id')
  http.post(`${API}/api/events/${eventId}/publish`, null, auth(organiser))
  console.log(`Event ${eventId} published. Starting the load.`)
  return { eventId, organiser, tokens }
}

export function browse(data) {
  let res = http.get(`${API}/api/events`, { tags: { name: 'list' } })
  pageTime.add(res.timings.duration)
  check(res, { 'event list loads': (r) => r.status === 200 })
  sleep(1)
  res = http.get(`${API}/api/events/${data.eventId}`, { tags: { name: 'event page' } })
  pageTime.add(res.timings.duration)
  check(res, { 'event page loads': (r) => r.status === 200 })
  sleep(1)
}

export function race(data) {
  const token = data.tokens[exec.scenario.iterationInTest] // each racer uses their own account
  const res = http.post(`${API}/api/events/${data.eventId}/registrations`, null, { ...auth(token), tags: { name: 'register' } })
  raceTime.add(res.timings.duration)
  if (!check(res, { 'registration accepted': (r) => r.status === 201 })) {
    console.log(`register failed: ${res.status} ${res.body}`)
    return
  }
  if (res.json('status') === 'CONFIRMED') confirmed.add(1)
  if (res.json('status') === 'WAITLISTED') waitlisted.add(1)
}

export function teardown(data) {
  const event = http.get(`${API}/api/events/${data.eventId}`, auth(data.organiser)).json()
  const people = http.get(`${API}/api/events/${data.eventId}/attendees`, auth(data.organiser)).json()
  const count = (s) => people.filter((p) => p.status === s).length
  console.log(
    `Server says: confirmedCount=${event.confirmedCount}/${event.capacity}, ` +
      `rows CONFIRMED=${count('CONFIRMED')}, WAITLISTED=${count('WAITLISTED')}`,
  )
  check(event, {
    'no overbooking': (e) => e.confirmedCount <= e.capacity,
    'counter matches the rows': (e) => e.confirmedCount === count('CONFIRMED'),
    'everyone else is waiting in line': () => count('WAITLISTED') === RACERS - SEATS,
  })
  // Clean up: deleting the organiser also cancels the event.
  let deleted = 0
  for (const token of [...data.tokens, data.organiser]) {
    const r = http.del(`${API}/api/me`, JSON.stringify({ password: PASSWORD }), auth(token))
    if (r.status === 204) deleted++
  }
  console.log(`Deleted ${deleted} of ${data.tokens.length + 1} test accounts.`)
}
