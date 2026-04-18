/**
 * Run schema migrations for NextAuth tables and user columns.
 * Run: npx tsx scripts/migrate-auth.ts
 */
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL!);

async function main() {
  console.log("Running auth schema migrations...\n");

  // 1. Add NextAuth columns to users table (safe: IF NOT EXISTS via DO block)
  await sql`
    DO $$ BEGIN
      ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified TIMESTAMPTZ;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS image TEXT;
    END $$;
  `;
  console.log("✅ users table: added password_hash, email_verified, image columns");

  // 2. Create accounts table
  await sql`
    CREATE TABLE IF NOT EXISTS accounts (
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type VARCHAR(255) NOT NULL,
      provider VARCHAR(255) NOT NULL,
      provider_account_id VARCHAR(255) NOT NULL,
      refresh_token TEXT,
      access_token TEXT,
      expires_at INTEGER,
      token_type VARCHAR(255),
      scope VARCHAR(255),
      id_token TEXT,
      session_state VARCHAR(255),
      PRIMARY KEY (provider, provider_account_id)
    );
  `;
  console.log("✅ accounts table created");

  // 3. Create sessions table
  await sql`
    CREATE TABLE IF NOT EXISTS sessions (
      session_token VARCHAR(255) PRIMARY KEY,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires TIMESTAMPTZ NOT NULL
    );
  `;
  console.log("✅ sessions table created");

  // 4. Create verification_tokens table
  await sql`
    CREATE TABLE IF NOT EXISTS verification_tokens (
      identifier VARCHAR(255) NOT NULL,
      token VARCHAR(255) NOT NULL,
      expires TIMESTAMPTZ NOT NULL,
      PRIMARY KEY (identifier, token)
    );
  `;
  console.log("✅ verification_tokens table created");

  console.log("\n🎉 Auth schema migration complete!");
}

main().catch((err) => {
  console.error("❌ Migration failed:", err);
  process.exit(1);
});
