/**
 * Add slug, plan, status columns to tenants table.
 * Run: npx tsx scripts/migrate-tenants.ts
 */
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { neon } from "@neondatabase/serverless";

async function main() {
  const sql = neon(process.env.DATABASE_URL!);

  console.log("Adding columns to tenants table...");

  await sql`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS slug VARCHAR(100)`;
  await sql`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS plan VARCHAR(50) NOT NULL DEFAULT 'free'`;
  await sql`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS status VARCHAR(50) NOT NULL DEFAULT 'active'`;

  // Back-fill slug for any existing tenants (use first 8 chars of id)
  await sql`UPDATE tenants SET slug = LOWER(REPLACE(name, ' ', '-')) WHERE slug IS NULL OR slug = ''`;

  // Now make slug unique + not null
  await sql`ALTER TABLE tenants ALTER COLUMN slug SET NOT NULL`;

  // Add unique constraint if not already there
  await sql`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'tenants_slug_unique'
      ) THEN
        ALTER TABLE tenants ADD CONSTRAINT tenants_slug_unique UNIQUE (slug);
      END IF;
    END $$
  `;

  console.log("✅ Tenants table updated with slug, plan, status columns.");
}

main().catch((err) => {
  console.error("❌ Migration failed:", err);
  process.exit(1);
});
