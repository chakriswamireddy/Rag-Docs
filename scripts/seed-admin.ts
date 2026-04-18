/**
 * Seed an admin user into the database.
 * Run: npx tsx scripts/seed-admin.ts
 */
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { getDb } from "../lib/db";
import { users } from "../lib/db/schema";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";

const ADMIN_EMAIL = "admin@ragstudio.dev";
const ADMIN_PASSWORD = "Admin@1234!";
const ADMIN_NAME = "Admin";

async function main() {
  const db = getDb();

  // Check if already exists
  const [existing] = await db
    .select({ id: users.id, email: users.email })
    .from(users)
    .where(eq(users.email, ADMIN_EMAIL))
    .limit(1);

  if (existing) {
    console.log(`✅ Admin already exists: ${existing.email} (id: ${existing.id})`);
    process.exit(0);
  }

  const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 12);

  const [created] = await db
    .insert(users)
    .values({
      email: ADMIN_EMAIL,
      name: ADMIN_NAME,
      role: "admin",
      passwordHash,
      emailVerified: new Date(),
    })
    .returning({ id: users.id, email: users.email, role: users.role });

  console.log("✅ Admin user created:");
  console.log(`   Email   : ${created.email}`);
  console.log(`   Password: ${ADMIN_PASSWORD}`);
  console.log(`   Role    : ${created.role}`);
  console.log(`   ID      : ${created.id}`);
}

main().catch((err) => {
  console.error("❌ Seed failed:", err);
  process.exit(1);
});
