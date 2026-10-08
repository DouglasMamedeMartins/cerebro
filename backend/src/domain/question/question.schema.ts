import { z } from "zod";

export const createQuestionSchema = z.object({
  topicId: z.uuid("ID do tópico inválido"),

  statement: z.string().min(10, "Enunciado deve ter pelo menos 10 caracteres"),

  explanation: z.string().optional(),

  difficulty: z
    .number()
    .int("Dificuldade deve ser um número inteiro")
    .min(1, "Dificuldade mínima é 1")
    .max(5, "Dificuldade máxima é 5")
    .optional(),

  source: z.string().max(255).optional(),

  year: z
    .number()
    .int("Ano deve ser um número inteiro")
    .min(1900, "Ano inválido")
    .max(2100, "Ano inválido")
    .optional(),

  isActive: z.boolean().default(true),
});

export type CreateQuestionInput = z.infer<typeof createQuestionSchema>;
