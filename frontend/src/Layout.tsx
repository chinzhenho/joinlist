import { CalendarDays, LogOut, Settings2, Ticket } from 'lucide-react'
import { useEffect } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from './auth'
import { useFeedback } from './feedback'
import { useLiveStatus } from './live'
import { Logo } from './ui'

export const GITHUB_URL = 'https://github.com/chinzhenho/joinlist'

export default function Layout() {
  const { user, signOut } = useAuth()
  const { toast } = useFeedback()
  const navigate = useNavigate()
  const { pathname } = useLocation()

  // Braces matter: newer browsers return a Promise from scrollTo, and an effect may only return a cleanup function.
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])

  const tab = ({ isActive }: { isActive: boolean }) =>
    `flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium sm:flex-none sm:flex-row sm:gap-1.5 sm:rounded-lg sm:px-3 sm:py-1.5 sm:text-sm ${
      isActive ? 'text-brand sm:bg-brand-soft' : 'text-muted hover:text-ink'
    }`

  return (
    <div className="flex min-h-dvh flex-col pb-16 sm:pb-0">
      <header className="sticky top-0 z-20 border-b border-line/80 bg-paper/85 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-5xl items-center gap-3 px-4 sm:px-6">
          <Link to="/" className="flex items-center gap-2 text-[17px] font-bold tracking-tight">
            <Logo size={28} />
            Joinlist
          </Link>
          <nav className="ml-6 hidden gap-1 sm:flex" aria-label="Main">
            <NavLink to="/" end className={tab}>
              <CalendarDays size={16} aria-hidden /> Events
            </NavLink>
            {user && (
              <>
                <NavLink to="/my" className={tab}>
                  <Ticket size={16} aria-hidden /> My registrations
                </NavLink>
                <NavLink to="/organize" className={tab}>
                  <Settings2 size={16} aria-hidden /> Organize
                </NavLink>
              </>
            )}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <LiveBadge />
            {user ? (
              <>
                <Link
                  to="/account"
                  className="flex items-center gap-2 rounded-full py-1 pr-1 pl-1 hover:bg-stone-100 md:pr-3"
                  title="Your account"
                >
                  <span
                    className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-soft text-sm font-bold text-brand"
                    aria-hidden
                  >
                    {user.name.trim().charAt(0).toUpperCase()}
                  </span>
                  <span className="hidden max-w-40 truncate text-sm font-medium md:inline">{user.name}</span>
                  <span className="sr-only md:hidden">Your account</span>
                </Link>
                <button
                  onClick={() => {
                    signOut()
                    toast('Logged out')
                    navigate('/')
                  }}
                  className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm text-muted hover:text-ink"
                >
                  <LogOut size={16} aria-hidden /> <span className="hidden sm:inline">Log out</span>
                </button>
              </>
            ) : (
              <>
                <Link to="/login" className="rounded-lg px-3 py-2 text-sm font-semibold text-ink hover:bg-stone-100">
                  Log in
                </Link>
                <Link
                  to="/login"
                  state={{ mode: 'register' }}
                  className="rounded-lg bg-brand px-3.5 py-2 text-sm font-semibold text-paper shadow-sm hover:bg-brand-dark"
                >
                  Sign up
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6">
        <Outlet />
      </main>

      <Footer />

      {/* Phone: tabs at the bottom, easy to reach with a thumb */}
      {user && (
        <nav
          className="fixed inset-x-0 bottom-0 z-20 flex border-t border-line bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur sm:hidden"
          aria-label="Main"
        >
          <NavLink to="/" end className={tab}>
            <CalendarDays size={22} aria-hidden /> Events
          </NavLink>
          <NavLink to="/my" className={tab}>
            <Ticket size={22} aria-hidden /> My registrations
          </NavLink>
          <NavLink to="/organize" className={tab}>
            <Settings2 size={22} aria-hidden /> Organize
          </NavLink>
        </nav>
      )}
    </div>
  )
}

function Footer() {
  return (
    <footer className="mt-12 border-t border-line">
      <div className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-8 text-sm text-muted sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div>
          <Link to="/" className="flex items-center gap-2 font-bold text-ink">
            <Logo size={22} /> Joinlist
          </Link>
          <p className="mt-2 max-w-xs">Event sign-ups with a seat limit, an automatic waitlist and QR check-in.</p>
        </div>
        <nav className="flex flex-wrap gap-x-6 gap-y-2" aria-label="Footer">
          <Link to="/" className="hover:text-ink">
            Events
          </Link>
          <Link to="/how-it-works" className="hover:text-ink">
            How it works
          </Link>
          <Link to="/privacy" className="hover:text-ink">
            Privacy
          </Link>
          <a href={GITHUB_URL} target="_blank" rel="noreferrer" className="hover:text-ink">
            Source code
          </a>
        </nav>
      </div>
    </footer>
  )
}

/** Shows whether the page is receiving live updates. */
function LiveBadge() {
  const status = useLiveStatus()
  const look = {
    live: ['bg-emerald-500', 'Live', 'Updates appear here automatically'],
    connecting: ['bg-amber-400', 'Connecting…', 'Reconnecting for live updates. If the server was asleep, this takes up to a minute.'],
    offline: ['bg-stone-400', 'Offline', 'Live updates are paused. Reload the page to try again.'],
  }[status]
  return (
    <span className="flex items-center gap-1.5 rounded-full px-2 py-1 text-xs font-medium text-muted" title={look[2]} role="status">
      <span className="relative flex h-2 w-2">
        {status === 'live' && <span className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-60 ${look[0]}`} />}
        <span className={`relative inline-flex h-2 w-2 rounded-full ${look[0]}`} />
      </span>
      <span className="hidden sm:inline">{look[1]}</span>
      <span className="sr-only sm:hidden">{look[1]}</span>
    </span>
  )
}
