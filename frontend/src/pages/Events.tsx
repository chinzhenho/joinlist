import { ArrowRight, CalendarX, Clock, ListOrdered, MapPin, Plus, QrCode, ShieldCheck, Users } from 'lucide-react'
import { Link } from 'react-router-dom'
import { api, type EventView } from '../api'
import { useAuth } from '../auth'
import { formatTime } from '../format'
import { buttonClass, Empty, ErrorNote, Loading, PageHeader, PhaseBadge } from '../ui'
import { usePageTitle } from '../feedback'
import { useLoad } from '../useLoad'

export default function Events() {
  const { user } = useAuth()
  usePageTitle(null)
  const { data, error, loading, reload } = useLoad(api.events, [])

  return (
    <>
      {!user && <Hero />}

      <section id="events" className="scroll-mt-24">
        <PageHeader
          title="Upcoming events"
          subtitle="Grab a spot. If it's full, join the waitlist."
          action={
            user && (
              <Link to="/organize/new" className={buttonClass.primary}>
                <Plus size={18} aria-hidden /> Create event
              </Link>
            )
          }
        />

        {loading && !data && <Loading />}
        {error && <ErrorNote message={error.message} onRetry={reload} />}
        {data && data.length === 0 && (
          <div className="rounded-2xl border border-dashed border-line bg-white/60">
            <Empty icon={<CalendarX size={32} />} title="No upcoming events yet">
              {user ? (
                <Link to="/organize/new" className="font-semibold text-brand">
                  Create the first one
                </Link>
              ) : (
                'Check back soon, or create your own.'
              )}
            </Empty>
          </div>
        )}
        {data && data.length > 0 && (
          <ul className="grid gap-4 md:grid-cols-2">
            {data.map((e) => (
              <li key={e.id}>
                <EventCard event={e} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  )
}

function Hero() {
  return (
    <section className="mb-16">
      <div className="grid items-center gap-10 py-4 md:grid-cols-[1.1fr_1fr] md:py-10">
        <div>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-brand/15 bg-brand-soft px-3 py-1 text-xs font-semibold text-brand">
            <span className="h-1.5 w-1.5 rounded-full bg-brand" aria-hidden /> Free for clubs, workshops and talks
          </span>
          <h1 className="mt-5 text-4xl leading-[1.1] font-bold tracking-tight text-balance sm:text-5xl">
            Event sign-ups that never overbook.
          </h1>
          <p className="mt-5 max-w-lg text-lg leading-relaxed text-muted">
            Set a seat limit and share one link. When it fills up, people join a waitlist. When someone cancels, the
            next person gets the spot automatically. At the door, scan their QR code.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link to="/login" state={{ mode: 'register', from: '/organize/new' }} className={buttonClass.primary}>
              Create an event <ArrowRight size={18} aria-hidden />
            </Link>
            <a href="#events" className={buttonClass.secondary}>
              Browse events
            </a>
          </div>
        </div>
        <HeroPreview />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Feature icon={<ShieldCheck size={20} />} title="Seat limits that hold">
          Even when hundreds of people click at the same second, nobody gets a seat that doesn't exist.
        </Feature>
        <Feature icon={<ListOrdered size={20} />} title="Automatic waitlist">
          Full? People wait in order. A cancelled spot goes straight to the next person, with an email.
        </Feature>
        <Feature icon={<QrCode size={20} />} title="QR check-in">
          Everyone with a spot gets a QR code. Scan it at the door with your phone. Each code works once.
        </Feature>
      </div>
      <p className="mt-6 text-center text-sm">
        <Link to="/how-it-works" className="font-semibold text-brand hover:underline">
          See how it works →
        </Link>
      </p>
    </section>
  )
}

function Feature({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-line bg-white p-5 shadow-[0_1px_2px_rgba(37,41,35,0.04)]">
      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-soft text-brand">{icon}</div>
      <h2 className="mt-4 font-semibold">{title}</h2>
      <p className="mt-1.5 text-sm leading-relaxed text-muted">{children}</p>
    </div>
  )
}

/** A drawing of the product (not live data), so first-time visitors see what they'll get. */
function HeroPreview() {
  return (
    <div className="relative mx-auto mb-8 w-full max-w-sm md:mb-0" aria-hidden>
      <div className="absolute -inset-6 -z-10 rounded-[2rem] bg-gradient-to-br from-brand-soft via-paper to-mint/30" />
      <div className="rounded-2xl border border-line bg-white p-5 shadow-xl shadow-brand/5">
        <div className="flex items-center justify-between">
          <span className="rounded-full bg-brand-soft px-2.5 py-0.5 text-xs font-semibold text-brand">Open</span>
          <span className="text-xs text-muted">Sat, 7:00 pm</span>
        </div>
        <p className="mt-3 text-lg font-bold">Intro to Git Workshop</p>
        <p className="mt-0.5 flex items-center gap-1 text-sm text-muted">
          <MapPin size={14} /> FCI Lab 2
        </p>
        <div className="mt-4 h-2 overflow-hidden rounded-full bg-stone-100">
          <div className="h-full w-full rounded-full bg-amber-500" />
        </div>
        <p className="mt-1.5 text-xs text-muted">Full · 12 waiting</p>
        <div className="mt-4 flex items-center gap-3 rounded-xl bg-brand-soft p-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand text-sm font-bold text-paper">
            A
          </span>
          <div className="text-sm">
            <p className="font-semibold text-brand">Aisyah got a spot</p>
            <p className="text-xs text-brand/80">Someone cancelled, so #1 on the waitlist moved in.</p>
          </div>
        </div>
      </div>
      <div className="absolute -right-3 -bottom-6 flex items-center gap-2 rounded-xl border border-line bg-white px-3 py-2 text-sm font-semibold shadow-lg sm:-right-8">
        <QrCode size={18} className="text-brand" /> Checked in
      </div>
    </div>
  )
}

export function EventCard({ event: e, to }: { event: EventView; to?: string }) {
  const start = new Date(e.startsAt)
  return (
    <Link
      to={to ?? `/events/${e.id}`}
      className="group flex h-full gap-4 rounded-2xl border border-line bg-white p-4 shadow-[0_1px_2px_rgba(37,41,35,0.04)] transition hover:-translate-y-0.5 hover:border-brand/30 hover:shadow-md sm:p-5"
    >
      <div className="flex w-14 shrink-0 flex-col items-center justify-center self-start rounded-xl border border-brand/10 bg-brand-soft py-2 text-brand">
        <span className="text-[11px] font-bold tracking-wide uppercase">
          {start.toLocaleDateString('en-MY', { month: 'short' })}
        </span>
        <span className="text-2xl leading-none font-bold">{start.getDate()}</span>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <h2 className="line-clamp-2 font-semibold group-hover:text-brand">{e.title}</h2>
          <PhaseBadge phase={e.phase} />
        </div>
        <div className="mt-1.5 space-y-0.5 text-sm text-muted">
          <p className="flex items-center gap-1.5 truncate">
            <Clock size={14} className="shrink-0" aria-hidden />
            {start.toLocaleDateString('en-MY', { weekday: 'short' })}, {formatTime(e.startsAt)}
          </p>
          <p className="flex items-center gap-1.5 truncate">
            <MapPin size={14} className="shrink-0" aria-hidden /> {e.location}
          </p>
        </div>
        <SpotsLine event={e} />
      </div>
    </Link>
  )
}

export function SpotsLine({ event: e }: { event: EventView }) {
  const pct = Math.min(100, Math.round((e.confirmedCount / e.capacity) * 100))
  const full = e.spotsLeft === 0
  return (
    <div className="mt-3">
      <div
        className="h-1.5 overflow-hidden rounded-full bg-stone-100"
        role="progressbar"
        aria-valuenow={e.confirmedCount}
        aria-valuemax={e.capacity}
        aria-label="Spots taken"
      >
        <div className={`h-full rounded-full ${full ? 'bg-amber-500' : 'bg-brand'}`} style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-1.5 flex items-center gap-1 text-xs text-muted">
        <Users size={12} aria-hidden />
        {full ? 'Full' : `${e.spotsLeft} of ${e.capacity} spots left`}
        {e.waitlistCount > 0 && ` · ${e.waitlistCount} waiting`}
      </p>
    </div>
  )
}
