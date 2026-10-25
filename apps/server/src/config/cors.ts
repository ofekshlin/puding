/** Preview deployments of the `puding-web` Vercel project (team `shlin`). */
const VERCEL_PREVIEW_ORIGIN =
  /^https:\/\/puding-web-[a-z0-9-]+-shlin\.vercel\.app$/;

/** CORS allows the configured web origins plus `puding-web` previews. */
export function isAllowedOrigin(
  origin: string,
  webOrigins: readonly string[],
): boolean {
  return webOrigins.includes(origin) || VERCEL_PREVIEW_ORIGIN.test(origin);
}
