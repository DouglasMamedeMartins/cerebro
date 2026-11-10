import fastifyStatic from "@fastify/static";
import type { FastifyInstance } from "fastify";

export async function registerFrontendStatic(app: FastifyInstance, root: string) {
  await app.register(fastifyStatic, {
    root,
    prefix: "/",
    wildcard: false,
  });

  app.setNotFoundHandler((request, reply) => {
    const pathname = request.url.split("?", 1)[0];
    const isApiPath = pathname === "/api" || pathname.startsWith("/api/");

    if (isApiPath) {
      return reply.code(404).send({ error: "NOT_FOUND" });
    }

    const acceptsHtml = request.headers.accept?.includes("text/html") ?? false;
    if (["GET", "HEAD"].includes(request.method) && acceptsHtml) {
      return reply.type("text/html").sendFile("index.html");
    }

    return reply.code(404).send({ error: "NOT_FOUND" });
  });
}
