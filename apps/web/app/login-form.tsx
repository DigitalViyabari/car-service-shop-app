"use client";

import { Button } from "@dvcs/ui";
import { FirebaseError } from "firebase/app";
import { signInWithEmailAndPassword } from "firebase/auth";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { firebaseClient } from "@/lib/firebase-client";
import { useAuth } from "@/lib/auth-context";

function authMessage(error: unknown): string {
  if (!(error instanceof FirebaseError)) return "Sign-in failed. Please try again.";
  switch (error.code) {
    case "auth/invalid-credential":
    case "auth/user-not-found":
    case "auth/wrong-password":
      return "The email address or password is incorrect.";
    case "auth/too-many-requests":
      return "Too many attempts. Wait a moment and try again.";
    case "auth/network-request-failed":
      return "Network unavailable. Check your connection and try again.";
    default:
      return "Unable to sign in right now. Please try again.";
  }
}

export function LoginForm() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && user) router.replace("/dashboard");
  }, [loading, router, user]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await signInWithEmailAndPassword(firebaseClient.auth, email.trim(), password);
      router.replace("/dashboard");
    } catch (reason) {
      setError(authMessage(reason));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="login-form" onSubmit={handleSubmit} noValidate>
      <span className="eyebrow">Digital Viyabari</span>
      <h2>Welcome back</h2>
      <p className="muted">Sign in to your car service workspace.</p>
      {error ? (
        <div className="alert alert--error" role="alert">
          {error}
        </div>
      ) : null}
      <label>
        Email address
        <input
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="owner@example.com"
          autoComplete="email"
          required
          disabled={submitting}
        />
      </label>
      <label>
        Password
        <input
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="••••••••"
          autoComplete="current-password"
          required
          disabled={submitting}
        />
      </label>
      <Button type="submit" disabled={submitting || !email || !password}>
        {submitting ? "Signing in…" : "Sign in"}
      </Button>
      <p className="muted login-help">Use the account assigned by your company administrator.</p>
    </form>
  );
}
