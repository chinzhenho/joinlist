import { CalendarPlus, Plus } from 'lucide-react'
import { Link } from 'react-router-dom'
import { api } from '../api'
import { useAuth } from '../auth'
import { buttonClass, Empty, ErrorNote, Loading, PageHeader } from '../ui'
import { usePageTitle } from '../feedback'
import { useLive } from '../live'
import { useLoad } from '../useLoad'
import { EventCard } from './Events'

export default function Organize() {
  const { user } = useAuth()
  usePageTitle('Your events')
  const { data, error, loading, reload, refresh } = useLoad(api.myEvents, [user?.id])
  useLive(refresh)

  return (
    <>
      <PageHeader
        title="Your events"
        subtitle="Events you created. Open one to see who's coming and check people in."
        action={
          <Link to="/organize/new" className={buttonClass.primary}>
            <Plus size={18} aria-hidden /> Create event
          </Link>
        }
      />
      {loading && !data && <Loading />}
      {error && <ErrorNote message={error.message} onRetry={reload} />}
      {data && data.length === 0 && (
        <div className="rounded-2xl border border-dashed border-line bg-white/60">
          <Empty icon={<CalendarPlus size={32} />} title="You haven't created any events">
            Create one, publish it, then share the link.
          </Empty>
        </div>
      )}
      <ul className="grid gap-4 md:grid-cols-2">
        {data?.map((e) => (
          <li key={e.id}>
            <EventCard event={e} to={`/organize/${e.id}`} />
          </li>
        ))}
      </ul>
    </>
  )
}
