"use client";

import { sendPasswordResetEmail, signInWithEmailAndPassword } from "firebase/auth";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { firebaseClient } from "@/lib/firebase-client";

export default function PlatformLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  async function login(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await signInWithEmailAndPassword(firebaseClient.auth, email.trim().toLowerCase(), password);
      router.replace("/admin");
    } catch {
      setError("Email or password is incorrect, or this account is not enabled.");
      setBusy(false);
    }
  }
  async function resetPassword() {
    if (!email.trim()) {
      setError("Enter the administrator email address first.");
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await sendPasswordResetEmail(firebaseClient.auth, email.trim().toLowerCase());
      setNotice("Password reset email sent. Check the administrator inbox.");
    } catch {
      setError("Unable to send the reset email. Confirm the account email address.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="platform-login">
      <section>
        <div className="platform-login-brand">
          <i className="brand-mark" />{" "}
          <strong>
            DIGITAL <span>VIYABARI</span>
          </strong>
        </div>
        <span className="heading-kicker">Secure Platform Access</span>
        <h1>Administration Login</h1>
        <p>For authorised Super Admin and Support Admin accounts only.</p>
        {error ? <div className="alert alert--error">{error}</div> : null}
        {notice ? <div className="alert">{notice}</div> : null}
        <form onSubmit={login}>
          <label>
            Email Address
            <input
              type="email"
              autoComplete="username"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </label>
          <label>
            Password
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </label>
          <button className="dv-button" disabled={busy}>
            {busy ? "Signing In…" : "Sign In To Control Centre"}
          </button>
          <button
            type="button"
            className="platform-reset-password"
            disabled={busy}
            onClick={() => void resetPassword()}
          >
            Forgot / Set Password
          </button>
        </form>
        <small>Account access and impersonation actions are audited.</small>
      </section>
    </main>
  );
}
