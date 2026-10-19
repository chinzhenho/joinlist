import { Camera, CameraOff, Check, ChevronLeft, Download, ExternalLink, Pencil, Users, X } from 'lucide-react'
import QrScanner from 'qr-scanner'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api, ApiError, type Attendee, type EventView } from '../api'
import { formatDateTime, formatTime } from '../format'
import { Button, Card, Empty, ErrorNote, inputClass, Loading, PhaseBadge, StatusBadge } from '../ui'
import { useLoad } from '../useLoad'
import { SpotsLine } from './Events'

/** Organizer view of one event: publish/cancel, attendee list, CSV, and check-in at the door. */
export default function Manage() {
  const id = Number(useParams().id)
  const event = useLoad(() => api.event(id), [id])
  const people = useLoad(() => api.attendees(id), [id])

  if (event.loading && !event.data) return <Loading />
  if (event.error) return <ErrorNote message={event.error.message} onRetry={event.reload} />
  if (!event.data) return null
  const e = event.data
  if (!e.isOrganizer) return <ErrorNote message="Only the organizer can manage this event." />

  const refresh = () => {
    event.reload()
    people.reload()
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Link to="/organize" className="inline-flex items-center gap-1 text-sm font-medium text-muted hover:text-ink">
        <ChevronLeft size={16} aria-hidden /> Your events
      </Link>
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

      {e.status === 'PUBLISHED' && e.phase !== 'ended' && <CheckInBox eventId={e.id} onCheckedIn={refresh} />}

      <Card className="p-0">
        <div className="flex items-center justify-between border-b border-line px-5 py-3">
          <h2 className="font-semibold">People</h2>
          <button
            onClick={() => api.downloadAttendeesCsv(e.id).catch((err) => alert(err.message))}
            className="flex items-center gap-1.5 text-sm font-medium text-brand"
          >
            <Download size={16} aria-hidden /> CSV
          </button>
        </div>
        {people.loading && !people.data && <Loading />}
        {people.error && (
          <div className="p-4">
            <ErrorNote message={people.error.message} onRetry={people.reload} />
          </div>
        )}
        {people.data && <AttendeeList people={people.data} />}
      </Card>
    </div>
  )
}

function EventActions({ event: e, onChange }: { event: EventView; onChange: (e: EventView) => void }) {
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function run(name: string, fn: () => Promise<EventView>) {
    setBusy(name)
    setError(null)
    try {
      onChange(await fn())
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong.')
    } finally {
      setBusy(null)
    }
  }

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {e.status === 'DRAFT' && (
          <Button busy={busy === 'publish'} onClick={() => run('publish', () => api.publishEvent(e.id))} className="flex-1 px-3 text-sm">
            Publish
          </Button>
        )}
        {e.status !== 'CANCELLED' && (
          <Link
            to={`/organize/${e.id}/edit`}
            className="inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-xl border border-line bg-white px-3 text-sm font-semibold whitespace-nowrap hover:bg-paper"
          >
            <Pencil size={16} aria-hidden /> Edit
          </Link>
        )}
        {e.status === 'PUBLISHED' && (
          <Link
            to={`/events/${e.id}`}
            className="inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-xl border border-line bg-white px-3 text-sm font-semibold whitespace-nowrap hover:bg-paper"
          >
            <ExternalLink size={16} aria-hidden /> View
          </Link>
        )}
        {e.status !== 'CANCELLED' && (
          <Button
            variant="danger"
            busy={busy === 'cancel'}
            className="flex-1 px-3 text-sm"
            onClick={() => {
              if (confirm('Cancel this event? Everyone registered or waiting will get an email. This cannot be undone.')) {
                run('cancel', () => api.cancelEvent(e.id))
              }
            }}
          >
            Cancel event
          </Button>
        )}
      </div>
      {e.status === 'DRAFT' && <p className="text-xs text-muted">Only you can see a draft. Publish it to let people register.</p>}
      {error && <ErrorNote message={error} />}
    </>
  )
}

function AttendeeList({ people }: { people: Attendee[] }) {
  const [tab, setTab] = useState<'CONFIRMED' | 'WAITLISTED' | 'CANCELLED'>('CONFIRMED')
  const shown = people.filter((p) => p.status === tab)
  const count = (s: string) => people.filter((p) => p.status === s).length
  const checkedIn = people.filter((p) => p.checkedInAt).length

  return (
    <>
      <div className="flex gap-1 border-b border-line px-3 py-2 text-sm" role="tablist">
        {(['CONFIRMED', 'WAITLISTED', 'CANCELLED'] as const).map((s) => (
          <button
            key={s}
            role="tab"
            aria-selected={tab === s}
            onClick={() => setTab(s)}
            className={`rounded-lg px-3 py-1.5 font-medium ${tab === s ? 'bg-brand-soft text-brand' : 'text-muted'}`}
          >
            {s === 'CONFIRMED' ? 'Confirmed' : s === 'WAITLISTED' ? 'Waitlist' : 'Cancelled'} ({count(s)})
          </button>
        ))}
      </div>
      {tab === 'CONFIRMED' && count('CONFIRMED') > 0 && (
        <p className="px-5 pt-3 text-xs text-muted">
          {checkedIn} of {count('CONFIRMED')} checked in
        </p>
      )}
      {shown.length === 0 ? (
        <Empty icon={<Users size={28} />} title="Nobody here yet" />
      ) : (
        <ul className="divide-y divide-line">
          {shown.map((p, i) => (
            <li key={p.registrationId} className="flex items-center gap-3 px-5 py-3">
              {tab === 'WAITLISTED' && <span className="w-6 text-sm text-muted">#{i + 1}</span>}
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{p.name}</p>
                <p className="truncate text-xs text-muted">{p.email}</p>
              </div>
              {p.checkedInAt ? (
                <span className="flex items-center gap-1 text-xs font-semibold text-brand">
                  <Check size={14} aria-hidden /> {formatTime(p.checkedInAt)}
                </span>
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
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">Check in at the door</h2>
        <Button variant={scanning ? 'secondary' : 'primary'} onClick={() => setScanning(!scanning)} className="min-h-9 px-3 text-sm">
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
          className={inputClass}
          value={manual}
          onChange={(e) => setManual(e.target.value)}
          placeholder="Or type the code"
          aria-label="Check-in code"
        />
        <Button type="submit" variant="secondary">
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
