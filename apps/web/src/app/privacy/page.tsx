export const metadata = { title: "Puding · Privacy" };

export default function PrivacyPage() {
  return (
    <div className="container">
      <main className="card admin-panel">
        <header className="logo-container">
          <h1 className="title">Privacy</h1>
          <p className="subtitle">
            <a href="/">← Back to Puding</a>
          </p>
        </header>
        <section className="connection-card">
          <p className="connection-card-text">
            Puding is a small, invite-only voice assistant. When you sign in
            with Google it stores your email, name and picture to identify your
            account.
          </p>
          <p className="connection-card-text">
            When you connect Notion, Spotify or Devin, Puding stores the access
            tokens those services issue, encrypted on its server. They are used
            only to carry out the requests you make, are never shown to other
            users, and are never sold or shared.
          </p>
          <p className="connection-card-text">
            Voice audio is streamed to Google Gemini to understand and answer
            you, and web searches are sent to Tavily. Puding does not keep
            recordings.
          </p>
          <p className="connection-card-text">
            You can disconnect any app, or delete your account and every stored
            token, at any time from Settings.
          </p>
        </section>
      </main>
    </div>
  );
}
