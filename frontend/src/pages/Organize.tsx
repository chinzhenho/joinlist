import { CalendarPlus, Plus } from 'lucide-react'
import { Link } from 'react-router-dom'
import { api } from '../api'
import { Empty, ErrorNote, Loading } from '../ui'
import { useLoad } from '../useLoad'
import { EventCard } from './Events'

export default function Organize() {
  const { data, error, loading, reload } = useLoad(api.myEvents, [])

  return (
    <>
      <div className="mb-5 flex items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Your events</h1>
          <p className="mt-0.5 text-sm text-muted">Events you created. Tap one to see who's coming.</p>
        </div>
        <Link
          to="/organize/new"
          className="inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-xl bg-brand px-3.5 text-sm font-semibold text-paper hover:bg-brand-dark"
        >
          <Plus size={16} aria-hidden /> Create event
        </Link>
      </div>
      {loading && !data && <Loading />}
      {error && <ErrorNote message={error.message} onRetry={reload} />}
      {data && data.length === 0 && (
        <Empty icon={<CalendarPlus size={32} />} title="You haven't created any events">
          Create one, publish it, then share the link.
        </Empty>
      )}
      <ul className="space-y-3">
        {data?.map((e) => (
          <li key={e.id}>
            <EventCard event={e} to={`/organize/${e.id}`} />
          </li>
        ))}
      </ul>
    </>
  )
}
