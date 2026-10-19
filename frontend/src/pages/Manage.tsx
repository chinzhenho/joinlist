import { Camera, CameraOff, Check, Copy, Download, ExternalLink, Pencil, Search, Users, X } from 'lucide-react'
import QrScanner from 'qr-scanner'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api, ApiError, type Attendee, type EventView } from '../api'
import { useFeedback, usePageTitle } from '../feedback'
import { formatDateTime, formatTime } from '../format'
import { BackLink, Button, Card, Empty, ErrorNote, inputClass, Loading, PhaseBadge, StatusBadge } from '../ui'
import { useLive } from '../live'
import { useLoad } from '../useLoad'
import { SpotsLine } from './Events'

const linkButton =
  'inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-xl border border-line bg-white px-3 text-sm font-semibold whitespace-nowrap shadow-sm hover:bg-paper'

/** Organiser view of one event: publish/cancel, attendee list, CSV, and check-in at the door. */
export default function Manage() {
  const id = Number(useParams().id)
  const event = useLoad(() => api.event(id), [id])
  const people = useLoad(() => api.attendees(id), [id])
  useLive(
    () => {
      event.refresh()
      people.refresh()
    },
    (ids) => ids.has(id),
  )
  usePageTitle(event.data ? `Manage · ${event.data.title}` : 'Manage event')

  if (event.loading && !event.data) return <Loading />
  if (event.error)
    return (
      <div className="mx-auto max-w-md">
        <BackLink fallback="/organize" label="Your events" />
        <ErrorNote message={event.error.message} onRetry={event.reload} />
      </div>
    )
  if (!event.data) return null
  const e = event.data
  if (!e.isOrganizer)
    return (
      <div className="mx-auto max-w-md">
        <BackLink fallback="/" />
        <ErrorNote message="Only the organiser can manage this event." />
      </div>
    )

  const refresh = () => {
    event.reload()
    people.reload()
  }
  const canCheckIn = e.status === 'PUBLISHED' && e.phase !== 'ended'

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <BackLink fallback="/organize" label="Your events" />
      <div>
        <PhaseBadge phase={e.phase} />
        <h1 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">{e.title}</h1>
        <p className="mt-1 text-[15px] text-muted">
          {formatDateTime(e.startsAt)} · {e.location}
        </p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Stat label="Confirmed" value={`${e.confirmedCount}/${e.capacity}`} />
        <Stat label="Waitlist" value={String(e.waitlistCount)} />
        <Stat label="Checked in" value={people.data ? String(people.data.filter((p) => p.checkedInAt).length) : '–'} />
      </div>

      <Card className="space-y-3">
        <SpotsLine event={e} />
        <EventActions event={e} onChange={(updated) => event.setData(updated)} />
      </Card>

      {canCheckIn && <CheckInBox eventId={e.id} onCheckedIn={refresh} />}

      <PeopleCard event={e} people={people.data} loading={people.loading} error={people.error} onRetry={people.reload} onChange={refresh} canCheckIn={canCheckIn} />
    </div>
  )
}

function EventActions({ event: e, onChange }: { event: EventView; onChange: (e: EventView) => void }) {
  const { confirm, toast } = useFeedback()
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function run(name: string, fn: () => Promise<EventView>, done: string) {
    setBusy(name)
    setError(null)
    try {
      onChange(await fn())
      toast(done)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong.')
    } finally {
      setBusy(null)
    }
  }

  const publicUrl = `${location.origin}/events/${e.id}`

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {e.status === 'DRAFT' && (
          <Button
            busy={busy === 'publish'}
            className="flex-1 px-3 text-sm"
            onClick={async () => {
              const ok = await confirm({
                title: 'Publish this event?',
                message: 'Anyone with the link can see it, and people can register once registration opens.',
                confirmLabel: 'Publish',
                cancelLabel: 'Not yet',
              })
              if (ok) run('publish', () => api.publishEvent(e.id), 'Published. Share the link to get sign-ups.')
            }}
          >
            Publish
          </Button>
        )}
        {e.status !== 'CANCELLED' && e.phase !== 'ended' && (
          <Link to={`/organize/${e.id}/edit`} className={linkButton}>
            <Pencil size={16} aria-hidden /> Edit
          </Link>
        )}
        {e.status === 'PUBLISHED' && (
          <>
            <button
              className={linkButton}
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(publicUrl)
                  toast('Link copied. Paste it in your group chat.')
                } catch {
                  toast(publicUrl)
                }
              }}
            >
              <Copy size={16} aria-hidden /> Copy link
            </button>
            <Link to={`/events/${e.id}`} className={linkButton}>
              <ExternalLink size={16} aria-hidden /> View
            </Link>
          </>
        )}
        {e.status !== 'CANCELLED' && e.phase !== 'ended' && (
          <Button
            variant="danger"
            busy={busy === 'cancel'}
            className="flex-1 px-3 text-sm"
            onClick={async () => {
              const ok = await confirm({
                title: 'Cancel this event?',
                message:
                  e.status === 'DRAFT'
                    ? 'Nobody has seen it yet. It will be marked as cancelled.'
                    : 'Registration stops and everyone who registered or is waiting gets an email. This cannot be undone.',
                confirmLabel: 'Cancel event',
                cancelLabel: 'Keep it',
                danger: true,
              })
              if (ok) run('cancel', () => api.cancelEvent(e.id), 'Event cancelled')
            }}
          >
            Cancel event
          </Button>
        )}
      </div>
      {e.status === 'DRAFT' && <p className="text-xs text-muted">Only you can see a draft. Publish it to let people register.</p>}
      {e.status === 'CANCELLED' && <p className="text-xs text-muted">This event was cancelled. The list below is kept for your records.</p>}
      {error && <ErrorNote message={error} />}
    </>
  )
}

