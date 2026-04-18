import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { getDb } from "@/lib/db";
import { users, accounts, sessions, verificationTokens, tenants } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: DrizzleAdapter(getDb(), {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  }),
  session: { strategy: "jwt" },
  pages: {
    signIn: "/auth/signin",
    error: "/auth/error",
  },
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        const email = String(credentials.email).toLowerCase().trim();
        const password = String(credentials.password);

        const db = getDb();
        const [user] = await db
          .select()
          .from(users)
          .where(eq(users.email, email))
          .limit(1);

        if (!user || !user.passwordHash) return null;

        const valid = await bcrypt.compare(password, user.passwordHash);
        if (!valid) return null;

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          image: user.image,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
      }
      // Attach tenant_id and role on every JWT refresh
      if (token.id) {
        const db = getDb();
        const [dbUser] = await db
          .select({
            tenantId: users.tenantId,
            role: users.role,
          })
          .from(users)
          .where(eq(users.id, token.id as string))
          .limit(1);

        if (dbUser) {
          token.tenantId = dbUser.tenantId;
          token.role = dbUser.role ?? undefined;
          // Attach tenant slug for client-side navigation
          if (dbUser.tenantId) {
            const [tenant] = await db
              .select({ slug: tenants.slug })
              .from(tenants)
              .where(eq(tenants.id, dbUser.tenantId))
              .limit(1);
            token.tenantSlug = tenant?.slug ?? null;
          } else {
            token.tenantSlug = null;
          }
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (token) {
        session.user.id = token.id as string;
        session.user.tenantId = token.tenantId as string | null;
        session.user.tenantSlug = token.tenantSlug as string | null;
        session.user.role = token.role as string;
      }
      return session;
    },
  },
});

// Type augmentation for session
declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      email: string;
      name?: string | null;
      image?: string | null;
      tenantId: string | null;
      tenantSlug: string | null;
      role: string;
    };
  }
}

declare module "@auth/core/jwt" {
  interface JWT {
    id?: string;
    tenantId?: string | null;
    tenantSlug?: string | null;
    role?: string;
  }
}
