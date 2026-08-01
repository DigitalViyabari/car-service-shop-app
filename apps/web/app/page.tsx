import Link from "next/link";
import { Button } from "@dvcs/ui";
export default function LoginPage() {
  return (
    <main className="login">
      <section className="login-hero">
        <span className="eyebrow">Automotive operations, unified</span>
        <h1>Run every workshop with clarity.</h1>
        <p>
          Digital Viyabari Car Service gives owners one secure view across every branch while each
          team stays focused on its own operations.
        </p>
      </section>
      <section className="login-panel">
        <form className="login-form">
          <span className="eyebrow">Digital Viyabari</span>
          <h2>Welcome back</h2>
          <p className="muted">Sign in to your car service workspace.</p>
          <label>
            Email address
            <input type="email" placeholder="owner@example.com" autoComplete="email" />
          </label>
          <label>
            Password
            <input type="password" placeholder="••••••••" autoComplete="current-password" />
          </label>
          <Link href="/dashboard">
            <Button type="button">Sign in</Button>
          </Link>
          <p className="muted">
            Authentication wiring will use Firebase Auth after project configuration.
          </p>
        </form>
      </section>
    </main>
  );
}
