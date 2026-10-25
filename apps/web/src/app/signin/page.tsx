import { redirect } from "next/navigation";
import { auth } from "../../auth";
import { isAuthConfigured } from "../../lib/authConfig";
import { signInWithGoogle } from "../actions";

export const dynamic = "force-dynamic";

const ERRORS: Record<string, string> = {
  AccessDenied: "Google did not confirm this account's email address.",
};

export default async function SignInPage({
  searchParams,
}: {
  searchParams: { error?: string };
}) {
  if (!isAuthConfigured() || (await auth())?.user) redirect("/");

  const error = searchParams.error
    ? (ERRORS[searchParams.error] ?? "Sign-in failed. Please try again.")
    : null;

  return (
    <div className="container">
      <main className="card">
        <header className="logo-container">
          <h1 className="title">Puding 🍮</h1>
          <p className="subtitle">Sign in to talk to Puding</p>
        </header>

        <form action={signInWithGoogle} className="signin-form">
          <button type="submit" className="btn btn-primary">
            Continue with Google
          </button>
        </form>

        {error && (
          <p className="signin-error" role="alert">
            {error}
          </p>
        )}
      </main>
    </div>
  );
}
