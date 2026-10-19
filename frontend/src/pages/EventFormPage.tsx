import { useState, type FormEvent, type ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { api, ApiError, type EventForm, type EventView } from '../api'
import { useFeedback, usePageTitle } from '../feedback'
import { fromLocalInput, toLocalInput } from '../format'
import { BackLink, Button, ErrorNote, Field, inputClass, Loading } from '../ui'
import { useLoad } from '../useLoad'

/** Create a new event, or edit one (/organize/:id/edit). */
export default function EventFormPage() {
  const idParam = useParams().id
  const id = idParam ? Number(idParam) : null
  const { data, error, loading } = useLoad(() => (id ? api.event(id) : Promise.resolve(null)), [id])
  usePageTitle(id ? 'Edit event' : 'Create an event')

  if (id && loading) return <Loading />
  if (error) return <ErrorNote message={error.message} />
  return <FormBody existing={data} />
}

type Form = Record<keyof EventForm, string>

function defaults(): Form {
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

/** Problems the server would reject, shown under the right field before saving. */
function problems(form: Form, existing: EventView | null) {
  const t = (v: string) => (v ? new Date(v).getTime() : NaN)
  const starts = t(form.startsAt)
  const opens = t(form.registrationOpensAt)
  const closes = t(form.registrationClosesAt)
  const spots = Number(form.capacity)
  return {
    startsAt: !existing && starts <= Date.now() ? 'The event must start in the future.' : null,
    registrationClosesAt:
      closes <= opens
        ? 'Must be after registration opens.'
        : closes > starts
          ? 'Must be before the event starts.'
          : null,
    capacity: !Number.isInteger(spots) || spots < 1
      ? 'Enter a whole number, 1 or more.'
      : spots > 10000
        ? 'Up to 10,000 spots.'
        : existing && spots < existing.confirmedCount
          ? `${existing.confirmedCount} people are already confirmed, so it can't be lower than that.`
          : null,
  }
}

function FormBody({ existing }: { existing: EventView | null }) {
  const navigate = useNavigate()
  const { toast } = useFeedback()
  const [form, setForm] = useState<Form>(() =>
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
  const [tried, setTried] = useState(false)

  const issues = problems(form, existing)
  const show = (key: keyof typeof issues) => (tried ? issues[key] : null)
  const set = (key: keyof EventForm) => (e: { target: { value: string } }) => setForm({ ...form, [key]: e.target.value })

  async function submit(e: FormEvent) {
    e.preventDefault()
    setTried(true)
    if (Object.values(issues).some(Boolean)) return
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
        toast('Changes saved')
        navigate(`/organize/${existing.id}`, { replace: true })
      } else {
        const { id } = await api.createEvent(body)
        toast('Draft saved. Publish it when you are ready.')
        navigate(`/organize/${id}`, { replace: true })
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <BackLink fallback="/organize" />
      <form onSubmit={submit} noValidate={false} className="rounded-3xl border border-line bg-white p-6 shadow-sm sm:p-10">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{existing ? 'Edit event' : 'Create an event'}</h1>
        <p className="mt-1 text-[15px] text-muted">
          {existing ? 'Changes show up for everyone right away.' : 'It stays a draft, visible only to you, until you publish it.'}
        </p>

        <Section title="Basics">
          <Field label="Event name">
            <input
              className={inputClass}
              value={form.title}
              onChange={set('title')}
              required
              maxLength={120}
              placeholder="e.g. Intro to Git Workshop"
            />
          </Field>
          <Field label="Where">
            <input
              className={inputClass}
              value={form.location}
              onChange={set('location')}
              required
              maxLength={200}
              placeholder="e.g. FCI Lab 2, MMU Cyberjaya"
            />
          </Field>
          <Field label="About (optional)" hint={`${form.description.length}/5000 · What to bring, who it's for, the agenda.`}>
            <textarea
              className={`${inputClass} min-h-28 py-2.5`}
              value={form.description}
              onChange={set('description')}
              maxLength={5000}
            />
          </Field>
        </Section>

        <Section title="When">
          <Field label="Event starts" error={show('startsAt')}>
            <input className={inputClass} type="datetime-local" value={form.startsAt} onChange={set('startsAt')} required />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Registration opens" hint="People can sign up from this time.">
              <input
                className={inputClass}
                type="datetime-local"
                value={form.registrationOpensAt}
                onChange={set('registrationOpensAt')}
                required
              />
            </Field>
            <Field label="Registration closes" error={show('registrationClosesAt')} hint="No new sign-ups after this.">
              <input
                className={inputClass}
                type="datetime-local"
                value={form.registrationClosesAt}
                onChange={set('registrationClosesAt')}
                required
              />
            </Field>
          </div>
        </Section>

        <Section title="Spots">
          <Field
            label="Number of spots"
            error={show('capacity')}
            hint={
              existing
                ? `${existing.confirmedCount} confirmed now. Extra spots go to the waitlist first, in order.`
                : 'When it fills up, new people join the waitlist.'
            }
          >
            <input
              className={`${inputClass} max-w-40`}
              type="number"
              inputMode="numeric"
              min={1}
              max={10000}
              value={form.capacity}
              onChange={set('capacity')}
              required
            />
          </Field>
        </Section>

        {error && (
          <div className="mt-6">
            <ErrorNote message={error} />
          </div>
        )}
        <div className="mt-8 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="secondary" onClick={() => navigate(-1)}>
            Cancel
          </Button>
          <Button type="submit" busy={busy}>
            {existing ? 'Save changes' : 'Save as draft'}
          </Button>
        </div>
      </form>
    </div>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="mt-8 space-y-4 border-t border-line pt-6">
      <legend className="sr-only">{title}</legend>
      <p className="text-xs font-bold tracking-wide text-muted uppercase" aria-hidden>
        {title}
      </p>
      {children}
    </fieldset>
  )
}
