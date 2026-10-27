"use server";

import { signIn, signOut } from "../auth";

export async function signInWithGoogle(): Promise<void> {
  await signIn("google", { redirectTo: "/" });
}

export async function signOutOfPuding(): Promise<void> {
  await signOut({ redirectTo: "/signin" });
}
