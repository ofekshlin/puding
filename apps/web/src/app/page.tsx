import { redirect } from "next/navigation";
import { auth } from "../auth";
import { AccountGate } from "../components/AccountGate";
import { VoiceApp } from "../components/VoiceApp";
import { isAuthConfigured } from "../lib/authConfig";

export const dynamic = "force-dynamic";

export default async function Home() {
  if (!isAuthConfigured()) return <VoiceApp />;

  const user = (await auth())?.user;
  if (!user) redirect("/signin");

  return (
    <AccountGate
      user={{ name: user.name, email: user.email, image: user.image }}
    />
  );
}
