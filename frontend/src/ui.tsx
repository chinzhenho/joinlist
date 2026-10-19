import { ChevronLeft, CircleAlert, Eye, EyeOff, LoaderCircle } from 'lucide-react'
import { useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import type { Phase } from './api'

export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="8" fill="#245A43" />
      <path d="M8 11h10M8 16h7M8 21h5" stroke="#FAF9F6" strokeWidth="2.6" strokeLinecap="round" />
      <path
        d="M17.5 20.5l2.8 2.8 5.2-6.3"
        fill="none"
        stroke="#9FE0BF"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'danger'
  busy?: boolean
}

/** Same look as <Button>, for links styled as buttons. */
export const buttonClass = {
  primary:
    'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-brand px-4 text-[15px] font-semibold whitespace-nowrap text-paper shadow-sm transition-colors hover:bg-brand-dark',
  secondary:
    'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-line bg-white px-4 text-[15px] font-semibold whitespace-nowrap text-ink shadow-sm transition-colors hover:bg-paper',
}

export function Button({ variant = 'primary', busy, className = '', children, disabled, ...rest }: ButtonProps) {
  const look = {
    primary: 'bg-brand text-paper shadow-sm hover:bg-brand-dark',
    secondary: 'bg-white text-ink border border-line shadow-sm hover:bg-paper',
    danger: 'bg-white text-red-700 border border-red-200 hover:bg-red-50',
  }[variant]
  return (
    <button
      {...rest}
      disabled={disabled || busy}
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 text-[15px] font-semibold whitespace-nowrap transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${look} ${className}`}
    >
      {busy && <LoaderCircle size={18} className="animate-spin" aria-hidden />}
      {children}
    </button>
  )
}

export function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string
  hint?: string
  error?: string | null
  children: ReactNode
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium">{label}</span>
      {children}
      {error ? (
        <span className="mt-1 flex items-center gap-1 text-xs font-medium text-red-700" role="alert">
          <CircleAlert size={13} aria-hidden /> {error}
        </span>
      ) : (
        hint && <span className="mt-1 block text-xs text-muted">{hint}</span>
      )}
    </label>
  )
}

export const inputClass =
  'block w-full min-h-11 rounded-xl border border-line bg-white px-3.5 text-[16px] outline-none focus:border-brand focus:ring-2 focus:ring-brand/20'

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-2xl border border-line bg-white p-5 shadow-[0_1px_2px_rgba(37,41,35,0.04)] ${className}`}>{children}</div>
}

export function Loading() {
  return (
    <div className="flex justify-center py-16 text-muted" role="status">
      <LoaderCircle className="animate-spin" aria-hidden />
      <span className="sr-only">Loading</span>
    </div>
  )
}

export function ErrorNote({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800" role="alert">
      <CircleAlert size={18} className="mt-0.5 shrink-0" aria-hidden />
      <div className="flex-1">
        {message}
        {onRetry && (
          <button onClick={onRetry} className="ml-2 font-semibold underline">
            Try again
          </button>
        )}
      </div>
    </div>
  )
}

export function Empty({ icon, title, children }: { icon: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-14 text-center">
      <div className="mb-3 text-muted">{icon}</div>
      <p className="font-semibold">{title}</p>
      {children && <div className="mt-1 text-sm text-muted">{children}</div>}
    </div>
  )
}

const phaseLook: Record<Phase, [string, string]> = {
  open: ['Open', 'bg-brand-soft text-brand'],
  upcoming: ['Opens soon', 'bg-amber-50 text-amber-800'],
  closed: ['Closed', 'bg-stone-100 text-muted'],
  ended: ['Ended', 'bg-stone-100 text-muted'],
  cancelled: ['Cancelled', 'bg-red-50 text-red-700'],
  draft: ['Draft', 'bg-stone-100 text-muted'],
}

export function PhaseBadge({ phase }: { phase: Phase }) {
  const [label, look] = phaseLook[phase]
  return <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${look}`}>{label}</span>
}

export function StatusBadge({ status, forMe = false }: { status: string; forMe?: boolean }) {
  const look =
    status === 'CONFIRMED'
      ? 'bg-brand-soft text-brand'
      : status === 'WAITLISTED'
        ? 'bg-amber-50 text-amber-800'
        : 'bg-stone-100 text-muted'
  const label =
    status === 'CONFIRMED' ? (forMe ? "You're in" : 'Confirmed') : status === 'WAITLISTED' ? 'Waitlist' : 'Cancelled'
  return <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${look}`}>{label}</span>
}

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
        {subtitle && <p className="mt-1 text-[15px] text-muted">{subtitle}</p>}
      </div>
      {action}
    </div>
  )
}

/**
 * "← Back". Goes to the previous page if the visitor came from inside Joinlist,
 * otherwise (opened from a shared link) to a sensible page.
 */
export function BackLink({ fallback, label = 'Back' }: { fallback: string; label?: string }) {
  const navigate = useNavigate()
  const location = useLocation()
  const cameFromApp = location.key !== 'default'
  return (
    <button
      type="button"
      onClick={() => (cameFromApp ? navigate(-1) : navigate(fallback))}
      className="mb-5 inline-flex min-h-9 items-center gap-1 rounded-lg pr-2 text-sm font-medium text-muted hover:text-ink"
    >
      <ChevronLeft size={18} aria-hidden /> {label}
    </button>
  )
}

/** Password field with a show/hide button. */
export function PasswordInput(props: InputHTMLAttributes<HTMLInputElement>) {
  const [shown, setShown] = useState(false)
  return (
    <div className="relative">
      <input {...props} type={shown ? 'text' : 'password'} className={`${inputClass} pr-12`} />
      <button
        type="button"
        onClick={() => setShown(!shown)}
        className="absolute inset-y-0 right-0 flex w-12 items-center justify-center text-muted hover:text-ink"
        aria-label={shown ? 'Hide password' : 'Show password'}
        aria-pressed={shown}
      >
        {shown ? <EyeOff size={18} aria-hidden /> : <Eye size={18} aria-hidden />}
      </button>
    </div>
  )
}
