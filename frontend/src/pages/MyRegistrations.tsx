import { Check, MapPin, Ticket } from 'lucide-react'
import QRCode from 'qrcode'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, type MyRegistrationItem } from '../api'
import { formatDateTime } from '../format'
import { Card, Empty, ErrorNote, Loading, PhaseBadge, StatusBadge } from '../ui'
import { useLoad } from '../useLoad'

export default function MyRegistrations() {
  const { data, error, loading, reload } = useLoad(api.myRegistrations, [])

  return (
    <>
      <h1 className="mb-5 text-2xl font-bold tracking-tight">My registrations</h1>
      {loading && !data && <Loading />}
      {error && <ErrorNote message={error.message} onRetry={reload} />}
      {data && data.length === 0 && (
        <Empty icon={<Ticket size={32} />} title="You haven't registered for anything yet">
          <Link to="/" className="font-semibold text-brand">
            Browse events
          </Link>
        </Empty>
      )}
      <ul className="space-y-3">
        {data?.map((item) => (
          <li key={item.registration.id}>
            <RegistrationCard item={item} />
          </li>
        ))}
      </ul>
    </>
  )
}

function RegistrationCard({ item }: { item: MyRegistrationItem }) {
  const reg = item.registration
  const live = item.eventPhase !== 'cancelled' && item.eventPhase !== 'ended'
  return (
    <Card>
      <div className="flex items-start justify-between gap-2">
        <Link to={`/events/${item.eventId}`} className="font-semibold hover:underline">
          {item.eventTitle}
        </Link>
        {live ? <StatusBadge status={reg.status} forMe /> : <PhaseBadge phase={item.eventPhase} />}
      </div>
      <p className="mt-1 text-sm text-muted">{formatDateTime(item.eventStartsAt)}</p>
      <p className="flex items-center gap-1 text-sm text-muted">
        <MapPin size={14} aria-hidden /> {item.eventLocation}
      </p>

      {reg.status === 'WAITLISTED' && live && (
        <p className="mt-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
          You're #{reg.waitlistPosition} on the waitlist. We'll email you if a spot opens.
        </p>
      )}

      {reg.status === 'CONFIRMED' && live && reg.qrToken && (
        <div className="mt-4 flex flex-col items-center border-t border-line pt-4">
          {reg.checkedInAt ? (
            <p className="flex items-center gap-1.5 py-6 font-semibold text-brand">
              <Check size={20} aria-hidden /> Checked in at {formatDateTime(reg.checkedInAt)}
            </p>
          ) : (
            <>
              <QrImage value={reg.qrToken} />
              <p className="mt-2 text-xs text-muted">Show this at the door. Turn up your screen brightness.</p>
            </>
          )}
        </div>
      )}
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
    <div className="h-56 w-56 rounded-lg bg-stone-100" />
  )
}
