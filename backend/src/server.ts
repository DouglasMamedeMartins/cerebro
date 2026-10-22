import Fastify from "fastify";
import cors from "@fastify/cors";
import { eq, sql } from "drizzle-orm";
import { db } from "./db/index.js";
import { candidates } from "./db/schema.js";
import { createQuestionAttempt } from "./services/question-attempt.service.js";
import { getTopicCoverage } from "./services/coverage.service.js";
import { createTopicReview } from "./services/review.service.js";
import { getTopicPerformance } from "./services/performance.service.js";
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

await app.register(cors, {
  origin: true,
});

await app.register(candidateRoutes);
await app.register(editalRoutes);
await app.register(subjectRoutes);
await app.register(topicRoutes);
await app.register(questionRoutes);
await app.register(questionAttemptRoutes, { createQuestionAttempt });
await app.register(performanceRoutes, {
  getCandidateStatus: getPerformanceCandidateStatus,
  getTopicPerformance,
});
await app.register(priorityRoutes);
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
