import Fastify from "fastify";
import cors from "@fastify/cors";
import { sql } from "drizzle-orm";
import { db } from "./db/index.js";
import { candidateRoutes } from "./routes/candidate.routes.js";
import { editalRoutes } from "./routes/edital.routes.js";
import { subjectRoutes } from "./routes/subject.routes.js";
import { topicRoutes } from "./routes/topic.routes.js";
import { questionRoutes } from "./routes/question.routes.js";
import { questionAttemptRoutes } from "./routes/question-attempt.routes.js";
import { performanceRoutes } from "./routes/performance.routes.js";
import { priorityRoutes } from "./routes/priority.routes.js";
import { reviewRoutes } from "./routes/review.routes.js";
import { studyRoutes } from "./routes/study.routes.js";
import { bestActionRoutes } from "./routes/best-action.routes.js";
import { candidateTopicRoutes } from "./routes/candidate-topic.routes.js";
import { candidateBestActionRoutes } from "./routes/candidate-best-action.routes.js";

const app = Fastify({
  logger: true,
});

await app.register(cors, {
  origin: true,
});

await app.register(candidateRoutes);
await app.register(editalRoutes);
await app.register(subjectRoutes);
await app.register(topicRoutes);
await app.register(questionRoutes);
await app.register(questionAttemptRoutes);
await app.register(performanceRoutes);
await app.register(priorityRoutes);
await app.register(reviewRoutes);
await app.register(studyRoutes);
await app.register(bestActionRoutes);
await app.register(candidateTopicRoutes);
await app.register(candidateBestActionRoutes);

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
