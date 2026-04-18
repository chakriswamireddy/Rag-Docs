import { getDb } from "@/lib/db";
import { metrics } from "@/lib/db/schema";
import { eq, and, gte, lte, sql, desc } from "drizzle-orm";

export async function recordMetric(
  tenantId: string | null,
  type: string,
  value: number,
  metadata?: Record<string, unknown>
) {
  const db = getDb();
  await db.insert(metrics).values({
    tenantId,
    type,
    value,
    metadata: metadata ?? null,
  });
}

export async function getMetrics(
  tenantId: string,
  filters?: { type?: string; startDate?: string; endDate?: string; limit?: number }
) {
  const db = getDb();
  const conditions = [eq(metrics.tenantId, tenantId)];

  if (filters?.type) {
    conditions.push(eq(metrics.type, filters.type));
  }
  if (filters?.startDate) {
    conditions.push(gte(metrics.createdAt, new Date(filters.startDate)));
  }
  if (filters?.endDate) {
    conditions.push(lte(metrics.createdAt, new Date(filters.endDate)));
  }

  return db
    .select()
    .from(metrics)
    .where(and(...conditions))
    .orderBy(desc(metrics.createdAt))
    .limit(filters?.limit ?? 100);
}

export async function getMetricsSummary(tenantId: string) {
  const db = getDb();

  const result = await db
    .select({
      type: metrics.type,
      avgValue: sql<number>`avg(${metrics.value})`,
      minValue: sql<number>`min(${metrics.value})`,
      maxValue: sql<number>`max(${metrics.value})`,
      count: sql<number>`count(*)`,
    })
    .from(metrics)
    .where(eq(metrics.tenantId, tenantId))
    .groupBy(metrics.type);

  return result;
}