function PeopleCard({
  event: e,
  people,
  loading,
  error,
  onRetry,
  onChange,
  canCheckIn,
}: {
  event: EventView
  people: Attendee[] | null
  loading: boolean
  error: ApiError | null
  onRetry: () => void
  onChange: () => void
  canCheckIn: boolean
}) {
  const { toast } = useFeedback()
  return (
    <Card className="p-0">
      <div className="flex items-center justify-between border-b border-line px-5 py-3">
        <h2 className="font-semibold">People</h2>
        <button
          onClick={() => api.downloadAttendeesCsv(e.id).catch((err) => toast(err.message, 'error'))}
          className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm font-medium text-brand hover:bg-brand-soft"
          disabled={!people || people.length === 0}
        >
          <Download size={16} aria-hidden /> Download CSV
        </button>
      </div>
      {loading && !people && <Loading />}
      {error && (
        <div className="p-4">
          <ErrorNote message={error.message} onRetry={onRetry} />
        </div>
      )}
      {people && <AttendeeList eventId={e.id} people={people} onChange={onChange} canCheckIn={canCheckIn} />}
    </Card>
  )
}

function AttendeeList({
  eventId,
  people,
  onChange,
  canCheckIn,
}: {
  eventId: number
  people: Attendee[]
  onChange: () => void
  canCheckIn: boolean
}) {
  const { confirm, toast } = useFeedback()
  const [tab, setTab] = useState<'CONFIRMED' | 'WAITLISTED' | 'CANCELLED'>('CONFIRMED')
  const [query, setQuery] = useState('')
  const [busyId, setBusyId] = useState<number | null>(null)

  const q = query.trim().toLowerCase()
  const inTab = people.filter((p) => p.status === tab)
  const shown = q ? inTab.filter((p) => p.name.toLowerCase().includes(q) || p.email.toLowerCase().includes(q)) : inTab
  const count = (s: string) => people.filter((p) => p.status === s).length
  const checkedIn = people.filter((p) => p.checkedInAt).length

  async function checkInByHand(p: Attendee) {
    const ok = await confirm({
      title: `Check in ${p.name}?`,
      message: 'Use this when their QR code can’t be scanned, for example if their phone is dead.',
      confirmLabel: 'Check in',
    })
    if (!ok) return
    setBusyId(p.registrationId)
    try {
      await api.checkInByHand(eventId, p.registrationId)
      toast(`${p.name} is checked in`)
      onChange()
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Something went wrong.', 'error')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2">
        <div className="flex gap-1 text-sm" role="tablist">
          {(['CONFIRMED', 'WAITLISTED', 'CANCELLED'] as const).map((s) => (
            <button
              key={s}
              role="tab"
              aria-selected={tab === s}
              onClick={() => setTab(s)}
              className={`rounded-lg px-3 py-1.5 font-medium ${tab === s ? 'bg-brand-soft text-brand' : 'text-muted hover:text-ink'}`}
            >
              {s === 'CONFIRMED' ? 'Confirmed' : s === 'WAITLISTED' ? 'Waitlist' : 'Cancelled'} ({count(s)})
            </button>
          ))}
        </div>
        {people.length > 0 && (
          <label className="relative ml-auto w-full sm:w-56">
            <Search size={16} className="absolute top-1/2 left-3 -translate-y-1/2 text-muted" aria-hidden />
            <input
              className={`${inputClass} min-h-9 py-1.5 pl-9 text-sm`}
              value={query}
              onChange={(ev) => setQuery(ev.target.value)}
              placeholder="Search name or email"
              aria-label="Search people"
            />
          </label>
        )}
      </div>
      {tab === 'CONFIRMED' && count('CONFIRMED') > 0 && (
        <p className="px-5 pt-3 text-xs text-muted">
          {checkedIn} of {count('CONFIRMED')} checked in
        </p>
      )}
      {shown.length === 0 ? (
        <Empty icon={<Users size={28} />} title={q ? 'No one matches that search' : 'Nobody here yet'}>
          {!q && tab === 'CONFIRMED' && 'Share the event link to get sign-ups.'}
        </Empty>
      ) : (
        <ul className="divide-y divide-line">
          {shown.map((p) => (
            <li key={p.registrationId} className="flex items-center gap-3 px-5 py-3">
              {tab === 'WAITLISTED' && (
                <span className="w-7 text-sm text-muted">#{inTab.indexOf(p) + 1}</span>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{p.name}</p>
                <p className="truncate text-xs text-muted">{p.email}</p>
              </div>
              {p.checkedInAt ? (
                <span className="flex items-center gap-1 text-xs font-semibold text-brand">
                  <Check size={14} aria-hidden /> {formatTime(p.checkedInAt)}
                </span>
              ) : tab === 'CONFIRMED' && canCheckIn ? (
                <Button
                  variant="secondary"
                  className="min-h-9 px-3 text-sm"
                  busy={busyId === p.registrationId}
                  onClick={() => checkInByHand(p)}
                >
                  Check in
                </Button>
              ) : (
                <StatusBadge status={p.status} />
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  )
}

type ScanResult = { ok: boolean; text: string }

function CheckInBox({ eventId, onCheckedIn }: { eventId: number; onCheckedIn: () => void }) {
  const [scanning, setScanning] = useState(false)
  const [manual, setManual] = useState('')
  const [result, setResult] = useState<ScanResult | null>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const lastScan = useRef<{ token: string; at: number }>({ token: '', at: 0 })

  async function checkIn(token: string) {
    const now = Date.now()
    // The camera reads the same code many times a second; only send it once every few seconds.
    if (token === lastScan.current.token && now - lastScan.current.at < 4000) return
    lastScan.current = { token, at: now }
    try {
      const res = await api.checkIn(eventId, token.trim())
      setResult({ ok: true, text: `${res.name} is checked in.` })
      navigator.vibrate?.(80)
      onCheckedIn()
    } catch (err) {
      setResult({ ok: false, text: err instanceof ApiError ? err.message : 'Something went wrong.' })
    }
  }

  useEffect(() => {
    if (!scanning || !videoRef.current) return
    const scanner = new QrScanner(videoRef.current, (r) => checkIn(r.data), {
      highlightScanRegion: true,
      returnDetailedScanResult: true,
    })
    scanner.start().catch(() => {
      setResult({ ok: false, text: "Can't open the camera. Allow camera access, or type the code below." })
      setScanning(false)
    })
    return () => {
      scanner.stop()
      scanner.destroy()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scanning])

  function submitManual(e: FormEvent) {
    e.preventDefault()
    if (manual.trim()) {
      lastScan.current = { token: '', at: 0 }
      checkIn(manual)
      setManual('')
    }
  }

  return (
    <Card className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold">Check in at the door</h2>
          <p className="text-xs text-muted">Scan each person's QR code. A code only works once.</p>
        </div>
        <Button
          variant={scanning ? 'secondary' : 'primary'}
          onClick={() => setScanning(!scanning)}
          className="min-h-9 shrink-0 px-3 text-sm"
        >
          {scanning ? <CameraOff size={16} aria-hidden /> : <Camera size={16} aria-hidden />}
          {scanning ? 'Stop' : 'Scan QR'}
        </Button>
      </div>
      {scanning && <video ref={videoRef} className="aspect-square w-full rounded-xl bg-black object-cover" muted playsInline />}
      {result && (
        <div
          className={`flex items-center gap-2 rounded-xl p-3 text-[15px] font-medium ${
            result.ok ? 'bg-brand-soft text-brand' : 'bg-red-50 text-red-800'
          }`}
          role="status"
        >
          {result.ok ? <Check size={18} aria-hidden /> : <X size={18} aria-hidden />}
          {result.text}
        </div>
      )}
      <form onSubmit={submitManual} className="flex gap-2">
        <input
          className={`${inputClass} font-mono uppercase tracking-widest placeholder:font-sans placeholder:normal-case placeholder:tracking-normal`}
          value={manual}
          onChange={(e) => setManual(e.target.value)}
          placeholder="Or type their code, e.g. 8K3F-7QPA"
          aria-label="Check-in code"
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
        />
        <Button type="submit" variant="secondary" className="shrink-0">
          Check in
        </Button>
      </form>
    </Card>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-line bg-white px-4 py-3 shadow-[0_1px_2px_rgba(37,41,35,0.04)]">
      <p className="text-xs font-semibold tracking-wide text-muted uppercase">{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums">{value}</p>
    </div>
  )
}
