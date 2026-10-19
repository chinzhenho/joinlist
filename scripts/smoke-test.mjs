// End-to-end check of a running Joinlist, through the public API, like real users would.
// Creates temporary accounts and one event, checks every feature, then deletes the accounts again.
//
//   node scripts/smoke-test.mjs                         # the live site
//   node scripts/smoke-test.mjs http://localhost:8080   # a local server
//
// Needs Node 20+. Exit code 0 = everything passed.

const API = (process.argv[2] ?? 'https://joinlist.onrender.com').replace(/\/$/, '')
const PASSWORD = 'smoke-test-pw-1'
const run = Math.random().toString(36).slice(2, 8)
const results = []
const accounts = []

function check(name, ok, detail = '') {
  results.push({ name, ok })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${!ok && detail ? `  (${detail})` : ''}`)
}

async function call(method, path, { token, body, raw } = {}) {
  const res = await fetch(API + path, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const text = await res.text()
  let json = null
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    // CSV or empty
  }
  return { status: res.status, json, text: raw ? text : undefined }
}

async function signUp(name) {
  const email = `smoke-${run}-${name.toLowerCase()}@joinlist.test`
  const r = await call('POST', '/api/auth/register', { body: { name, email, password: PASSWORD } })
  if (r.status !== 201) throw new Error(`sign-up failed for ${name}: ${r.status} ${JSON.stringify(r.json)}`)
  const account = { name, email, token: r.json.token, password: PASSWORD }
  accounts.push(account)
  return account
}

/** Listens to the live stream and remembers which event ids were reported as changed. */
async function openLiveStream() {
  const seen = new Set()
  const controller = new AbortController()
  let ready = false
  const res = await fetch(API + '/api/stream', { signal: controller.signal, headers: { Accept: 'text/event-stream' } })
  ;(async () => {
    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    try {
      for (;;) {
        const { value, done } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        for (const line of buffer.split('\n').slice(0, -1)) {
          if (line === 'event:ready') ready = true
          if (line.startsWith('data:')) line.slice(5).split(',').forEach((id) => id && seen.add(Number(id)))
        }
        buffer = buffer.slice(buffer.lastIndexOf('\n') + 1)
      }
    } catch {
      // closed at the end
    }
  })()
  return { seen, isReady: () => ready, close: () => controller.abort() }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
async function waitFor(fn, ms = 6000) {
  const end = Date.now() + ms
  while (Date.now() < end) {
    if (fn()) return true
    await sleep(200)
  }
  return false
}

async function main() {
  console.log(`Checking ${API}\n`)

  // ---- server
  const health = await call('GET', '/api/health')
  check('Server is up (health check)', health.status === 200 && health.json?.status === 'UP', `got ${health.status}`)
  const live = await openLiveStream()
  check('Live updates: connection opens', await waitFor(live.isReady))

  // ---- accounts
  const org = await signUp('Organiser')
  const a = await signUp('Alice')
  const b = await signUp('Bob')
  const c = await signUp('Chen')
  check('Sign up (4 accounts)', true)
  check('Log in with wrong password is refused', (await call('POST', '/api/auth/login', { body: { email: a.email, password: 'wrong-pw' } })).status === 401)
  check('Log in with right password works', (await call('POST', '/api/auth/login', { body: { email: a.email, password: PASSWORD } })).status === 200)
  check('Same email twice is refused', (await call('POST', '/api/auth/register', { body: { name: 'x', email: a.email.toUpperCase(), password: PASSWORD } })).status === 409)

  // ---- create and publish
  const now = Date.now()
  const day = 86400e3
  const form = {
    title: `Smoke test ${run}`,
    description: 'Temporary event made by the automated check. It will be cancelled in a minute.',
    location: 'Online',
    startsAt: new Date(now + 3 * day).toISOString(),
    registrationOpensAt: new Date(now - 60e3).toISOString(),
    registrationClosesAt: new Date(now + 2 * day).toISOString(),
    capacity: 1,
  }
  const created = await call('POST', '/api/events', { token: org.token, body: form })
  const id = created.json?.id
  check('Create event (draft)', created.status === 201 && id > 0, `got ${created.status}`)
  check('Draft is hidden from the public', (await call('GET', `/api/events/${id}`)).status === 404)
  check('Someone else cannot publish it', (await call('POST', `/api/events/${id}/publish`, { token: a.token })).status === 403)
  const pub = await call('POST', `/api/events/${id}/publish`, { token: org.token })
  check('Organiser publishes it', pub.status === 200 && pub.json?.phase === 'open', `got ${pub.status} ${pub.json?.phase}`)
  const list = await call('GET', '/api/events')
  check('It appears in the public list', list.json?.some((e) => e.id === id))

  // ---- register, waitlist
  const ra = await call('POST', `/api/events/${id}/registrations`, { token: a.token })
  check('Alice registers and gets the only seat', ra.json?.status === 'CONFIRMED', JSON.stringify(ra.json))
  check('Alice registering twice is refused', (await call('POST', `/api/events/${id}/registrations`, { token: a.token })).status === 409)
  const rb = await call('POST', `/api/events/${id}/registrations`, { token: b.token })
  const rc = await call('POST', `/api/events/${id}/registrations`, { token: c.token })
  check('Bob and Chen join the waitlist', rb.json?.status === 'WAITLISTED' && rc.json?.status === 'WAITLISTED')
  const chenView = await call('GET', `/api/events/${id}`, { token: c.token })
  check('Chen sees he is #2 in line', chenView.json?.myRegistration?.waitlistPosition === 2)
  check('Live updates: the change was announced', await waitFor(() => live.seen.has(id)))

  // ---- permissions
  check('Bob cannot edit the event', (await call('PATCH', `/api/events/${id}`, { token: b.token, body: { ...form, title: 'Hacked' } })).status === 403)
  check('Bob cannot cancel the event', (await call('POST', `/api/events/${id}/cancel`, { token: b.token })).status === 403)
  check('Bob cannot see the attendee list', (await call('GET', `/api/events/${id}/attendees`, { token: b.token })).status === 403)
  check('Bob cannot cancel Alice\'s registration', (await call('DELETE', `/api/registrations/${ra.json.registrationId}`, { token: b.token })).status === 404)
  check('Not logged in: cannot register', (await call('POST', `/api/events/${id}/registrations`)).status === 401)

  // ---- cancel → waitlist moves up
  live.seen.clear()
  check('Alice cancels', (await call('DELETE', `/api/registrations/${ra.json.registrationId}`, { token: a.token })).status === 204)
  const bobView = await call('GET', `/api/events/${id}`, { token: b.token })
  check('Bob automatically gets her seat', bobView.json?.myRegistration?.status === 'CONFIRMED')
  const chenAfter = await call('GET', `/api/events/${id}`, { token: c.token })
  check('Chen moves up to #1', chenAfter.json?.myRegistration?.waitlistPosition === 1)
  check('Seats never go over capacity', bobView.json?.confirmedCount === 1 && bobView.json?.capacity === 1)
  check('Live updates: the cancellation was announced', await waitFor(() => live.seen.has(id)))

  // ---- capacity
  const grow = await call('PATCH', `/api/events/${id}`, { token: org.token, body: { ...form, capacity: 2 } })
  check('Organiser adds a seat', grow.status === 200)
  const chenNow = await call('GET', `/api/events/${id}`, { token: c.token })
  check('Chen gets the new seat automatically', chenNow.json?.myRegistration?.status === 'CONFIRMED')
  check('Seats cannot go below the confirmed count', (await call('PATCH', `/api/events/${id}`, { token: org.token, body: { ...form, capacity: 1 } })).status === 409)

  // ---- check-in
  const bobRegs = await call('GET', '/api/me/registrations', { token: b.token })
  const code = bobRegs.json?.[0]?.registration?.qrToken ?? ''
  check('Bob has a short check-in code (like 8K3F-7QPA)', /^[2-9A-HJKMNP-Z]{4}-[2-9A-HJKMNP-Z]{4}$/.test(code), code)
  check('A wrong code is refused', (await call('POST', `/api/events/${id}/check-in`, { token: org.token, body: { token: 'ABCD-EFGH' } })).status === 400)
  check('Only the organiser can check people in', (await call('POST', `/api/events/${id}/check-in`, { token: c.token, body: { token: code } })).status === 403)
  const typed = code.toLowerCase().replace('-', ' ')
  check('Organiser checks Bob in by typing his code', (await call('POST', `/api/events/${id}/check-in`, { token: org.token, body: { token: typed } })).status === 200)
  check('The same code cannot be used twice', (await call('POST', `/api/events/${id}/check-in`, { token: org.token, body: { token: code } })).status === 409)
  const people = await call('GET', `/api/events/${id}/attendees`, { token: org.token })
  const chenReg = people.json?.find((p) => p.name === 'Chen')
  check('Organiser checks Chen in by hand', (await call('POST', `/api/events/${id}/registrations/${chenReg?.registrationId}/check-in`, { token: org.token })).status === 200)
  const csv = await call('GET', `/api/events/${id}/attendees.csv`, { token: org.token, raw: true })
  check('Attendee list downloads as CSV', csv.status === 200 && csv.text?.includes('"Bob"') && csv.text?.includes('"Chen"'))

  // ---- account
  const renamed = await call('PATCH', '/api/me', { token: b.token, body: { name: 'Bob Tan' } })
  check('Bob renames himself', renamed.json?.name === 'Bob Tan')
  const peopleAfter = await call('GET', `/api/events/${id}/attendees`, { token: org.token })
  check('Organiser sees the new name', peopleAfter.json?.some((p) => p.name === 'Bob Tan'))
  await sleep(1100) // password change cuts off tokens issued in earlier seconds
  const pw = await call('POST', '/api/me/password', { token: c.token, body: { currentPassword: PASSWORD, newPassword: 'smoke-test-pw-2' } })
  check('Chen changes his password', pw.status === 200)
  check('Chen\'s old login stops working', (await call('GET', '/api/me', { token: c.token })).status === 401)
  if (pw.json?.token) {
    const chen = accounts.find((x) => x.name === 'Chen')
    chen.token = pw.json.token
    chen.password = 'smoke-test-pw-2'
  }
  check('Chen\'s new login works', (await call('GET', '/api/me', { token: accounts.find((x) => x.name === 'Chen').token })).status === 200)

  // ---- cancel the event
  const cancelled = await call('POST', `/api/events/${id}/cancel`, { token: org.token })
  check('Organiser cancels the event', cancelled.json?.status === 'CANCELLED')
  check('Nobody can register for a cancelled event', (await call('POST', `/api/events/${id}/registrations`, { token: a.token })).status === 409)
  check('Cancelled event leaves the public list', !(await call('GET', '/api/events')).json?.some((e) => e.id === id))

  live.close()
}

async function cleanup() {
  for (const acc of accounts) {
    const r = await call('DELETE', '/api/me', { token: acc.token, body: { password: acc.password } })
    if (r.status !== 204) console.log(`(could not delete test account ${acc.name}: ${r.status})`)
  }
  if (accounts.length) {
    const gone = await call('POST', '/api/auth/login', { body: { email: accounts[0].email, password: PASSWORD } })
    check('Deleted accounts can no longer log in', gone.status === 401)
  }
}

try {
  await main()
} catch (e) {
  check('Script ran to the end', false, e.message)
} finally {
  await cleanup()
  const failed = results.filter((r) => !r.ok)
  console.log(`\n${results.length - failed.length} passed, ${failed.length} failed`)
  process.exit(failed.length ? 1 : 0)
}
