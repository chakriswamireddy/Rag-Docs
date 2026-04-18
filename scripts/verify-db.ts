/**
 * Quick script to verify Neon DB connection via Drizzle.
 * Run: npx tsx scripts/verify-db.ts
 */
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { db } from "../lib/db";
import { tenants } from "../lib/db/schema";
import { eq } from "drizzle-orm";

async function main() {
  console.log("🔌 Connecting to Neon...");

  // 1. Insert a test tenant
  const [inserted] = await db
    .insert(tenants)
    .values({ name: "__test_connection__", slug: "__test_connection__" })
    .returning();

  console.log("✅ Insert OK:", inserted);

  // 2. Read it back
  const [fetched] = await db
    .select()
    .from(tenants)
    .where(eq(tenants.id, inserted.id));

  console.log("✅ Select OK:", fetched);

  // 3. Clean up
  await db.delete(tenants).where(eq(tenants.id, inserted.id));
  console.log("✅ Delete OK — test tenant removed");

  console.log("\n🎉 Database connection verified successfully!");
}

main().catch((err) => {
  console.error("❌ DB verification failed:", err);
  process.exit(1);
});
