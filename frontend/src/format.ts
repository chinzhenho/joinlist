// Dates are shown in the visitor's own time zone (Malaysia and Singapore are both UTC+8).

const dateTime = new Intl.DateTimeFormat('en-MY', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  hour: 'numeric',
  minute: '2-digit',
})

const dayMonth = new Intl.DateTimeFormat('en-MY', { day: 'numeric', month: 'short' })
const time = new Intl.DateTimeFormat('en-MY', { hour: 'numeric', minute: '2-digit' })

export const formatDateTime = (iso: string) => dateTime.format(new Date(iso))
export const formatDay = (iso: string) => dayMonth.format(new Date(iso))
export const formatTime = (iso: string) => time.format(new Date(iso))

/** For <input type="datetime-local">: "2026-10-20T19:30" in local time. */
export function toLocalInput(iso: string) {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** From <input type="datetime-local"> back to an ISO string with time zone. */
export const fromLocalInput = (value: string) => new Date(value).toISOString()
