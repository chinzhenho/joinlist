// Opens many live-update connections at once (like many open browser tabs) and reports whether each one
// keeps receiving updates. Run it next to loadtest/live-site.js so there are changes to hear about.
//
//   node loadtest/listeners.mjs                    # 100 connections to the live site for 3 minutes
//   node loadtest/listeners.mjs https://joinlist.onrender.com 100 180

const API = (process.argv[2] ?? 'https://joinlist.onrender.com').replace(/\/$/, '')
const COUNT = Number(process.argv[3] ?? 100)
const SECONDS = Number(process.argv[4] ?? 180)

const conns = []

async function open(i) {
  const c = { i, ready: false, changed: 0, pings: 0, firstChangeAt: null, error: null, closed: false }
  conns.push(c)
  const controller = new AbortController()
  c.abort = () => controller.abort()
  try {
    const res = await fetch(`${API}/api/stream`, { signal: controller.signal, headers: { Accept: 'text/event-stream' } })
    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buf = ''
    for (;;) {
      const { value, done } = await reader.read()
      if (done) break
      buf += decoder.decode(value, { stream: true })
      const lines = buf.split('\n')
      buf = lines.pop()
      for (const line of lines) {
        if (line === 'event:ready') c.ready = true
        if (line === 'event:ping') c.pings++
        if (line === 'event:changed') {
          c.changed++
          c.firstChangeAt ??= Date.now()
        }
      }
    }
    c.closed = true
  } catch (e) {
    if (e.name !== 'AbortError') c.error = e.message
  }
}

const started = Date.now()
for (let i = 0; i < COUNT; i++) {
  open(i)
  await new Promise((r) => setTimeout(r, 20)) // like tabs being opened, not all in the same millisecond
}
console.log(`Opened ${COUNT} live connections to ${API}; listening for ${SECONDS}s...`)

const timer = setInterval(() => {
  const ready = conns.filter((c) => c.ready).length
  const heard = conns.filter((c) => c.changed > 0).length
  console.log(`  ${Math.round((Date.now() - started) / 1000)}s: ${ready} connected, ${heard} have received an update`)
}, 15000)

await new Promise((r) => setTimeout(r, SECONDS * 1000))
clearInterval(timer)
conns.forEach((c) => c.abort?.())

const ready = conns.filter((c) => c.ready).length
const heard = conns.filter((c) => c.changed > 0).length
const errors = conns.filter((c) => c.error)
const dropped = conns.filter((c) => c.closed).length
console.log('\nResult')
console.log(`  connected:                 ${ready}/${COUNT}`)
console.log(`  received live updates:     ${heard}/${COUNT}`)
console.log(`  dropped by the server:     ${dropped}`)
console.log(`  errors:                    ${errors.length}${errors.length ? ' (' + errors[0].error + ')' : ''}`)
process.exit(ready === COUNT && heard === COUNT && errors.length === 0 ? 0 : 1)
