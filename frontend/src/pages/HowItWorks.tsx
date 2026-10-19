import { ArrowRight } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth'
import { buttonClass } from '../ui'

export default function HowItWorks() {
  const { user } = useAuth()
  return (
    <article className="mx-auto max-w-2xl">
      <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">How Joinlist works</h1>
      <p className="mt-3 text-lg text-muted">Three steps for organisers, two for everyone else.</p>

      <Section title="If you're organising">
        <Step n={1} title="Create the event">
          Give it a name, place and time, choose how many spots there are, and when registration opens and closes.
          It starts as a draft that only you can see.
        </Step>
        <Step n={2} title="Publish and share the link">
          Tap Publish, then share the event link in your group chat. When registration opens, the first people get the
          spots and everyone after them joins the waitlist in order.
        </Step>
        <Step n={3} title="Check people in at the door">
          Open the event under Organize and tap Scan QR. Point your phone at each person's code. You'll see their name,
          and the same code can't be used twice. Download the list as a CSV file any time.
        </Step>
      </Section>

      <Section title="If you're attending">
        <Step n={1} title="Register">
          Open the link, sign up, and tap Register. If it's full, tap Join the waitlist. You'll see your place in line.
        </Step>
        <Step n={2} title="Show your QR code">
          Your code is under My registrations. Show it at the door. Can't make it? Cancel, so the next person gets your
          spot.
        </Step>
      </Section>

      <Section title="Common questions">
        <Faq q="What happens when someone cancels?">
          Their spot goes straight to the first person on the waitlist, who gets an email. Nobody has to do anything.
        </Faq>
        <Faq q="Can I cancel at the last minute?">
          You can cancel until 2 hours before the event starts. After that, contact the organiser.
        </Faq>
        <Faq q="Can the organiser add more spots later?">
          Yes. New spots go to the people on the waitlist first, in order. Spots can't go below the number of people
          already confirmed.
        </Faq>
        <Faq q="What if the organiser cancels the event?">
          Registration stops and everyone who was registered or waiting gets an email.
        </Faq>
        <Faq q="Why did the page take a while to load?">
          The server runs on a free plan and sleeps when nobody has used it for a while. The first visit wakes it up,
          which can take up to a minute.
        </Faq>
      </Section>

      <div className="mt-12 rounded-2xl bg-brand px-6 py-8 text-center text-paper">
        <p className="text-xl font-bold">Ready to try it?</p>
        <Link
          to={user ? '/organize/new' : '/login'}
          state={user ? undefined : { mode: 'register', from: '/organize/new' }}
          className={`${buttonClass.secondary} mt-4 border-transparent`}
        >
          Create an event <ArrowRight size={18} aria-hidden />
        </Link>
      </div>
    </article>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-10">
      <h2 className="mb-4 text-xl font-bold">{title}</h2>
      <div className="space-y-3">{children}</div>
    </section>
  )
}

function Step({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <div className="flex gap-4 rounded-2xl border border-line bg-white p-5">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand text-sm font-bold text-paper">
        {n}
      </span>
      <div>
        <h3 className="font-semibold">{title}</h3>
        <p className="mt-1 text-[15px] leading-relaxed text-muted">{children}</p>
      </div>
    </div>
  )
}

function Faq({ q, children }: { q: string; children: ReactNode }) {
  return (
    <details className="group rounded-2xl border border-line bg-white px-5 py-4">
      <summary className="cursor-pointer list-none font-semibold marker:hidden">
        <span className="flex items-center justify-between gap-3">
          {q}
          <span className="text-muted transition group-open:rotate-45" aria-hidden>
            +
          </span>
        </span>
      </summary>
      <p className="mt-2 text-[15px] leading-relaxed text-muted">{children}</p>
    </details>
  )
}
