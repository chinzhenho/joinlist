import { CalendarX, MapPin, Plus } from 'lucide-react'
import { Link } from 'react-router-dom'
import { api, type EventView } from '../api'
import { useAuth } from '../auth'
import { formatDay, formatTime } from '../format'
import { Empty, ErrorNote, Loading, PhaseBadge } from '../ui'
import { useLoad } from '../useLoad'

export default function Events() {
  const { user } = useAuth()
  const { data, error, loading, reload } = useLoad(api.events, [])

  return (
    <>
      <div className="mb-5 flex items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Upcoming events</h1>
          <p className="mt-0.5 text-sm text-muted">Grab a spot. If it's full, join the waitlist.</p>
        </div>
        {user && (
          <Link
            to="/organize/new"
            className="inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-xl bg-brand px-3.5 text-sm font-semibold text-paper hover:bg-brand-dark"
          >
            <Plus size={16} aria-hidden /> Create event
          </Link>
        )}
      </div>

      {loading && !data && <Loading />}
      {error && <ErrorNote message={error.message} onRetry={reload} />}
      {data && data.length === 0 && (
        <Empty icon={<CalendarX size={32} />} title="No upcoming events yet">
          {user ? 'Create one and share the link.' : 'Check back soon.'}
        </Empty>
      )}
      {data && data.length > 0 && (
        <ul className="space-y-3">
          {data.map((e) => (
            <li key={e.id}>
              <EventCard event={e} />
            </li>
          ))}
        </ul>
      )}
    </>
  )
}

export function EventCard({ event: e, to }: { event: EventView; to?: string }) {
  return (
    <Link
      to={to ?? `/events/${e.id}`}
      className="flex gap-4 rounded-2xl border border-line bg-white p-4 transition-colors hover:border-brand/40"
    >
      <div className="flex w-14 shrink-0 flex-col items-center justify-center rounded-xl bg-brand-soft py-2 text-brand">
        <span className="text-[11px] font-semibold uppercase">{formatDay(e.startsAt).split(' ')[1]}</span>
        <span className="text-xl leading-none font-bold">{formatDay(e.startsAt).split(' ')[0]}</span>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <h2 className="truncate font-semibold">{e.title}</h2>
          <PhaseBadge phase={e.phase} />
        </div>
        <p className="mt-0.5 flex items-center gap-1 truncate text-sm text-muted">
          <MapPin size={14} className="shrink-0" aria-hidden /> {e.location} · {formatTime(e.startsAt)}
        </p>
        <SpotsLine event={e} />
      </div>
    </Link>
  )
}

export function SpotsLine({ event: e }: { event: EventView }) {
  const pct = Math.min(100, Math.round((e.confirmedCount / e.capacity) * 100))
  return (
    <div className="mt-2">
      <div className="h-1.5 overflow-hidden rounded-full bg-stone-100">
        <div className={`h-full rounded-full ${e.spotsLeft === 0 ? 'bg-amber-500' : 'bg-brand'}`} style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-1 text-xs text-muted">
        {e.spotsLeft === 0 ? 'Full' : `${e.spotsLeft} of ${e.capacity} spots left`}
        {e.waitlistCount > 0 && ` · ${e.waitlistCount} waiting`}
      </p>
    </div>
  )
}
