import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  integer,
  bigint,
  real,
  boolean,
  jsonb,
  index,
  primaryKey,
} from "drizzle-orm/pg-core";

// ─── 1. Multi-tenant foundation ────────────────────────────────────────────

export const tenants = pgTable("tenants", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  slug: varchar("slug", { length: 100 }).unique().notNull(),
  plan: varchar("plan", { length: 50 }).default("free").notNull(),
  status: varchar("status", { length: 50 }).default("active").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "cascade" }),
  email: varchar("email", { length: 255 }).unique().notNull(),
  name: varchar("name", { length: 100 }),
  role: varchar("role", { length: 50 }).default("user"),
  passwordHash: text("password_hash"),
  emailVerified: timestamp("email_verified"),
  image: text("image"),
  createdAt: timestamp("created_at").defaultNow(),
});

// ─── NextAuth tables ───────────────────────────────────────────────────────

export const accounts = pgTable(
  "accounts",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: varchar("type", { length: 255 }).notNull(),
    provider: varchar("provider", { length: 255 }).notNull(),
    providerAccountId: varchar("provider_account_id", { length: 255 }).notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: varchar("token_type", { length: 255 }),
    scope: varchar("scope", { length: 255 }),
    id_token: text("id_token"),
    session_state: varchar("session_state", { length: 255 }),
  },
  (table) => [
    primaryKey({ columns: [table.provider, table.providerAccountId] }),
  ]
);

export const sessions = pgTable("sessions", {
  sessionToken: varchar("session_token", { length: 255 }).primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires").notNull(),
});

export const verificationTokens = pgTable(
  "verification_tokens",
  {
    identifier: varchar("identifier", { length: 255 }).notNull(),
    token: varchar("token", { length: 255 }).notNull(),
    expires: timestamp("expires").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.identifier, table.token] }),
  ]
);

// ─── 2. Documents (ingestion + lifecycle) ──────────────────────────────────

export const documents = pgTable(
  "documents",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "cascade" }),
    userId: uuid("user_id").references(() => users.id),
    fileName: text("file_name"),
    fileUrl: text("file_url").notNull(),
    fileHash: text("file_hash"),
    fileSize: bigint("file_size", { mode: "number" }),
    mimeType: varchar("mime_type", { length: 100 }),
    status: varchar("status", { length: 50 }).default("uploaded"),
    totalChunks: integer("total_chunks").default(0),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (table) => [
    index("idx_docs_tenant").on(table.tenantId),
  ]
);

// ─── 3. Chunk-level intelligence ───────────────────────────────────────────

export const documentChunks = pgTable(
  "document_chunks",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "cascade" }),
    documentId: uuid("document_id").references(() => documents.id, { onDelete: "cascade" }),
    chunkIndex: integer("chunk_index"),
    content: text("content"),
    sectionTitle: text("section_title"),
    pageNumber: integer("page_number"),
    embeddingId: text("embedding_id").notNull(),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => [
    index("idx_chunks_doc").on(table.documentId),
    index("idx_chunks_tenant").on(table.tenantId),
  ]
);

// ─── 4. Processing pipeline ────────────────────────────────────────────────

export const processingJobs = pgTable(
  "processing_jobs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id").references(() => tenants.id),
    documentId: uuid("document_id").references(() => documents.id, { onDelete: "cascade" }),
    stage: varchar("stage", { length: 50 }),
    status: varchar("status", { length: 50 }).default("pending"),
    attempts: integer("attempts").default(0),
    maxAttempts: integer("max_attempts").default(3),
    errorMessage: text("error_message"),
    startedAt: timestamp("started_at"),
    completedAt: timestamp("completed_at"),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => [
    index("idx_jobs_status").on(table.status),
  ]
);

// ─── 5. Query intelligence ─────────────────────────────────────────────────

export const queries = pgTable(
  "queries",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id").references(() => tenants.id),
    userId: uuid("user_id").references(() => users.id),
    originalQuery: text("original_query"),
    rewrittenQuery: text("rewritten_query"),
    queryType: varchar("query_type", { length: 50 }),
    topK: integer("top_k"),
    reranked: boolean("reranked").default(false),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => [
    index("idx_queries_tenant").on(table.tenantId),
  ]
);

export const queryRetrievals = pgTable("query_retrievals", {
  id: uuid("id").defaultRandom().primaryKey(),
  queryId: uuid("query_id").references(() => queries.id, { onDelete: "cascade" }),
  chunkId: uuid("chunk_id").references(() => documentChunks.id),
  score: real("score"),
  rerankScore: real("rerank_score"),
  rank: integer("rank"),
  createdAt: timestamp("created_at").defaultNow(),
});

// ─── 6. Responses + citations ──────────────────────────────────────────────

export const responses = pgTable("responses", {
  id: uuid("id").defaultRandom().primaryKey(),
  queryId: uuid("query_id").references(() => queries.id, { onDelete: "cascade" }),
  answer: text("answer"),
  confidenceScore: real("confidence_score"),
  tokenUsage: integer("token_usage"),
  latencyMs: integer("latency_ms"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const responseSources = pgTable("response_sources", {
  id: uuid("id").defaultRandom().primaryKey(),
  responseId: uuid("response_id").references(() => responses.id, { onDelete: "cascade" }),
  chunkId: uuid("chunk_id").references(() => documentChunks.id),
  documentId: uuid("document_id").references(() => documents.id),
  createdAt: timestamp("created_at").defaultNow(),
});

// ─── 7. Observability ──────────────────────────────────────────────────────

export const metrics = pgTable("metrics", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id").references(() => tenants.id),
  type: varchar("type", { length: 50 }),
  value: real("value"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow(),
});

// ─── 8. Evaluation ─────────────────────────────────────────────────────────

export const evaluations = pgTable("evaluations", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id").references(() => tenants.id),
  question: text("question"),
  expectedAnswer: text("expected_answer"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const evaluationResults = pgTable("evaluation_results", {
  id: uuid("id").defaultRandom().primaryKey(),
  evaluationId: uuid("evaluation_id").references(() => evaluations.id),
  retrievedCorrect: boolean("retrieved_correct"),
  answerCorrect: boolean("answer_correct"),
  score: real("score"),
  createdAt: timestamp("created_at").defaultNow(),
});
