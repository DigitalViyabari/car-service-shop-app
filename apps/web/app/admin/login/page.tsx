"use client";

import { signInWithEmailAndPassword } from "firebase/auth";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { firebaseClient } from "@/lib/firebase-client";

export default function PlatformLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function login(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await signInWithEmailAndPassword(firebaseClient.auth, email.trim().toLowerCase(), password);
      router.replace("/admin");
    } catch {
      setError("Email or password is incorrect, or this account is not enabled.");
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
        </form>
        <small>Account access and impersonation actions are audited.</small>
      </section>
    </main>
  );
}
