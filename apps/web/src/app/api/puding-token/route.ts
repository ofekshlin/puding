import { SignJWT } from "jose";
import { NextResponse } from "next/server";
import { auth } from "../../../auth";
import { isAuthConfigured } from "../../../lib/authConfig";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };
const AUDIENCE = "puding-backend";
const LIFETIME = "5m";

/**
 * Mints the short-lived token the backend verifies on every WebSocket connect
 * and REST call. Returns `{ token: null }` while Google sign-in is not set up.
 */
export async function GET() {
  const secret = process.env.PUDING_AUTH_SECRET;
  if (!isAuthConfigured() || !secret) {
    return NextResponse.json({ token: null }, { headers: NO_STORE });
  }

  const user = (await auth())?.user;
  if (!user?.googleSub || !user.email) {
    return NextResponse.json(
      { error: "signed_out" },
      { status: 401, headers: NO_STORE },
    );
  }

  const token = await new SignJWT({
    email: user.email,
    name: user.name ?? undefined,
    picture: user.image ?? undefined,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.googleSub)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(LIFETIME)
    .sign(new TextEncoder().encode(secret));

  return NextResponse.json({ token }, { headers: NO_STORE });
}
