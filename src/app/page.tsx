import Link from "next/link";

export default function Home() {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-6 py-8 md:px-10">
      <header className="mb-10 flex items-center justify-between">
        <p className="text-lg font-semibold tracking-tight">TripSplit International</p>
        <div className="flex gap-3">
          <Link className="btn-secondary rounded-xl px-4 py-2 text-sm font-semibold" href="/login">
            Log in
          </Link>
          <Link className="btn-primary rounded-xl px-4 py-2 text-sm font-semibold" href="/register">
            Create account
          </Link>
        </div>
      </header>

      <main className="grid gap-6 md:grid-cols-3">
        <section className="card md:col-span-3 p-7 md:p-10">
          <p className="mb-3 inline-flex rounded-full border border-[var(--line)] bg-white px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">
            Multi-currency without FX conversion
          </p>
          <h1 className="mb-4 text-4xl leading-tight md:text-5xl">
            Split any travel expense by original currency, then settle faster.
          </h1>
          <p className="max-w-2xl text-lg text-muted">
            Add expenses in USD, EUR, INR, or any currency as separate entries. Use equal, percentage,
            exact, or share-based splits with multiple payers and optional simplified settlements.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link className="btn-primary rounded-xl px-5 py-3 text-sm font-semibold" href="/register">
              Start a new trip
            </Link>
            <Link className="btn-secondary rounded-xl px-5 py-3 text-sm font-semibold" href="/login">
              Open dashboard
            </Link>
          </div>
        </section>

        <section className="card p-7 md:col-span-3">
          <p className="text-sm text-muted">
            Tip: Keep one currency per expense line, but mix currencies freely in the same trip.
          </p>
        </section>
      </main>
    </div>
  );
}
