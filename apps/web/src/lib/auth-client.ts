import { faceBiometricsClientPlugin } from "@access-control-system/auth/plugins/biometric-client";
import { env } from "@access-control-system/env/web";
import { createAuthClient } from "better-auth/react";

const baseURL =
  typeof window === "undefined"
    ? (process.env.INTERNAL_SERVER_URL ?? env.NEXT_PUBLIC_SERVER_URL)
    : env.NEXT_PUBLIC_SERVER_URL;

export const authClient = createAuthClient({
  baseURL,
  plugins: [faceBiometricsClientPlugin()],
});
