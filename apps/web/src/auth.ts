import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [Google],
  session: { strategy: "jwt" },
  pages: { signIn: "/signin", error: "/signin" },
  trustHost: true,
  callbacks: {
    signIn({ account, profile }) {
      return account?.provider === "google" && profile?.email_verified === true;
    },
    jwt({ token, account, profile }) {
      if (account?.provider === "google" && profile?.sub) {
        token.googleSub = profile.sub;
      }
      return token;
    },
    session({ session, token }) {
      if (typeof token.googleSub === "string") {
        session.user.googleSub = token.googleSub;
      }
      return session;
    },
  },
});
