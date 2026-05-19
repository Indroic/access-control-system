import { redirect } from "next/navigation";

import SetupAdminForm from "@/components/setup-admin-form";
import { fetchSetupStatus } from "@/lib/setup-status";

export default async function SetupPage() {
  const { needsSetup } = await fetchSetupStatus();
  if (!needsSetup) {
    redirect("/login");
  }
  return <SetupAdminForm />;
}
