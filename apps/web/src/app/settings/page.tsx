import { redirect } from "next/navigation";
import { auth } from "../../auth";
import { SettingsPanel } from "../../components/SettingsPanel";
import { isAuthConfigured } from "../../lib/authConfig";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  if (!isAuthConfigured()) redirect("/");
  const user = (await auth())?.user;
  if (!user) redirect("/signin");

  return (
    <SettingsPanel
      user={{ name: user.name, email: user.email, image: user.image }}
    />
  );
}
