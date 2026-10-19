// "Add to calendar": builds a standard .ics file that Google Calendar, Apple Calendar and Outlook all open.

const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
const escape = (s: string) => s.replace(/[\\;,]/g, (c) => '\\' + c).replace(/\n/g, '\\n')

export function downloadIcs(event: { id: number; title: string; location: string; description: string; startsAt: string }) {
  const start = new Date(event.startsAt)
  const end = new Date(start.getTime() + 2 * 60 * 60 * 1000) // events have no end time; assume 2 hours
  const url = `${location.origin}/events/${event.id}`
  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Joinlist//EN',
    'BEGIN:VEVENT',
    `UID:joinlist-event-${event.id}@joinlist`,
    `DTSTAMP:${stamp(new Date())}`,
    `DTSTART:${stamp(start)}`,
    `DTEND:${stamp(end)}`,
    `SUMMARY:${escape(event.title)}`,
    `LOCATION:${escape(event.location)}`,
    `DESCRIPTION:${escape((event.description ? event.description + '\n\n' : '') + url)}`,
    `URL:${url}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n')
  const href = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' }))
  const a = document.createElement('a')
  a.href = href
  a.download = `${event.title.replace(/[^\w-]+/g, '-').slice(0, 40) || 'event'}.ics`
  a.click()
  URL.revokeObjectURL(href)
}

export const mapsUrl = (place: string) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place)}`
