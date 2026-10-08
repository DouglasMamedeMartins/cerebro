import { z } from "zod";

export const createCandidateSchema = z.object({
  name: z.string().min(2, "Nome deve ter pelo menos 2 caracteres").max(120),

  email: z.string().email("E-mail inválido").max(255),
});

export type CreateCandidateInput = z.infer<typeof createCandidateSchema>;
