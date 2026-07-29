import { Search, Users, CalendarCheck } from 'lucide-react'

const steps = [
  {
    icon: Search,
    title: 'Find your game',
    body: 'Filter by sport, level, and time. See who is already playing before you commit.',
  },
  {
    icon: Users,
    title: 'Join in one tap',
    body: 'Tap join and you are in. The court fee splits automatically across the players.',
  },
  {
    icon: CalendarCheck,
    title: 'Show up and play',
    body: 'Your booking is confirmed instantly. Recurring games remember your preferences.',
  },
]

export function HowItWorks() {
  return (
    <section className="border-y border-border bg-secondary/40">
      <div className="mx-auto max-w-6xl px-5 py-16 lg:py-20">
        <div className="max-w-xl">
          <p className="text-sm font-medium tracking-wide text-primary uppercase">
            How it works
          </p>
          <h2 className="mt-3 font-serif text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
            From couch to court in three taps
          </h2>
        </div>

        <div className="mt-12 grid gap-5 md:grid-cols-3">
          {steps.map((step, i) => (
            <div
              key={step.title}
              className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-6"
            >
              <div className="flex items-center justify-between">
                <span className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <step.icon className="size-5" />
                </span>
                <span className="font-serif text-2xl text-muted-foreground/50">
                  0{i + 1}
                </span>
              </div>
              <h3 className="font-serif text-xl font-semibold">{step.title}</h3>
              <p className="leading-relaxed text-muted-foreground">{step.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
