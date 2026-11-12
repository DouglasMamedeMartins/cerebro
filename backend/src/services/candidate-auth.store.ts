import { and, eq, gt, isNull, ne, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { candidateSessions, candidates } from "../db/schema.js";

export type AuthCandidate = {
  id: string;
  name: string;
  email: string;
  isActive: boolean;
  passwordHash: string | null;
};

export type CandidateAuthStore = {
  findCandidateByEmail(email: string): Promise<AuthCandidate | undefined>;
  getCandidatePasswordHash(candidateId: string): Promise<string | null | undefined>;
  setCandidatePassword(candidateId: string, passwordHash: string): Promise<boolean>;
  changeCandidatePassword(input: {
    candidateId: string;
    expectedPasswordHash: string;
    newPasswordHash: string;
    currentSessionId: string;
    changedAt: Date;
  }): Promise<boolean>;
  createSession(candidateId: string, tokenHash: string, expiresAt: Date): Promise<string>;
  resolveSession(tokenHash: string, now: Date): Promise<{ sessionId: string; candidateId: string } | undefined>;
  revokeSession(sessionId: string, now: Date): Promise<void>;
  getCandidate(candidateId: string): Promise<Pick<AuthCandidate, "id" | "name" | "email"> | undefined>;
};

export function createDrizzleCandidateAuthStore(db: PostgresJsDatabase): CandidateAuthStore {
  return {
    async findCandidateByEmail(email) {
      const [candidate] = await db.select({ id: candidates.id, name: candidates.name, email: candidates.email, isActive: candidates.isActive, passwordHash: candidates.passwordHash })
        .from(candidates).where(sql`lower(${candidates.email}) = ${email}`).limit(1);
      return candidate;
    },
    async getCandidatePasswordHash(candidateId) {
      const [candidate] = await db.select({ passwordHash: candidates.passwordHash })
        .from(candidates).where(and(eq(candidates.id, candidateId), eq(candidates.isActive, true))).limit(1);
      return candidate?.passwordHash;
    },
    async setCandidatePassword(candidateId, passwordHash) {
      const [candidate] = await db.update(candidates).set({ passwordHash, updatedAt: new Date() })
        .where(and(eq(candidates.id, candidateId), eq(candidates.isActive, true))).returning({ id: candidates.id });
      return Boolean(candidate);
    },
    async changeCandidatePassword(input) {
      return db.transaction(async (tx) => {
        const [updated] = await tx.update(candidates)
          .set({ passwordHash: input.newPasswordHash, updatedAt: input.changedAt })
          .where(and(
            eq(candidates.id, input.candidateId),
            eq(candidates.isActive, true),
            eq(candidates.passwordHash, input.expectedPasswordHash),
          ))
          .returning({ id: candidates.id });
        if (!updated) return false;

        await tx.update(candidateSessions)
          .set({ revokedAt: input.changedAt })
          .where(and(
            eq(candidateSessions.candidateId, input.candidateId),
            ne(candidateSessions.id, input.currentSessionId),
            isNull(candidateSessions.revokedAt),
          ));
        return true;
      });
    },
    async createSession(candidateId, tokenHash, expiresAt) {
      const [session] = await db.insert(candidateSessions).values({ candidateId, tokenHash, expiresAt }).returning({ id: candidateSessions.id });
      return session.id;
    },
    async resolveSession(tokenHash, now) {
      const [session] = await db.select({ sessionId: candidateSessions.id, candidateId: candidates.id })
        .from(candidateSessions).innerJoin(candidates, eq(candidateSessions.candidateId, candidates.id))
        .where(and(eq(candidateSessions.tokenHash, tokenHash), isNull(candidateSessions.revokedAt), gt(candidateSessions.expiresAt, now), eq(candidates.isActive, true))).limit(1);
      return session;
    },
    async revokeSession(sessionId, now) {
      await db.update(candidateSessions).set({ revokedAt: now })
        .where(and(eq(candidateSessions.id, sessionId), isNull(candidateSessions.revokedAt)));
    },
    async getCandidate(candidateId) {
      const [candidate] = await db.select({ id: candidates.id, name: candidates.name, email: candidates.email })
        .from(candidates).where(eq(candidates.id, candidateId)).limit(1);
      return candidate;
    },
  };
}
