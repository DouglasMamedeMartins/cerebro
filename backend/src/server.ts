import Fastify from "fastify";
import cors from "@fastify/cors";

const app = Fastify({
  logger: true,
});

await app.register(cors, {
  origin: true,
});

app.get("/health", async () => {
  return {
    status: "ok",
    service: "PMDF CÉREBRO API",
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
