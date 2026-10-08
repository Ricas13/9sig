export const dynamic = "force-static";

export default function OfflinePage() {
  return <main className="auth-page"><section className="glass auth-card">
    <h1>You are offline.</h1>
    <p>Your strategies and calculations need a connection so they are always up to date. Nothing has been lost. Reconnect and try again.</p>
    <p><a className="button primary" href="/app">Try again</a></p>
  </section></main>;
}
