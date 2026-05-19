import type { Route } from "next";
import { redirect } from "next/navigation";

import { fetchSetupStatus } from "@/lib/setup-status";

export default async function Home() {
  const { needsSetup } = await fetchSetupStatus();
  if (needsSetup) {
    redirect("/setup" as Route);
  }
  redirect("/login");
}
