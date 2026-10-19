import type { ReactNode } from 'react'
import { GITHUB_URL } from '../Layout'

export default function Privacy() {
  return (
    <article className="mx-auto max-w-2xl">
      <h1 className="text-3xl font-bold tracking-tight">Privacy</h1>
      <p className="mt-2 text-sm text-muted">Last updated 19 October 2026</p>

      <Block title="What we collect">
        Your name, your email address, and a scrambled (hashed) version of your password. When you register for an
        event, we store which event, whether you have a spot or are on the waitlist, and when you checked in. We don't
        ask for your phone number, IC or student ID.
      </Block>
      <Block title="Why">
        To let you register, show your QR code, move you off the waitlist when a spot opens, and email you about events
        you registered for. Nothing else. We don't sell data or show ads.
      </Block>
      <Block title="Who can see it">
        Only the organiser of an event can see the names and emails of the people registered for that event. Other
        visitors only see how many spots are left.
      </Block>
      <Block title="Where it's stored">
        Joinlist runs on Cloudflare (website), Render (server) and Neon (database), with emails sent through Brevo.
        Their servers may be outside Malaysia.
      </Block>
      <Block title="How long we keep it">
        Up to 12 months after an event, then it's deleted.
      </Block>
      <Block title="Your choices">
        To have your account and data deleted, contact us through the project page on{' '}
        <a href={GITHUB_URL} target="_blank" rel="noreferrer" className="font-semibold text-brand hover:underline">
          GitHub
        </a>
        .
      </Block>
      <p className="mt-10 rounded-xl bg-stone-100 p-4 text-sm text-muted">
        Joinlist is a student portfolio project. Please don't use it for events where data protection is critical.
      </p>
    </article>
  )
}

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="text-lg font-bold">{title}</h2>
      <p className="mt-2 text-[15px] leading-relaxed text-ink/85">{children}</p>
    </section>
  )
}
