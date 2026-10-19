import { CalendarClock, CalendarPlus, Check, Clock, Copy, MapPin, Navigation, Settings2, Users } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api, ApiError, type EventView } from '../api'
import { useAuth } from '../auth'
import { downloadIcs, mapsUrl } from '../calendar'
import { useFeedback, usePageTitle } from '../feedback'
import { formatDateTime } from '../format'
import { BackLink, Button, buttonClass, Card, ErrorNote, Loading, PhaseBadge, StatusBadge } from '../ui'
import { useLive } from '../live'
import { useLoad } from '../useLoad'
import { SpotsLine } from './Events'

export default function EventDetail() {
  const id = Number(useParams().id)
  const { user } = useAuth()
  const { data: event, error, loading, reload, refresh, setData } = useLoad(() => api.event(id), [id, user?.id])
  useLive(refresh, (ids) => ids.has(id))
  usePageTitle(event?.title ?? (error ? 'Event not found' : null))

  if (loading && !event) return <Loading />
  if (error)
    return (
      <div className="mx-auto max-w-md py-10 text-center">
        <BackLink fallback="/" label="All events" />
        <ErrorNote
          message={error.status === 404 ? "This event doesn't exist, or it hasn't been published yet." : error.message}
          onRetry={error.status === 404 ? undefined : reload}
        />
      </div>
    )
  if (!event) return null

  const live = event.phase !== 'cancelled' && event.phase !== 'ended'

  return (
    <div>
      <BackLink fallback="/" label="All events" />

      <div className="grid gap-6 lg:grid-cols-[1fr_340px] lg:items-start">
        <div className="space-y-5">
          <div className="rounded-3xl border border-line bg-gradient-to-br from-brand-soft/70 via-white to-white p-6 sm:p-8">
            <PhaseBadge phase={event.phase} />
            <h1 className="mt-3 text-3xl font-bold tracking-tight text-balance sm:text-4xl">{event.title}</h1>
            <dl className="mt-6 grid gap-4 text-[15px] sm:grid-cols-2">
              <Fact icon={<CalendarClock size={18} />} label="When" value={formatDateTime(event.startsAt)} />
              <Fact icon={<MapPin size={18} />} label="Where" value={event.location} />
              <Fact
                icon={<Clock size={18} />}
                label="Registration"
                value={`${formatDateTime(event.registrationOpensAt)} – ${formatDateTime(event.registrationClosesAt)}`}
              />
              <Fact
                icon={<Users size={18} />}
                label="Spots"
                value={
                  event.spotsLeft === 0
                    ? `Full · ${event.waitlistCount} waiting`
                    : `${event.spotsLeft} of ${event.capacity} left`
                }
              />
            </dl>
            {live && (
              <div className="mt-6 flex flex-wrap gap-2">
                <button onClick={() => downloadIcs(event)} className={`${buttonClass.secondary} min-h-10 text-sm`}>
                  <CalendarPlus size={16} aria-hidden /> Add to calendar
                </button>
                <a
                  href={mapsUrl(event.location)}
                  target="_blank"
                  rel="noreferrer"
                  className={`${buttonClass.secondary} min-h-10 text-sm`}
                >
                  <Navigation size={16} aria-hidden /> Open in Maps
                </a>
              </div>
            )}
          </div>

          <Card className="p-6">
            <h2 className="mb-2 text-lg font-semibold">About this event</h2>
            {event.description ? (
              <p className="text-[15px] leading-relaxed whitespace-pre-line text-ink/90">{event.description}</p>
            ) : (
              <p className="text-[15px] text-muted">The organiser hasn't added a description.</p>
            )}
          </Card>
        </div>

        <aside className="space-y-3 lg:sticky lg:top-24">
          <Card className="space-y-4">
            <SpotsLine event={event} />
            <JoinBox event={event} onChange={setData} reload={reload} />
          </Card>
          <ShareLink />
          {event.isOrganizer && (
            <Link
              to={`/organize/${event.id}`}
              className="flex items-center justify-center gap-2 rounded-xl border border-line bg-white py-3 text-sm font-semibold shadow-sm hover:bg-paper"
            >
              <Settings2 size={16} aria-hidden /> Manage this event
            </Link>
          )}
        </aside>
      </div>
    </div>
  )
}

