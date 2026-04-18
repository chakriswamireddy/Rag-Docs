import { getDb } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import bcrypt from "bcryptjs";

export async function inviteUser(
  tenantId: string,
  email: string,
  role: string = "user",
  name?: string,
  password?: string,
) {
  const db = getDb();
  const trimmedEmail = email.toLowerCase().trim();

  // Check if user already exists
  const [existing] = await db
    .select()
    .from(users)
    .where(eq(users.email, trimmedEmail))
    .limit(1);

  if (existing) {
    // If user exists but not in this tenant, assign them
    if (existing.tenantId !== tenantId) {
      const [updated] = await db
        .update(users)
        .set({ tenantId, role })
        .where(eq(users.id, existing.id))
        .returning();
      return { user: updated, created: false };
    }
    return { user: existing, created: false };
  }

  // Hash provided password or generate a random one
  const rawPassword = password?.trim() || crypto.randomUUID();
  const passwordHash = await bcrypt.hash(rawPassword, 12);

  const [user] = await db
    .insert(users)
    .values({
      email: trimmedEmail,
      name: name?.trim() || null,
      tenantId,
      role,
      passwordHash,
    })
    .returning();

  return { user, created: true };
}

export async function listUsers(tenantId: string) {
  const db = getDb();
  return db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      role: users.role,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(eq(users.tenantId, tenantId))
    .orderBy(users.createdAt);
}

export async function updateUserRole(userId: string, role: string) {
  const db = getDb();
  const [updated] = await db
    .update(users)
    .set({ role })
    .where(eq(users.id, userId))
    .returning({
      id: users.id,
      email: users.email,
      role: users.role,
    });
  return updated ?? null;
}

export async function removeUser(userId: string, tenantId: string) {
  const db = getDb();
  const [deleted] = await db
    .delete(users)
    .where(and(eq(users.id, userId), eq(users.tenantId, tenantId)))
    .returning({ id: users.id });
  return deleted ?? null;
}

export async function getUserById(userId: string) {
  const db = getDb();
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return user ?? null;
}

export async function assignUserToTenant(userId: string, tenantId: string) {
  const db = getDb();
  const [updated] = await db
    .update(users)
    .set({ tenantId })
    .where(eq(users.id, userId))
    .returning();
  return updated ?? null;
}
