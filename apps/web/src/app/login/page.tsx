import type { Route } from "next";
import { redirect } from "next/navigation";

import SignInForm from "@/components/sign-in-form";
import { fetchSetupStatus } from "@/lib/setup-status";

export default async function LoginPage() {
  const { needsSetup } = await fetchSetupStatus();
  if (needsSetup) {
    redirect("/setup" as Route);
  }
  return <SignInForm />;
}
