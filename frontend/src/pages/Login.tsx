import { useState, type FormEvent } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { api, ApiError } from '../api'
import { useAuth } from '../auth'
import { useFeedback, usePageTitle } from '../feedback'
import { BackLink, Button, ErrorNote, Field, inputClass, Logo, PasswordInput } from '../ui'

export default function Login() {
  const { user, signIn } = useAuth()
  const { toast } = useFeedback()
  const navigate = useNavigate()
  const location = useLocation()
  const state = location.state as { from?: string; mode?: 'login' | 'register' } | null
  const back = state?.from ?? '/'

  const [mode, setMode] = useState<'login' | 'register'>(state?.mode ?? 'login')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  usePageTitle(mode === 'login' ? 'Log in' : 'Sign up')

  if (user) return <Navigate to={back} replace />

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const res = mode === 'login' ? await api.login(email, password) : await api.register(name, email, password)
      signIn(res.token, res.user)
      toast(mode === 'login' ? `Welcome back, ${res.user.name}` : 'Your account is ready')
      navigate(back, { replace: true })
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-md">
      <BackLink fallback="/" />
      <div className="rounded-3xl border border-line bg-white px-6 py-8 shadow-sm sm:px-10 sm:py-10">
        <div className="mb-6 flex flex-col items-center text-center">
          <Logo size={44} />
          <h1 className="mt-4 text-2xl font-bold tracking-tight">
            {mode === 'login' ? 'Welcome back' : 'Create your account'}
          </h1>
          <p className="mt-1 text-sm text-muted">
            {mode === 'login' ? 'Log in to register for events.' : 'One account to join and organise events.'}
          </p>
        </div>

        <div className="mb-5 grid grid-cols-2 rounded-xl bg-stone-100 p-1 text-sm font-semibold" role="tablist">
          {(['login', 'register'] as const).map((m) => (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={mode === m}
              onClick={() => {
                setMode(m)
                setError(null)
              }}
              className={`rounded-lg py-2 ${mode === m ? 'bg-white shadow-sm' : 'text-muted'}`}
            >
              {m === 'login' ? 'Log in' : 'Sign up'}
            </button>
          ))}
        </div>

        <form onSubmit={submit} className="space-y-4">
          {mode === 'register' && (
            <Field label="Your name" hint="Organisers see this on their attendee list.">
              <input
                className={inputClass}
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                maxLength={100}
                autoComplete="name"
              />
            </Field>
          )}
          <Field label="Email">
            <input
              className={inputClass}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </Field>
          <Field label="Password" hint={mode === 'register' ? 'At least 8 characters.' : undefined}>
            <PasswordInput
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={mode === 'register' ? 8 : undefined}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            />
          </Field>
          {error && <ErrorNote message={error} />}
          <Button type="submit" busy={busy} className="w-full">
            {mode === 'login' ? 'Log in' : 'Create account'}
          </Button>
          {mode === 'register' && (
            <p className="text-center text-xs text-muted">
              By signing up you agree to how we handle your data, explained on the{' '}
              <Link to="/privacy" className="font-semibold text-brand hover:underline">
                privacy page
              </Link>
              .
            </p>
          )}
        </form>
      </div>
    </div>
  )
}
