import "dotenv/config";
import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
	server: {
		DATABASE_URL: z
			.string()
			.default("postgresql://postgres:password@localhost:5432/biometric_db"),
		BETTER_AUTH_SECRET: z
			.string()
			.default(
				"a-very-safe-development-secret-key-for-better-auth-32-chars-minimum!!",
			),
		BETTER_AUTH_URL: z.url().default("http://localhost:3000"),
		BIOMETRIC_API_URL: z.url().default("http://localhost:8000"),
		CORS_ORIGIN: z.url().default("http://localhost:3001"),
		ADMIN_SETUP_SECRET: z
			.string()
			.default("super-secret-admin-setup-key-123456"),
		INTERNAL_API_KEY: z
			.string()
			.default("change-me-to-a-safe-internal-secret-key-12345!!"),
		VAPID_PUBLIC_KEY: z
			.string()
			.default(
				"BMRqLkyQkQJwuYsobpLcURXWHe7wZs0oFQ4kmmmmR2AgGceh4E-v9sZeCequheux6NOu-sSV4xHRFWSvDQ_44R0",
			),
		VAPID_PRIVATE_KEY: z
			.string()
			.default("adFa0rhRonWnPMak2EPDtWj7l1GZQUeuOLYcv2QiM9g"),
		VAPID_SUBJECT: z.string().default("mailto:admin@example.com"),
		NODE_ENV: z
			.enum(["development", "production", "test"])
			.default("development"),
	},
	runtimeEnv: process.env,
	emptyStringAsUndefined: true,
});
