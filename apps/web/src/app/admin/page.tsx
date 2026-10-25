import { redirect } from "next/navigation";
import { auth } from "../../auth";
import { AdminPanel } from "../../components/AdminPanel";
import { isAuthConfigured } from "../../lib/authConfig";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  if (!isAuthConfigured()) redirect("/");
  const user = (await auth())?.user;
  if (!user) redirect("/signin");

  return (
    <AdminPanel
      user={{ name: user.name, email: user.email, image: user.image }}
    />
  );
}
