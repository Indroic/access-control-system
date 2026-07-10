import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { user } from "./auth";

export const pushSubscription = pgTable("push_subscription", {
	id: text("id")
		.primaryKey()
		.$defaultFn(() => crypto.randomUUID()),
	userId: text("user_id")
		.notNull()
		.references(() => user.id, { onDelete: "cascade" }),
	endpoint: text("endpoint").notNull().unique(),
	p256dh: text("p256dh").notNull(),
	auth: text("auth").notNull(),
	createdAt: timestamp("created_at").defaultNow().notNull(),
});
