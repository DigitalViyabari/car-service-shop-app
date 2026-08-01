import { LoginForm } from "./login-form";
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
        <LoginForm />
      </section>
    </main>
  );
}
