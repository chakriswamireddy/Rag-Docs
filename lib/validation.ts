import { z } from "zod";

// ─── Ask endpoint ──────────────────────────────────────────────────────────

export const askSchema = z.object({
  question: z
    .string()
    .min(1, "Question is required")
    .max(2000, "Question must be under 2000 characters"),
  history: z
    .array(
      z.object({
        question: z.string(),
        answer: z.string(),
      })
    )
    .optional()
    .default([]),
  mode: z.enum(["json", "stream", "agent"]).optional().default("json"),
});

// ─── Upload endpoint ───────────────────────────────────────────────────────

export const uploadSchema = z.object({
  storageProvider: z.enum(["cloudflare", "aws"]).optional().default("cloudflare"),
});

// ─── Summarize endpoint ────────────────────────────────────────────────────

export const summarizeSchema = z.object({
  fileName: z.string().optional(),
});

// ─── Tenant management ────────────────────────────────────────────────────

export const createTenantSchema = z.object({
  name: z.string().min(1, "Name is required").max(255),
});

export const updateTenantSchema = z.object({
  name: z.string().min(1, "Name is required").max(255),
});

// ─── User management ──────────────────────────────────────────────────────

export const inviteUserSchema = z.object({
  email: z.string().email("Invalid email"),
  role: z.enum(["user", "admin", "super_admin"]).optional().default("user"),
  name: z.string().max(100).optional(),
});

export const updateRoleSchema = z.object({
  role: z.enum(["user", "admin", "super_admin"]),
});

// ─── Registration ──────────────────────────────────────────────────────────

export const registerSchema = z.object({
  email: z.string().email("Invalid email"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  name: z.string().max(100).optional(),
});

// ─── Evaluation ────────────────────────────────────────────────────────────

export const createEvalSchema = z.object({
  question: z.string().min(1, "Question is required").max(2000),
  expectedAnswer: z.string().min(1, "Expected answer is required").max(5000),
});

// ─── Helper: validate and return parsed data or error response ─────────────

export function validate<T>(schema: z.ZodSchema<T>, data: unknown):
  | { success: true; data: T }
  | { success: false; error: string } {
  const result = schema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }
  const message = result.error.issues
    .map((i) => `${i.path.join(".")}: ${i.message}`)
    .join("; ");
  return { success: false, error: message };
}
