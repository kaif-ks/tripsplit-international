"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { api } from "@/lib/client";
import { COMMON_CURRENCIES } from "@/lib/finance-options";

type Trip = {
  tripId: string;
  name: string;
  description: string | null;
  role: "owner" | "admin" | "member";
  defaultCurrency: string;
  simplifyTransfers: boolean;
  lockAfterSettlement: boolean;
  createdAt: string;
};

export default function AppDashboardPage() {
  const router = useRouter();
  const [trips, setTrips] = useState<Trip[]>([]);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [defaultCurrency, setDefaultCurrency] = useState("USD");
  const [joinCode, setJoinCode] = useState("");
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showJoinForm, setShowJoinForm] = useState(false);
  const [simplifyTransfers, setSimplifyTransfers] = useState(true);
  const [lockAfterSettlement, setLockAfterSettlement] = useState(false);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState("");

  async function loadTrips() {
    setLoading(true);
    setError("");

    try {
      const data = await api<{ trips: Trip[] }>("/api/trips");
      setTrips(data.trips);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load trips");
    } finally {
      setLoading(false);
    }
  }

  async function onCreateTrip(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setCreating(true);

    try {
      await api("/api/trips", {
        method: "POST",
        body: JSON.stringify({
          name,
          description,
          defaultCurrency,
          simplifyTransfers,
          lockAfterSettlement,
        }),
      });
      setName("");
      setDescription("");
      setDefaultCurrency("USD");
      setShowCreateForm(false);
      await loadTrips();
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Failed to create trip");
    } finally {
      setCreating(false);
    }
  }

  async function onJoinTrip(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setJoining(true);

    try {
      await api("/api/trips/join", {
        method: "POST",
        body: JSON.stringify({ joinCode: joinCode.toUpperCase() }),
      });
      setJoinCode("");
      setShowJoinForm(false);
      await loadTrips();
    } catch (joinError) {
      setError(joinError instanceof Error ? joinError.message : "Failed to join trip");
    } finally {
      setJoining(false);
    }
  }

  async function onLogout() {
    await api("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadTrips();
  }, []);

  return (
    <div className="mx-auto w-full max-w-6xl flex-1 px-6 py-8 md:px-10">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-4xl">Your Trips</h1>
          <p className="text-sm text-muted">Manage groups, expenses, and settlements by currency.</p>
        </div>
        <button className="btn-secondary rounded-xl px-4 py-2 text-sm font-semibold" onClick={onLogout}>
          Log out
        </button>
      </header>

      <div className="grid gap-6">
        <section className="card p-6">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-2xl">Active Trips</h2>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="btn-secondary rounded-xl px-3 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60"
                disabled={joining}
                onClick={() => setShowJoinForm(true)}
              >
                {joining ? "Joining..." : "Join with code"}
              </button>
              <button
                type="button"
                className="btn-primary rounded-xl px-3 py-2 text-sm font-semibold"
                onClick={() => setShowCreateForm(true)}
              >
                Create trip
              </button>
            </div>
          </div>

          {loading ? <p className="text-muted">Loading trips...</p> : null}
          {error ? <p className="text-sm text-red-700">{error}</p> : null}
          {!loading && !trips.length ? <p className="text-muted">No trips yet. Create your first trip.</p> : null}
          <div className="grid gap-3">
            {trips.map((trip) => (
              <Link
                key={trip.tripId}
                href={`/app/trips/${trip.tripId}`}
                className="rounded-xl border border-[var(--line)] bg-white p-4 transition hover:-translate-y-0.5"
              >
                <div className="mb-1 flex items-center justify-between gap-3">
                  <h3 className="text-xl">{trip.name}</h3>
                  <span className="rounded-full border border-[var(--line)] px-2 py-1 text-xs uppercase tracking-wide text-muted">
                    {trip.role}
                  </span>
                </div>
                <p className="text-sm text-muted">{trip.description || "No description"}</p>
              </Link>
            ))}
          </div>
        </section>
      </div>

      {showCreateForm ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 px-4">
          <div className="card w-full max-w-2xl p-5">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="text-2xl">Create Trip</h2>
              <button
                type="button"
                className="btn-secondary rounded-xl px-3 py-2 text-xs font-semibold"
                onClick={() => setShowCreateForm(false)}
              >
                Close
              </button>
            </div>

            <form className="grid gap-3 md:grid-cols-2" onSubmit={onCreateTrip}>
              <input
                className="rounded-xl border border-[var(--line)] bg-white px-3 py-2"
                placeholder="Trip name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                required
              />
              <select
                className="rounded-xl border border-[var(--line)] bg-white px-3 py-2"
                value={defaultCurrency}
                onChange={(event) => setDefaultCurrency(event.target.value)}
              >
                {COMMON_CURRENCIES.map((currency) => (
                  <option key={`trip-default-currency-${currency}`} value={currency}>
                    {currency}
                  </option>
                ))}
              </select>
              <textarea
                className="rounded-xl border border-[var(--line)] bg-white px-3 py-2 md:row-span-2"
                placeholder="Description (optional)"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                rows={3}
              />
              <label className="flex items-center gap-2 text-sm">
                <input
                  checked={simplifyTransfers}
                  onChange={(event) => setSimplifyTransfers(event.target.checked)}
                  type="checkbox"
                />
                Simplify transfers by default
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  checked={lockAfterSettlement}
                  onChange={(event) => setLockAfterSettlement(event.target.checked)}
                  type="checkbox"
                />
                Lock expenses after first settlement
              </label>
              <button
                className="btn-primary rounded-xl px-4 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60 md:col-span-2"
                disabled={creating}
              >
                {creating ? "Creating..." : "Create"}
              </button>
            </form>
          </div>
        </div>
      ) : null}

      {showJoinForm ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 px-4">
          <div className="card w-full max-w-md p-5">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="text-2xl">Join With Code</h2>
              <button
                type="button"
                className="btn-secondary rounded-xl px-3 py-2 text-xs font-semibold"
                onClick={() => setShowJoinForm(false)}
              >
                Close
              </button>
            </div>

            <form className="space-y-3" onSubmit={onJoinTrip}>
              <input
                className="w-full rounded-xl border border-[var(--line)] bg-white px-3 py-2 uppercase"
                placeholder="Trip code"
                value={joinCode}
                onChange={(event) => setJoinCode(event.target.value.toUpperCase())}
                required
              />
              <button
                className="btn-primary w-full rounded-xl px-4 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60"
                disabled={joining}
              >
                {joining ? "Joining..." : "Join trip"}
              </button>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
