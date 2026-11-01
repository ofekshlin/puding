export const metadata = { title: "Puding · Terms of use" };

export default function TermsPage() {
  return (
    <div className="container">
      <main className="card admin-panel">
        <header className="logo-container">
          <h1 className="title">Terms of use</h1>
          <p className="subtitle">
            <a href="/">← Back to Puding</a>
          </p>
        </header>
        <section className="connection-card">
          <p className="connection-card-text">
            Puding is a personal project offered as is, without warranties or
            guarantees of availability. Access is by invitation and can be
            revoked at any time.
          </p>
          <p className="connection-card-text">
            Actions Puding takes in apps you connect (Notion, Spotify, Devin)
            are taken on your behalf and under those services&apos; own terms.
          </p>
          <p className="connection-card-text">
            Don&apos;t use Puding for anything unlawful or to abuse the
            connected services. Shared features such as web search have daily
            limits.
          </p>
          <p className="connection-card-text">
            See the <a href="/privacy">privacy page</a> for what is stored and
            how to delete it.
          </p>
        </section>
      </main>
    </div>
  );
}
