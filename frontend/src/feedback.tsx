// Confirmation dialogs and short "done" messages (toasts), shared by every page.
import { CircleAlert, CircleCheck, X } from 'lucide-react'
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'

type ConfirmOptions = {
  title: string
  message?: string
  confirmLabel: string
  cancelLabel?: string
  danger?: boolean
}

type Toast = { id: number; text: string; tone: 'ok' | 'error' }

type Feedback = {
  confirm: (opts: ConfirmOptions) => Promise<boolean>
  toast: (text: string, tone?: 'ok' | 'error') => void
}

const FeedbackContext = createContext<Feedback | null>(null)

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [dialog, setDialog] = useState<(ConfirmOptions & { resolve: (ok: boolean) => void }) | null>(null)
  const [toasts, setToasts] = useState<Toast[]>([])
  const nextId = useRef(1)

  const confirm = useCallback(
    (opts: ConfirmOptions) => new Promise<boolean>((resolve) => setDialog({ ...opts, resolve })),
    [],
  )

  const toast = useCallback((text: string, tone: 'ok' | 'error' = 'ok') => {
    const id = nextId.current++
    setToasts((t) => [...t, { id, text, tone }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3500)
  }, [])

  const close = (ok: boolean) => {
    dialog?.resolve(ok)
    setDialog(null)
  }

  return (
    <FeedbackContext.Provider value={{ confirm, toast }}>
      {children}
      {dialog && <ConfirmDialog {...dialog} onClose={close} />}
      <div
        className="pointer-events-none fixed inset-x-0 bottom-20 z-50 flex flex-col items-center gap-2 px-4 sm:bottom-6"
        aria-live="polite"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto flex max-w-sm items-center gap-2 rounded-xl px-4 py-3 text-sm font-medium shadow-lg ${
              t.tone === 'ok' ? 'bg-ink text-paper' : 'bg-red-700 text-white'
            }`}
          >
            {t.tone === 'ok' ? <CircleCheck size={18} aria-hidden /> : <CircleAlert size={18} aria-hidden />}
            {t.text}
          </div>
        ))}
      </div>
    </FeedbackContext.Provider>
  )
}

function ConfirmDialog({
  title,
  message,
  confirmLabel,
  cancelLabel = 'Go back',
  danger,
  onClose,
}: ConfirmOptions & { onClose: (ok: boolean) => void }) {
  const confirmRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    confirmRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-4 sm:items-center" onClick={() => onClose(false)}>
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <h2 id="confirm-title" className="text-lg font-bold">
            {title}
          </h2>
          <button onClick={() => onClose(false)} className="text-muted hover:text-ink" aria-label="Close">
            <X size={20} />
          </button>
        </div>
        {message && <p className="mt-2 text-[15px] leading-relaxed text-muted">{message}</p>}
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            onClick={() => onClose(false)}
            className="min-h-11 rounded-xl border border-line px-4 text-[15px] font-semibold hover:bg-paper"
          >
            {cancelLabel}
          </button>
          <button
            ref={confirmRef}
            onClick={() => onClose(true)}
            className={`min-h-11 rounded-xl px-4 text-[15px] font-semibold text-white ${
              danger ? 'bg-red-700 hover:bg-red-800' : 'bg-brand hover:bg-brand-dark'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useFeedback() {
  const ctx = useContext(FeedbackContext)
  if (!ctx) throw new Error('useFeedback must be inside FeedbackProvider')
  return ctx
}

/** Sets the browser tab title, e.g. "Intro to Git · Joinlist". */
// eslint-disable-next-line react-refresh/only-export-components
export function usePageTitle(title: string | null | undefined) {
  useEffect(() => {
    document.title = title ? `${title} · Joinlist` : 'Joinlist'
  }, [title])
}
