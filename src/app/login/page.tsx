import { signIn } from "@/auth";
import Link from "next/link";

export default function LoginPage() {
  async function login(formData: FormData) {
    "use server";
    await signIn("credentials", {
      email: formData.get("email"),
      password: formData.get("password"),
      redirectTo: "/",
    });
  }

  return (
    <main className="auth-shell">
      <section className="card auth-card">
        <div className="brand">9Sig Journey</div>
        <h1>Welcome back</h1>
        <p className="muted">Your private 3QQQ 9Sig dashboard.</p>
        <form action={login} className="stack">
          <div className="field"><label>Email</label><input name="email" type="email" required /></div>
          <div className="field"><label>Password</label><input name="password" type="password" minLength={8} required /></div>
          <button className="primary" type="submit">Log in</button>
        </form>
        <p className="muted">New here? <Link href="/register">Create an account</Link></p>
      </section>
    </main>
  );
}