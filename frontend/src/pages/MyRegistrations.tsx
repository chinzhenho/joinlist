import { CalendarPlus, Check, ChevronRight, Clock, MapPin, Ticket } from 'lucide-react'
import QRCode from 'qrcode'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, type MyRegistrationItem } from '../api'
import { useAuth } from '../auth'
import { downloadIcs } from '../calendar'
import { usePageTitle } from '../feedback'
import { formatDateTime } from '../format'
import { buttonClass, Card, Empty, ErrorNote, Loading, PageHeader, PhaseBadge, StatusBadge } from '../ui'
import { useLive } from '../live'
import { useLoad } from '../useLoad'

export default function MyRegistrations() {
  const { user } = useAuth()
  usePageTitle('My registrations')
  const { data, error, loading, reload, refresh } = useLoad(api.myRegistrations, [user?.id])
  useLive(refresh)
  const upcoming = data?.filter((i) => i.eventPhase !== 'ended' && i.eventPhase !== 'cancelled') ?? []
  const past = data?.filter((i) => i.eventPhase === 'ended' || i.eventPhase === 'cancelled') ?? []

  return (
    <>
      <PageHeader title="My registrations" subtitle="Your spots, your place on waitlists, and your check-in QR codes." />
      {loading && !data && <Loading />}
      {error && <ErrorNote message={error.message} onRetry={reload} />}
      {data && data.length === 0 && (
        <div className="rounded-2xl border border-dashed border-line bg-white/60">
          <Empty icon={<Ticket size={32} />} title="You haven't registered for anything yet">
            <Link to="/" className="font-semibold text-brand">
              Browse events
            </Link>
          </Empty>
        </div>
      )}

      {upcoming.length > 0 && (
        <ul className="grid items-start gap-4 md:grid-cols-2">
          {upcoming.map((item) => (
            <li key={item.registration.id}>
              <RegistrationCard item={item} />
            </li>
          ))}
        </ul>
      )}

      {past.length > 0 && (
        <section className="mt-10">
          <h2 className="mb-3 text-sm font-bold tracking-wide text-muted uppercase">Past and cancelled</h2>
          <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-white">
            {past.map((item) => (
              <li key={item.registration.id}>
                <Link to={`/events/${item.eventId}`} className="flex items-center gap-3 px-5 py-4 hover:bg-paper">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{item.eventTitle}</p>
                    <p className="text-sm text-muted">{formatDateTime(item.eventStartsAt)}</p>
                  </div>
                  {item.registration.checkedInAt ? (
                    <span className="flex items-center gap-1 text-xs font-semibold text-brand">
                      <Check size={14} aria-hidden /> Attended
                    </span>
                  ) : (
                    <PhaseBadge phase={item.eventPhase} />
                  )}
                  <ChevronRight size={18} className="text-muted" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  )
}

function RegistrationCard({ item }: { item: MyRegistrationItem }) {
  const reg = item.registration
  return (
    <Card>
      <div className="flex items-start justify-between gap-2">
        <Link to={`/events/${item.eventId}`} className="font-semibold hover:text-brand hover:underline">
          {item.eventTitle}
        </Link>
        <StatusBadge status={reg.status} forMe />
      </div>
      <div className="mt-1.5 space-y-0.5 text-sm text-muted">
        <p className="flex items-center gap-1.5">
          <Clock size={14} aria-hidden /> {formatDateTime(item.eventStartsAt)}
        </p>
        <p className="flex items-center gap-1.5">
          <MapPin size={14} aria-hidden /> {item.eventLocation}
        </p>
      </div>

      {reg.status === 'WAITLISTED' && (
        <p className="mt-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
          You're <strong>#{reg.waitlistPosition}</strong> on the waitlist. If a spot opens, it's yours automatically and
          we'll email you.
        </p>
      )}

      {reg.status === 'CONFIRMED' && reg.qrToken && (
        <div className="mt-4 flex flex-col items-center border-t border-line pt-4">
          {reg.checkedInAt ? (
            <p className="flex items-center gap-1.5 py-6 font-semibold text-brand">
              <Check size={20} aria-hidden /> Checked in at {formatDateTime(reg.checkedInAt)}
            </p>
          ) : (
            <>
              <QrImage value={reg.qrToken} />
              <p className="mt-2 text-xs text-muted">Show this at the door. Turn up your screen brightness.</p>
              <div className="mt-3 rounded-xl bg-stone-100 px-4 py-2 text-center">
                <p className="text-[11px] font-semibold tracking-wide text-muted uppercase">Check-in code</p>
                <p className="font-mono text-2xl font-bold tracking-[0.15em] text-ink select-all">{reg.qrToken}</p>
              </div>
              <p className="mt-1 text-xs text-muted">If the QR won't scan, read this out to the organiser.</p>
            </>
          )}
        </div>
      )}

      <div className="mt-4 flex gap-2 border-t border-line pt-4">
        <Link to={`/events/${item.eventId}`} className={`${buttonClass.secondary} min-h-10 flex-1 text-sm`}>
          View event
        </Link>
        <button
          onClick={() =>
            downloadIcs({
              id: item.eventId,
              title: item.eventTitle,
              location: item.eventLocation,
              description: '',
              startsAt: item.eventStartsAt,
            })
          }
          className={`${buttonClass.secondary} min-h-10 flex-1 text-sm`}
        >
          <CalendarPlus size={16} aria-hidden /> Calendar
        </button>
      </div>
    </Card>
  )
}

function QrImage({ value }: { value: string }) {
  const [src, setSrc] = useState<string | null>(null)
  useEffect(() => {
    QRCode.toDataURL(value, { width: 480, margin: 1, color: { dark: '#252923', light: '#ffffff' } }).then(setSrc)
  }, [value])
  return src ? (
    <img src={src} alt="Your check-in QR code" className="h-56 w-56 rounded-lg" />
  ) : (
    <div className="h-56 w-56 animate-pulse rounded-lg bg-stone-100" />
  )
}
