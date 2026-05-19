import { env } from "@access-control-system/env/web";

const serverURL = process.env.INTERNAL_SERVER_URL ?? env.NEXT_PUBLIC_SERVER_URL;

export async function fetchSetupStatus(): Promise<{ needsSetup: boolean }> {
  const res = await fetch(`${serverURL}/setup-status`, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`setup-status returned ${res.status}`);
  }
  return res.json() as Promise<{ needsSetup: boolean }>;
}
