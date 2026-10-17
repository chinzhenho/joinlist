// Talks to the Joinlist backend. The login token is sent in the Authorization header (not a cookie),
// because the frontend and backend are on different sites and Safari blocks cross-site cookies.

const API_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:8080'
const TOKEN_KEY = 'joinlist.token'

export type User = { id: number; name: string; email: string }

export type MyRegistration = {
  id: number
  status: 'CONFIRMED' | 'WAITLISTED'
  waitlistPosition: number | null
  checkedInAt: string | null
  qrToken: string | null
}

export type Phase = 'draft' | 'cancelled' | 'upcoming' | 'open' | 'closed' | 'ended'

export type EventView = {
  id: number
  title: string
  description: string
  location: string
  startsAt: string
  registrationOpensAt: string
  registrationClosesAt: string
  capacity: number
  confirmedCount: number
  spotsLeft: number
  waitlistCount: number
  status: 'DRAFT' | 'PUBLISHED' | 'CANCELLED'
  phase: Phase
  isOrganizer: boolean
  myRegistration: MyRegistration | null
}

export type EventForm = {
  title: string
  description: string
  location: string
  startsAt: string
  registrationOpensAt: string
  registrationClosesAt: string
  capacity: number
}

export type MyRegistrationItem = {
  eventId: number
  eventTitle: string
  eventLocation: string
  eventStartsAt: string
  eventPhase: Phase
  registration: MyRegistration
}

export type Attendee = {
  registrationId: number
  name: string
  email: string
  status: 'CONFIRMED' | 'WAITLISTED' | 'CANCELLED'
  registeredAt: string
  checkedInAt: string | null
}

export class ApiError extends Error {
  status: number
  code: string
  constructor(status: number, code: string, message: string) {
    super(message)
    this.status = status
    this.code = code
  }
}

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

export function setToken(token: string | null) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token)
    else localStorage.removeItem(TOKEN_KEY)
  } catch {
    // Private mode: stay logged in for this tab only.
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = {}
  const token = getToken()
  if (token) headers.Authorization = `Bearer ${token}`
  if (body !== undefined) headers['Content-Type'] = 'application/json'

  let res: Response
  try {
    res = await fetch(API_URL + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) })
  } catch {
    throw new ApiError(0, 'offline', "Can't reach the server. If it was asleep, wait a minute and try again.")
  }
  if (res.status === 401 && token) {
    setToken(null)
    window.dispatchEvent(new Event('joinlist:logout'))
  }
  if (!res.ok) {
    const data = await res.json().catch(() => null)
    throw new ApiError(res.status, data?.error ?? 'error', data?.message ?? 'Something went wrong. Please try again.')
  }
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

export const api = {
  register: (name: string, email: string, password: string) =>
    request<{ token: string; user: User }>('POST', '/api/auth/register', { name, email, password }),
  login: (email: string, password: string) =>
    request<{ token: string; user: User }>('POST', '/api/auth/login', { email, password }),
  me: () => request<User>('GET', '/api/me'),

  events: () => request<EventView[]>('GET', '/api/events'),
  event: (id: number) => request<EventView>('GET', `/api/events/${id}`),
  myEvents: () => request<EventView[]>('GET', '/api/me/events'),
  createEvent: (form: EventForm) => request<{ id: number }>('POST', '/api/events', form),
  updateEvent: (id: number, form: EventForm) => request<EventView>('PATCH', `/api/events/${id}`, form),
  publishEvent: (id: number) => request<EventView>('POST', `/api/events/${id}/publish`),
  cancelEvent: (id: number) => request<EventView>('POST', `/api/events/${id}/cancel`),

  join: (eventId: number) =>
    request<{ registrationId: number; status: 'CONFIRMED' | 'WAITLISTED' }>('POST', `/api/events/${eventId}/registrations`),
  leave: (registrationId: number) => request<void>('DELETE', `/api/registrations/${registrationId}`),
  myRegistrations: () => request<MyRegistrationItem[]>('GET', '/api/me/registrations'),

  attendees: (eventId: number) => request<Attendee[]>('GET', `/api/events/${eventId}/attendees`),
  checkIn: (eventId: number, token: string) =>
    request<{ registrationId: number; name: string; checkedInAt: string }>('POST', `/api/events/${eventId}/check-in`, {
      token,
    }),

  async downloadAttendeesCsv(eventId: number) {
    const res = await fetch(`${API_URL}/api/events/${eventId}/attendees.csv`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    })
    if (!res.ok) throw new ApiError(res.status, 'error', 'Download failed. Please try again.')
    const url = URL.createObjectURL(await res.blob())
    const a = document.createElement('a')
    a.href = url
    a.download = `event-${eventId}-attendees.csv`
    a.click()
    URL.revokeObjectURL(url)
  },
}
