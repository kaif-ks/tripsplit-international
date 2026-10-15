"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useState } from "react";
import { api } from "@/lib/client";

function JoinTripClient() {
  const params = useSearchParams();
  const codeFromLink = (params.get("code") ?? "").toUpperCase();

  const [joinCode, setJoinCode] = useState(codeFromLink);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [joinedTripId, setJoinedTripId] = useState("");

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");

    try {
      const response = await api<{ tripId: string; alreadyJoined?: boolean }>(`/api/trips/join`, {
        method: "POST",
        body: JSON.stringify({ joinCode }),
      });
      setJoinedTripId(response.tripId);
      setMessage(
        response.alreadyJoined
          ? "You are already a member of this trip."
          : "Joined trip successfully. You can open it now."
      );
    } catch (joinError) {
      setError(joinError instanceof Error ? joinError.message : "Failed to join trip");
    }
  }

  return (
    <div className="mx-auto my-10 w-full max-w-lg px-6">
      <section className="card p-7">
        <h1 className="mb-2 text-3xl">Join Trip</h1>
        <p className="mb-4 text-sm text-muted">Sign in first, then enter the trip code or open a shared join link.</p>
        <form className="space-y-3" onSubmit={onSubmit}>
          <input
            className="w-full rounded-xl border border-[var(--line)] bg-white px-3 py-2 text-sm"
            value={joinCode}
            onChange={(event) => setJoinCode(event.target.value.toUpperCase())}
            placeholder="Enter trip code"
            required
          />
          <button className="btn-primary w-full rounded-xl px-3 py-2 text-sm font-semibold">Join trip</button>
        </form>
        {message ? <p className="mt-3 text-sm text-emerald-700">{message}</p> : null}
        {error ? <p className="mt-3 text-sm text-red-700">{error}</p> : null}
        {joinedTripId ? (
          <Link href={`/app/trips/${joinedTripId}`} className="mt-3 inline-block text-sm font-semibold text-[var(--accent)]">
            Open joined trip
          </Link>
        ) : null}
        <p className="mt-4 text-sm text-muted">
          Need account access? <Link href="/login" className="text-[var(--accent)] font-semibold">Go to login</Link>
        </p>
      </section>
    </div>
  );
}

export default function JoinTripPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto my-10 w-full max-w-lg px-6">
          <section className="card p-6">
            <p className="text-sm text-muted">Loading invitation...</p>
          </section>
        </div>
      }
    >
      <JoinTripClient />
    </Suspense>
  );
}
