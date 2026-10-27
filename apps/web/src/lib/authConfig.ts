/**
 * Google sign-in turns on once the web app has an Auth.js secret, a Google
 * client and the secret it shares with the backend; until then the app keeps
 * the legacy shared access token.
 */
export function isAuthConfigured(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return Boolean(
    env.AUTH_SECRET &&
    env.AUTH_GOOGLE_ID &&
    env.AUTH_GOOGLE_SECRET &&
    env.PUDING_AUTH_SECRET,
  );
}
