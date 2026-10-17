import { useState, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { api, ApiError, type EventForm, type EventView } from '../api'
import { fromLocalInput, toLocalInput } from '../format'
import { Button, ErrorNote, Field, inputClass, Loading } from '../ui'
import { useLoad } from '../useLoad'

/** Create a new event, or edit one (/organize/:id/edit). */
export default function EventFormPage() {
  const idParam = useParams().id
  const id = idParam ? Number(idParam) : null
  const { data, error, loading } = useLoad(() => (id ? api.event(id) : Promise.resolve(null)), [id])

  if (id && loading) return <Loading />
  if (error) return <ErrorNote message={error.message} />
  return <FormBody existing={data} />
}

function defaults(): Record<keyof EventForm, string> {
  const at = (days: number, hour: number) => {
    const d = new Date()
    d.setDate(d.getDate() + days)
    d.setHours(hour, 0, 0, 0)
    return toLocalInput(d.toISOString())
  }
  return {
    title: '',
    description: '',
    location: '',
    startsAt: at(7, 19),
    registrationOpensAt: toLocalInput(new Date().toISOString()),
    registrationClosesAt: at(6, 23),
    capacity: '50',
  }
}

function FormBody({ existing }: { existing: EventView | null }) {
  const navigate = useNavigate()
  const [form, setForm] = useState<Record<keyof EventForm, string>>(() =>
    existing
      ? {
          title: existing.title,
          description: existing.description,
          location: existing.location,
          startsAt: toLocalInput(existing.startsAt),
          registrationOpensAt: toLocalInput(existing.registrationOpensAt),
          registrationClosesAt: toLocalInput(existing.registrationClosesAt),
          capacity: String(existing.capacity),
        }
      : defaults(),
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const set = (key: keyof EventForm) => (e: { target: { value: string } }) => setForm({ ...form, [key]: e.target.value })

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const body: EventForm = {
      title: form.title,
      description: form.description,
      location: form.location,
      startsAt: fromLocalInput(form.startsAt),
      registrationOpensAt: fromLocalInput(form.registrationOpensAt),
      registrationClosesAt: fromLocalInput(form.registrationClosesAt),
      capacity: Number(form.capacity),
    }
    try {
      if (existing) {
        await api.updateEvent(existing.id, body)
        navigate(`/organize/${existing.id}`)
      } else {
        const { id } = await api.createEvent(body)
        navigate(`/organize/${id}`)
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="mx-auto max-w-lg space-y-4">
      <h1 className="text-2xl font-bold tracking-tight">{existing ? 'Edit event' : 'Create an event'}</h1>
      <Field label="Event name">
        <input className={inputClass} value={form.title} onChange={set('title')} required maxLength={120} />
      </Field>
      <Field label="Where">
        <input className={inputClass} value={form.location} onChange={set('location')} required maxLength={200} placeholder="e.g. FCI Lab 2, MMU Cyberjaya" />
      </Field>
      <Field label="Starts at">
        <input className={inputClass} type="datetime-local" value={form.startsAt} onChange={set('startsAt')} required />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Registration opens">
          <input className={inputClass} type="datetime-local" value={form.registrationOpensAt} onChange={set('registrationOpensAt')} required />
        </Field>
        <Field label="Registration closes">
          <input className={inputClass} type="datetime-local" value={form.registrationClosesAt} onChange={set('registrationClosesAt')} required />
        </Field>
      </div>
      <Field
        label="Number of spots"
        hint={existing ? `${existing.confirmedCount} people are confirmed. More spots go to the waitlist first.` : 'When it fills up, new people join the waitlist.'}
      >
        <input className={inputClass} type="number" min={existing ? Math.max(1, existing.confirmedCount) : 1} max={10000} value={form.capacity} onChange={set('capacity')} required />
      </Field>
      <Field label="About (optional)">
        <textarea className={`${inputClass} min-h-28 py-2.5`} value={form.description} onChange={set('description')} maxLength={5000} />
      </Field>
      {error && <ErrorNote message={error} />}
      <Button type="submit" busy={busy} className="w-full">
        {existing ? 'Save changes' : 'Save as draft'}
      </Button>
      {!existing && <p className="text-center text-xs text-muted">You can check everything, then publish it.</p>}
    </form>
  )
}
