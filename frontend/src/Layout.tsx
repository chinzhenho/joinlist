import { CalendarDays, LogOut, Settings2, Ticket } from 'lucide-react'
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from './auth'
import { Logo } from './ui'

export default function Layout() {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()

  const tab = ({ isActive }: { isActive: boolean }) =>
    `flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium sm:flex-none sm:flex-row sm:gap-1.5 sm:rounded-lg sm:px-3 sm:text-sm ${
      isActive ? 'text-brand sm:bg-brand-soft' : 'text-muted hover:text-ink'
    }`

  return (
    <div className="min-h-dvh pb-20 sm:pb-0">
      <header className="sticky top-0 z-10 border-b border-line bg-paper/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-3xl items-center gap-3 px-4">
          <Link to="/" className="flex items-center gap-2 font-bold tracking-tight">
            <Logo size={26} />
            Joinlist
          </Link>
          <nav className="ml-4 hidden gap-1 sm:flex" aria-label="Main">
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
          <div className="ml-auto">
            {user ? (
              <button
                onClick={() => {
                  signOut()
                  navigate('/')
                }}
                className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm text-muted hover:text-ink"
              >
                <LogOut size={16} aria-hidden /> Log out
              </button>
            ) : (
              <Link to="/login" className="rounded-lg px-3 py-1.5 text-sm font-semibold text-brand hover:bg-brand-soft">
                Log in
              </Link>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-6">
        <Outlet />
      </main>

      {/* Phone: tabs at the bottom, easy to reach with a thumb */}
      {user && (
        <nav
          className="fixed inset-x-0 bottom-0 z-10 flex border-t border-line bg-white pb-[env(safe-area-inset-bottom)] sm:hidden"
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
