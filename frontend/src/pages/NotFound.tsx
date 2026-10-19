import { Link } from 'react-router-dom'
import { usePageTitle } from '../feedback'
import { buttonClass } from '../ui'

export default function NotFound() {
  usePageTitle('Page not found')
  return (
    <div className="flex flex-col items-center py-20 text-center">
      <p className="text-6xl font-bold text-brand/20">404</p>
      <h1 className="mt-4 text-2xl font-bold">This page doesn't exist</h1>
      <p className="mt-2 text-muted">The link may be wrong, or the page was moved.</p>
      <Link to="/" className={`${buttonClass.primary} mt-6`}>
        Go to events
      </Link>
    </div>
  )
}
