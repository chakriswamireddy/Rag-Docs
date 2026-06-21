/**
 * Seed a simple test user into the database.
 * Run: npx tsx scripts/seed-test-user.ts
 *
 * The test user is intentionally constrained at the app level:
 *   - uploads are capped at 1 MB
 *   - uploads are forced to Cloudflare R2 (no AWS S3 option)
 * These limits are enforced wherever `role === "test"` is checked.
 */
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { getDb } from "../lib/db";
import { users } from "../lib/db/schema";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";

const TEST_EMAIL = "test@ragstudio.dev";
const TEST_PASSWORD = "Test@1234!";
const TEST_NAME = "Test User";

async function main() {
  const db = getDb();

  // Check if already exists
  const [existing] = await db
    .select({ id: users.id, email: users.email })
    .from(users)
    .where(eq(users.email, TEST_EMAIL))
    .limit(1);

  if (existing) {
    console.log(`✅ Test user already exists: ${existing.email} (id: ${existing.id})`);
    process.exit(0);
  }

  const passwordHash = await bcrypt.hash(TEST_PASSWORD, 12);

  const [created] = await db
    .insert(users)
    .values({
      email: TEST_EMAIL,
      name: TEST_NAME,
      role: "test",
      passwordHash,
      emailVerified: new Date(),
    })
    .returning({ id: users.id, email: users.email, role: users.role });

  console.log("✅ Test user created:");
  console.log(`   Email   : ${created.email}`);
  console.log(`   Password: ${TEST_PASSWORD}`);
  console.log(`   Role    : ${created.role}`);
  console.log(`   ID      : ${created.id}`);
}

main().catch((err) => {
  console.error("❌ Seed failed:", err);
  process.exit(1);
});
