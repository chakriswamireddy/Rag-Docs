import { getDb } from "@/lib/db";
import { tenants } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function createTenant(data: { name: string; slug: string; plan?: string }) {
  const db = getDb();
  const [tenant] = await db
    .insert(tenants)
    .values({ name: data.name, slug: data.slug, plan: data.plan ?? "free" })
    .returning();
  return tenant;
}

export async function listTenants() {
  const db = getDb();
  return db.select().from(tenants).orderBy(tenants.createdAt);
}

export async function getTenant(id: string) {
  const db = getDb();
  const [tenant] = await db
    .select()
    .from(tenants)
    .where(eq(tenants.id, id))
    .limit(1);
  return tenant ?? null;
}

export async function getTenantBySlug(slug: string) {
  const db = getDb();
  const [tenant] = await db
    .select()
    .from(tenants)
    .where(eq(tenants.slug, slug))
    .limit(1);
  return tenant ?? null;
}

export async function updateTenant(id: string, name: string) {
  const db = getDb();
  const [updated] = await db
    .update(tenants)
    .set({ name })
    .where(eq(tenants.id, id))
    .returning();
  return updated ?? null;
}

export async function deleteTenant(id: string) {
  const db = getDb();
  const [deleted] = await db
    .delete(tenants)
    .where(eq(tenants.id, id))
    .returning({ id: tenants.id });
  return deleted ?? null;
}

