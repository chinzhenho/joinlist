import { useState, type FormEvent } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { api, ApiError } from '../api'
import { useAuth } from '../auth'
import { Button, ErrorNote, Field, inputClass, Logo } from '../ui'

export default function Login() {
  const { user, signIn } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const back = (location.state as { from?: string } | null)?.from ?? '/'

  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (user) return <Navigate to={back} replace />

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const res = mode === 'login' ? await api.login(email, password) : await api.register(name, email, password)
      signIn(res.token, res.user)
      navigate(back, { replace: true })
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-sm pt-6">
      <div className="mb-6 flex flex-col items-center text-center">
        <Logo size={44} />
        <h1 className="mt-4 text-2xl font-bold tracking-tight">
          {mode === 'login' ? 'Welcome back' : 'Create your account'}
        </h1>
        <p className="mt-1 text-sm text-muted">
          {mode === 'login' ? 'Log in to register for events.' : 'One account to join and organize events.'}
        </p>
      </div>

      <div className="mb-5 grid grid-cols-2 rounded-xl bg-stone-100 p-1 text-sm font-semibold" role="tablist">
        {(['login', 'register'] as const).map((m) => (
          <button
            key={m}
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
          <Field label="Your name" hint="Organizers see this on their list.">
            <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} required autoComplete="name" />
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
          <input
            className={inputClass}
            type="password"
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
      </form>
    </div>
  )
}
