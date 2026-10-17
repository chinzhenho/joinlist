import type { ReactNode } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { AuthProvider, useAuth } from './auth'
import Layout from './Layout'
import EventDetail from './pages/EventDetail'
import EventFormPage from './pages/EventFormPage'
import Events from './pages/Events'
import Login from './pages/Login'
import Manage from './pages/Manage'
import MyRegistrations from './pages/MyRegistrations'
import Organize from './pages/Organize'
import { Loading } from './ui'

function RequireLogin({ children }: { children: ReactNode }) {
  const { user, ready } = useAuth()
  const location = useLocation()
  if (!ready) return <Loading />
  if (!user) return <Navigate to="/login" state={{ from: location.pathname }} replace />
  return children
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<Events />} />
            <Route path="login" element={<Login />} />
            <Route path="events/:id" element={<EventDetail />} />
            <Route path="my" element={<RequireLogin><MyRegistrations /></RequireLogin>} />
            <Route path="organize" element={<RequireLogin><Organize /></RequireLogin>} />
            <Route path="organize/new" element={<RequireLogin><EventFormPage /></RequireLogin>} />
            <Route path="organize/:id" element={<RequireLogin><Manage /></RequireLogin>} />
            <Route path="organize/:id/edit" element={<RequireLogin><EventFormPage /></RequireLogin>} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
