import { CalendarClock, Check, Clock, Copy, MapPin, Settings2, Users } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api, ApiError, type EventView } from '../api'
import { useAuth } from '../auth'
import { formatDateTime } from '../format'
import { Button, Card, ErrorNote, Loading, PhaseBadge, StatusBadge } from '../ui'
import { useLoad } from '../useLoad'
import { SpotsLine } from './Events'

export default function EventDetail() {
  const id = Number(useParams().id)
  const { user } = useAuth()
  const { data: event, error, loading, reload, setData } = useLoad(() => api.event(id), [id, user?.id])

  if (loading && !event) return <Loading />
  if (error) return <ErrorNote message={error.status === 404 ? "This event doesn't exist." : error.message} onRetry={reload} />
  if (!event) return null

  return (
    <div className="space-y-4">
      <div>
        <PhaseBadge phase={event.phase} />
        <h1 className="mt-2 text-2xl font-bold tracking-tight">{event.title}</h1>
      </div>

      <Card className="space-y-3 text-[15px]">
        <p className="flex items-center gap-2.5">
          <CalendarClock size={18} className="text-muted" aria-hidden /> {formatDateTime(event.startsAt)}
        </p>
        <p className="flex items-center gap-2.5">
          <MapPin size={18} className="text-muted" aria-hidden /> {event.location}
        </p>
        <p className="flex items-center gap-2.5 text-muted">
          <Clock size={18} aria-hidden /> Registration {formatDateTime(event.registrationOpensAt)} –{' '}
          {formatDateTime(event.registrationClosesAt)}
        </p>
        <SpotsLine event={event} />
      </Card>

      <JoinBox event={event} onChange={setData} reload={reload} />

      {event.description && (
        <Card>
          <h2 className="mb-2 font-semibold">About</h2>
          <p className="text-[15px] whitespace-pre-line text-ink/90">{event.description}</p>
        </Card>
      )}

      <ShareLink />

      {event.isOrganizer && (
        <Link
          to={`/organize/${event.id}`}
          className="flex items-center justify-center gap-2 rounded-xl border border-line bg-white py-3 text-sm font-semibold hover:bg-paper"
        >
          <Settings2 size={16} aria-hidden /> Manage this event
        </Link>
      )}
    </div>
  )
}

function JoinBox({ event, onChange, reload }: { event: EventView; onChange: (e: EventView) => void; reload: () => void }) {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const mine = event.myRegistration

  async function act(fn: () => Promise<unknown>) {
    setBusy(true)
    setError(null)
    try {
      await fn()
      onChange(await api.event(event.id))
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Something went wrong.')
      reload()
    } finally {
      setBusy(false)
    }
  }

  if (event.phase === 'cancelled') {
    return <Notice tone="red">This event was cancelled by the organizer.</Notice>
  }

  if (mine) {
    return (
      <Card className="space-y-3">
        <div className="flex items-center justify-between">
          <StatusBadge status={mine.status} forMe />
          {mine.checkedInAt && (
            <span className="flex items-center gap-1 text-sm text-brand">
              <Check size={16} aria-hidden /> Checked in
            </span>
          )}
        </div>
        <p className="text-[15px]">
          {mine.status === 'CONFIRMED'
            ? 'You have a spot. Show your QR code at the door.'
            : `You're #${mine.waitlistPosition} on the waitlist. If someone cancels, you'll get their spot and an email.`}
        </p>
        <div className="flex flex-wrap gap-2">
          {mine.status === 'CONFIRMED' && (
            <Button onClick={() => navigate('/my')} className="flex-1">
              Show my QR code
            </Button>
          )}
          {event.phase !== 'ended' && (
            <Button
              variant="danger"
              busy={busy}
              className="flex-1"
              onClick={() => {
                if (confirm(mine.status === 'CONFIRMED' ? 'Give up your spot?' : 'Leave the waitlist?')) {
                  act(() => api.leave(mine.id))
                }
              }}
            >
              {mine.status === 'CONFIRMED' ? 'Cancel my spot' : 'Leave waitlist'}
            </Button>
          )}
        </div>
        {error && <ErrorNote message={error} />}
      </Card>
    )
  }

  if (event.phase === 'upcoming') return <Notice>Registration opens {formatDateTime(event.registrationOpensAt)}.</Notice>
  if (event.phase === 'closed' || event.phase === 'ended') return <Notice>Registration has closed.</Notice>
  if (event.phase === 'draft') return <Notice>This is a draft. Publish it so people can register.</Notice>

  const full = event.spotsLeft === 0
  return (
    <div className="space-y-2">
      <Button
        className="w-full"
        busy={busy}
        onClick={() => (user ? act(() => api.join(event.id)) : navigate('/login', { state: { from: `/events/${event.id}` } }))}
      >
        <Users size={18} aria-hidden /> {full ? 'Join the waitlist' : 'Register'}
      </Button>
      {full && <p className="text-center text-xs text-muted">It's full right now. You'll get a spot automatically if someone cancels.</p>}
      {error && <ErrorNote message={error} />}
    </div>
  )
}

function Notice({ children, tone = 'muted' }: { children: React.ReactNode; tone?: 'muted' | 'red' }) {
  const look = tone === 'red' ? 'border-red-200 bg-red-50 text-red-800' : 'border-line bg-stone-50 text-muted'
  return <div className={`rounded-xl border p-4 text-center text-[15px] ${look}`}>{children}</div>
}

function ShareLink() {
  const [copied, setCopied] = useState(false)
  return (
    <button
      onClick={async () => {
        try {
          if (navigator.share) await navigator.share({ url: location.href })
          else {
            await navigator.clipboard.writeText(location.href)
            setCopied(true)
            setTimeout(() => setCopied(false), 2000)
          }
        } catch {
          // Share sheet closed: nothing to do.
        }
      }}
      className="flex w-full items-center justify-center gap-2 py-2 text-sm font-medium text-muted hover:text-ink"
    >
      {copied ? <Check size={16} aria-hidden /> : <Copy size={16} aria-hidden />}
      {copied ? 'Link copied' : 'Share this event'}
    </button>
  )
}
