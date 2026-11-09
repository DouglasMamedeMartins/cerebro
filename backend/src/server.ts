import Fastify from "fastify";
import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import { eq, sql } from "drizzle-orm";
import { db } from "./db/index.js";
import { candidates } from "./db/schema.js";
import { createQuestionAttempt } from "./services/question-attempt.service.js";
import {
  createCandidate,
  deactivateCandidate,
  getCandidateById,
  getCandidates,
  getPublicCandidates,
  updateCandidate,
} from "./services/candidate.service.js";
import { createEdital } from "./services/edital.service.js";
import { createSubject } from "./services/subject.service.js";
import { getTopicCoverage } from "./services/coverage.service.js";
import { createTopicReview } from "./services/review.service.js";
import { getTopicPerformance } from "./services/performance.service.js";
import { getTopicState } from "./services/topic-state.service.js";
import {
  buildPriorityFromPerformance,
  calculateTopicPriority,
  calculateTopicPriorityForCandidate,
  getTopicIncidencePriority,
  getTopicWeightPriority,
} from "./services/priority.service.js";
import {
  getCandidateBestAction,
  getCandidateBestActionTopics,
} from "./services/best-action-candidate.service.js";
import {
  createStudySession,
  getStudyCandidate,
} from "./services/study-session.service.js";
import { candidateRoutes } from "./routes/candidate.routes.js";
import { editalRoutes } from "./routes/edital.routes.js";
import { subjectRoutes } from "./routes/subject.routes.js";
import { topicRoutes } from "./routes/topic.routes.js";
import { questionRoutes } from "./routes/question.routes.js";
import { questionAttemptRoutes } from "./routes/question-attempt.routes.js";
import { performanceRoutes } from "./routes/performance.routes.js";
import { priorityRoutes } from "./routes/priority.routes.js";
import { reviewRoutes } from "./routes/review.routes.js";
import { reviewCreationRoutes } from "./routes/review-create.routes.js";
import { studyRoutes } from "./routes/study.routes.js";
import { bestActionRoutes } from "./routes/best-action.routes.js";
import { candidateTopicRoutes } from "./routes/candidate-topic.routes.js";
import { candidateBestActionRoutes } from "./routes/candidate-best-action.routes.js";
import { authRoutes } from "./routes/auth.routes.js";
import { createRequireCandidate } from "./middleware/candidate-auth.js";
import { installApiAuthGuards } from "./middleware/api-auth-guards.js";
import { createDrizzleCandidateAuthStore } from "./services/candidate-auth.store.js";

const app = Fastify({
  logger: true,
});

async function getPerformanceCandidateStatus(candidateId: string) {
  const [candidate] = await db
    .select({
      id: candidates.id,
      isActive: candidates.isActive,
    })
    .from(candidates)
    .where(eq(candidates.id, candidateId))
    .limit(1);

  return candidate;
}

const allowedOrigins = (process.env.CORS_ORIGINS ?? "http://localhost:5173,http://127.0.0.1:5173")
  .split(",").map((origin) => origin.trim()).filter(Boolean);
await app.register(cookie);
await app.register(cors, { origin: allowedOrigins, credentials: true });
const authStore = createDrizzleCandidateAuthStore(db);
const requireCandidate = createRequireCandidate(authStore);
installApiAuthGuards(app, requireCandidate, allowedOrigins);

await app.register(authRoutes, { store: authStore, requireCandidate });

await app.register(candidateRoutes, {
  createCandidate,
  deactivateCandidate,
  getCandidateById,
  getCandidates,
  getPublicCandidates,
  updateCandidate,
});
await app.register(editalRoutes, { createEdital });
await app.register(subjectRoutes, { createSubject });
await app.register(topicRoutes, {
  getCandidateStatus: getPerformanceCandidateStatus,
  getTopicState,
});
await app.register(questionRoutes);
await app.register(questionAttemptRoutes, { createQuestionAttempt });
await app.register(performanceRoutes, {
  getCandidateStatus: getPerformanceCandidateStatus,
  getTopicPerformance,
});
await app.register(priorityRoutes, {
  getCandidateStatus: getPerformanceCandidateStatus,
  calculateTopicPriority,
  buildPriorityFromPerformance,
  calculateTopicPriorityForCandidate,
  getTopicWeightPriority,
  getTopicIncidencePriority,
});
await app.register(reviewRoutes);
await app.register(reviewCreationRoutes, { createTopicReview });
await app.register(studyRoutes, {
  createStudySession,
  getStudyCandidate,
  getTopicCoverage,
});
await app.register(bestActionRoutes);
await app.register(candidateTopicRoutes);
await app.register(candidateBestActionRoutes, {
  getCandidateBestAction,
  getCandidateBestActionTopics,
});

app.get("/health", async () => {
  const result = await db.execute(sql`SELECT NOW()`);

  return {
    status: "ok",
    service: "PMDF CÉREBRO API",
    database: "connected",
    time: result[0],
  };
});

const PORT = Number(process.env.PORT) || 3333;

try {
  await app.listen({
    port: PORT,
    host: "0.0.0.0",
  });

  console.log(`🚀 API rodando em http://localhost:${PORT}`);
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
