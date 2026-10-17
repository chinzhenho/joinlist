// k6 load test: 1000 different people try to register for a 50-seat event at the same moment.
//
// Run the API with the rate limiter off (docker compose already does), then:
//   k6 run loadtest/race.js
//   k6 run -e API=http://localhost:8080 -e PEOPLE=1000 -e SEATS=50 loadtest/race.js
//
// Pass = exactly SEATS confirmed and PEOPLE - SEATS on the waitlist, checked through the API at the end.

import http from 'k6/http'
import exec from 'k6/execution'
import { check, fail } from 'k6'
import { Counter } from 'k6/metrics'

const API = __ENV.API || 'http://localhost:8080'
const PEOPLE = Number(__ENV.PEOPLE || 1000)
const SEATS = Number(__ENV.SEATS || 50)
const json = { headers: { 'Content-Type': 'application/json' } }

const confirmed = new Counter('registrations_confirmed')
const waitlisted = new Counter('registrations_waitlisted')

export const options = {
  setupTimeout: '10m',
  scenarios: {
    race: {
      executor: 'per-vu-iterations',
      vus: PEOPLE, // one virtual user per person
      iterations: 1, // each person clicks "Register" once
      maxDuration: '2m',
    },
  },
  thresholds: {
    http_req_failed: ['rate==0'],
    // Listed so the summary shows timings for the register requests alone (not the sign-ups in setup).
    'http_req_duration{name:register}': ['p(95)<5000'],
    registrations_confirmed: [`count==${SEATS}`],
    registrations_waitlisted: [`count==${PEOPLE - SEATS}`],
  },
}

const auth = (token) => ({ headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } })

function signUp(name) {
  const res = http.post(
    `${API}/api/auth/register`,
    JSON.stringify({ name, email: `${name}-${Date.now()}-${Math.random()}@load.test`, password: 'load-test-pw' }),
    json,
  )
  if (res.status !== 201) fail(`sign-up failed: ${res.status} ${res.body}`)
  return res.json('token')
}

// Not timed: create the organizer, the event and all the people first.
export function setup() {
  const organizer = signUp('organizer')
  const now = Date.now()
  const event = http.post(
    `${API}/api/events`,
    JSON.stringify({
      title: `Load test ${new Date().toISOString()}`,
      location: 'k6',
      startsAt: new Date(now + 2 * 86400e3).toISOString(),
      registrationOpensAt: new Date(now - 60e3).toISOString(),
      registrationClosesAt: new Date(now + 86400e3).toISOString(),
      capacity: SEATS,
    }),
    auth(organizer),
  )
  const eventId = event.json('id')
  http.post(`${API}/api/events/${eventId}/publish`, null, auth(organizer))

  // Sign people up in batches of 50 requests at a time.
  const tokens = []
  for (let start = 0; start < PEOPLE; start += 50) {
    const batch = []
    for (let i = start; i < Math.min(start + 50, PEOPLE); i++) {
      batch.push([
        'POST',
        `${API}/api/auth/register`,
        JSON.stringify({ name: `person${i}`, email: `p${i}-${now}@load.test`, password: 'load-test-pw' }),
        json,
      ])
    }
    for (const res of http.batch(batch)) {
      if (res.status !== 201) fail(`sign-up failed: ${res.status} ${res.body}`)
      tokens.push(res.json('token'))
    }
  }
  return { eventId, tokens, organizer }
}

// Timed: every person registers once, all at the same time.
export default function (data) {
  const token = data.tokens[exec.vu.idInTest - 1]
  const res = http.post(`${API}/api/events/${data.eventId}/registrations`, null, {
    ...auth(token),
    tags: { name: 'register' },
  })
  if (!check(res, { 'registered (201)': (r) => r.status === 201 })) return
  const status = res.json('status')
  if (status === 'CONFIRMED') confirmed.add(1)
  if (status === 'WAITLISTED') waitlisted.add(1)
}

// Afterwards: ask the server what it actually stored, not what each request was told.
export function teardown(data) {
  const event = http.get(`${API}/api/events/${data.eventId}`, auth(data.organizer)).json()
  const people = http.get(`${API}/api/events/${data.eventId}/attendees`, auth(data.organizer)).json()
  const inDb = (s) => people.filter((p) => p.status === s).length
  console.log(
    `event ${data.eventId}: confirmedCount=${event.confirmedCount} capacity=${event.capacity} ` +
      `rows CONFIRMED=${inDb('CONFIRMED')} WAITLISTED=${inDb('WAITLISTED')}`,
  )
  check(event, {
    'no overbooking': (e) => e.confirmedCount <= e.capacity,
    'counter matches rows': (e) => e.confirmedCount === inDb('CONFIRMED'),
    'everyone else is waiting': () => inDb('WAITLISTED') === PEOPLE - SEATS,
  })
}