function JoinBox({ event, onChange, reload }: { event: EventView; onChange: (e: EventView) => void; reload: () => void }) {
  const { user } = useAuth()
  const { confirm, toast } = useFeedback()
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const mine = event.myRegistration

  async function act(fn: () => Promise<unknown>, done: (e: EventView) => string) {
    setBusy(true)
    setError(null)
    try {
      await fn()
      const updated = await api.event(event.id)
      onChange(updated)
      toast(done(updated))
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Something went wrong.')
      reload()
    } finally {
      setBusy(false)
    }
  }

  if (event.phase === 'cancelled') {
    return <Notice tone="red">This event was cancelled by the organiser.</Notice>
  }

  if (mine) {
    const confirmed = mine.status === 'CONFIRMED'
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <StatusBadge status={mine.status} forMe />
          {mine.checkedInAt && (
            <span className="flex items-center gap-1 text-sm text-brand">
              <Check size={16} aria-hidden /> Checked in
            </span>
          )}
        </div>
        <p className="text-[15px]">
          {confirmed
            ? 'You have a spot. Show your QR code at the door.'
            : `You're #${mine.waitlistPosition} on the waitlist. If someone cancels, you'll get their spot and an email.`}
        </p>
        <div className="flex flex-col gap-2">
          {confirmed && (
            <Button onClick={() => navigate('/my')} className="w-full">
              Show my QR code
            </Button>
          )}
          {event.phase !== 'ended' && !mine.checkedInAt && (
            <Button
              variant="danger"
              busy={busy}
              className="w-full"
              onClick={async () => {
                const ok = await confirm(
                  confirmed
                    ? {
                        title: 'Give up your spot?',
                        message:
                          'Your spot goes to the next person on the waitlist straight away. If you change your mind, you may have to wait.',
                        confirmLabel: 'Give up my spot',
                        cancelLabel: 'Keep my spot',
                        danger: true,
                      }
                    : {
                        title: 'Leave the waitlist?',
                        message: 'You will lose your place in line.',
                        confirmLabel: 'Leave waitlist',
                        cancelLabel: 'Stay',
                        danger: true,
                      },
                )
                if (ok) act(() => api.leave(mine.id), () => (confirmed ? 'Your spot was cancelled' : 'You left the waitlist'))
              }}
            >
              {confirmed ? 'Cancel my spot' : 'Leave waitlist'}
            </Button>
          )}
        </div>
        {error && <ErrorNote message={error} />}
      </div>
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
        onClick={() =>
          user
            ? act(
                () => api.join(event.id),
                (e) =>
                  e.myRegistration?.status === 'CONFIRMED'
                    ? "You're in! Your QR code is in My registrations."
                    : `You're #${e.myRegistration?.waitlistPosition} on the waitlist`,
              )
            : navigate('/login', { state: { from: `/events/${event.id}` } })
        }
      >
        <Users size={18} aria-hidden /> {full ? 'Join the waitlist' : 'Register'}
      </Button>
      <p className="text-center text-xs text-muted">
        {!user
          ? "You'll be asked to log in or sign up first."
          : full
            ? "It's full right now. You'll get a spot automatically if someone cancels."
            : `Free. Registration closes ${formatDateTime(event.registrationClosesAt)}.`}
      </p>
      {error && <ErrorNote message={error} />}
    </div>
  )
}

function Notice({ children, tone = 'muted' }: { children: ReactNode; tone?: 'muted' | 'red' }) {
  const look = tone === 'red' ? 'border-red-200 bg-red-50 text-red-800' : 'border-line bg-stone-50 text-muted'
  return <div className={`rounded-xl border p-4 text-center text-[15px] ${look}`}>{children}</div>
}

function ShareLink() {
  const { toast } = useFeedback()
  return (
    <button
      onClick={async () => {
        try {
          if (navigator.share) await navigator.share({ url: location.href })
          else {
            await navigator.clipboard.writeText(location.href)
            toast('Link copied')
          }
        } catch {
          // Share sheet closed: nothing to do.
        }
      }}
      className="flex w-full items-center justify-center gap-2 py-2 text-sm font-medium text-muted hover:text-ink"
    >
      <Copy size={16} aria-hidden /> Share this event
    </button>
  )
}

function Fact({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="flex gap-3">
      <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-brand shadow-sm">
        {icon}
      </span>
      <div>
        <dt className="text-xs font-semibold tracking-wide text-muted uppercase">{label}</dt>
        <dd className="font-medium">{value}</dd>
      </div>
    </div>
  )
}
