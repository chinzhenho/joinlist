import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, ApiError, getToken } from '../api'
import { useAuth } from '../auth'
import { useFeedback, usePageTitle } from '../feedback'
import { BackLink, Button, Card, ErrorNote, Field, inputClass, PasswordInput } from '../ui'

export default function Account() {
  usePageTitle('Your account')
  const { user } = useAuth()
  if (!user) return null
  return (
    <div className="mx-auto max-w-xl">
      <BackLink fallback="/" />
      <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Your account</h1>
      <p className="mt-1 text-[15px] text-muted">{user.email}</p>
      <div className="mt-6 space-y-4">
        <NameForm />
        <PasswordForm />
        <DeleteAccount />
      </div>
    </div>
  )
}

const message = (e: unknown) => (e instanceof ApiError ? e.message : 'Something went wrong. Please try again.')

function NameForm() {
  const { user, signIn } = useAuth()
  const { toast } = useFeedback()
  const [name, setName] = useState(user?.name ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const updated = await api.rename(name)
      signIn(getToken()!, updated)
      toast('Name saved')
    } catch (err) {
      setError(message(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <form onSubmit={submit} className="space-y-4">
        <h2 className="text-lg font-semibold">Name</h2>
        <Field label="Your name" hint="Organisers see this on their attendee list.">
          <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} required maxLength={100} />
        </Field>
        {error && <ErrorNote message={error} />}
        <Button type="submit" busy={busy} disabled={name.trim() === user?.name} variant="secondary">
          Save name
        </Button>
      </form>
    </Card>
  )
}

function PasswordForm() {
  const { signIn } = useAuth()
  const { toast } = useFeedback()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const res = await api.changePassword(current, next)
      signIn(res.token, res.user)
      setCurrent('')
      setNext('')
      toast('Password changed. Other devices have been logged out.')
    } catch (err) {
      setError(message(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <form onSubmit={submit} className="space-y-4">
        <h2 className="text-lg font-semibold">Password</h2>
        <Field label="Current password">
          <PasswordInput value={current} onChange={(e) => setCurrent(e.target.value)} required autoComplete="current-password" />
        </Field>
        <Field label="New password" hint="At least 8 characters. You'll stay logged in here; other devices will be logged out.">
          <PasswordInput
            value={next}
            onChange={(e) => setNext(e.target.value)}
            required
            minLength={8}
            autoComplete="new-password"
          />
        </Field>
        {error && <ErrorNote message={error} />}
        <Button type="submit" busy={busy} variant="secondary">
          Change password
        </Button>
      </form>
    </Card>
  )
}

function DeleteAccount() {
  const { signOut } = useAuth()
  const { confirm, toast } = useFeedback()
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    const ok = await confirm({
      title: 'Delete your account?',
      message:
        'Your spots go to the next person on each waitlist, and events you organise are cancelled (attendees get an email). This cannot be undone.',
      confirmLabel: 'Delete account',
      danger: true,
    })
    if (!ok) return
    setBusy(true)
    setError(null)
    try {
      await api.deleteAccount(password)
      signOut()
      toast('Your account was deleted')
      navigate('/', { replace: true })
    } catch (err) {
      setError(message(err))
      setBusy(false)
    }
  }

  return (
    <Card className="border-red-200">
      <form onSubmit={submit} className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-red-800">Delete account</h2>
          <p className="mt-1 text-sm text-muted">
            Removes your name and email from Joinlist. You'll need your password to confirm.
          </p>
        </div>
        <Field label="Password">
          <PasswordInput value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" />
        </Field>
        {error && <ErrorNote message={error} />}
        <Button type="submit" busy={busy} variant="danger">
          Delete my account
        </Button>
      </form>
    </Card>
  )
}
