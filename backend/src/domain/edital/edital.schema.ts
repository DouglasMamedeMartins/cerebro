import { z } from "zod";

export const createEditalSchema = z.object({
  title: z.string().min(3, "Título deve ter pelo menos 3 caracteres").max(255),

  version: z
    .number()
    .int("Versão deve ser um número inteiro")
    .positive("Versão deve ser maior que zero"),

  examDate: z.iso.datetime().optional(),

  publishedAt: z.iso.datetime().optional(),

  sourceUrl: z.url().optional(),

  isOfficial: z.boolean().default(false),
});

export type CreateEditalInput = z.infer<typeof createEditalSchema>;
