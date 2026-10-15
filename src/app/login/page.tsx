"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { api } from "@/lib/client";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setLoading(true);

    try {
      await api("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      router.push("/app");
      router.refresh();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto my-10 w-full max-w-md px-6">
      <section className="card p-7">
        <h1 className="mb-2 text-3xl">Welcome back</h1>
        <p className="mb-6 text-sm text-muted">Sign in to manage trips and settlements.</p>
        <form className="space-y-4" onSubmit={onSubmit}>
          <label className="block text-sm font-medium">
            Email
            <input
              className="mt-1 w-full rounded-xl border border-[var(--line)] bg-white px-3 py-2"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </label>
          <label className="block text-sm font-medium">
            Password
            <input
              className="mt-1 w-full rounded-xl border border-[var(--line)] bg-white px-3 py-2"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </label>
          {error ? <p className="text-sm text-red-700">{error}</p> : null}
          <button className="btn-primary w-full rounded-xl px-4 py-2 text-sm font-semibold" disabled={loading}>
            {loading ? "Signing in..." : "Sign in"}
          </button>
        </form>
        <p className="mt-4 text-sm text-muted">
          New here? <Link href="/register" className="font-semibold text-[var(--accent)]">Create an account</Link>
        </p>
      </section>
    </div>
  );
}
