import { z } from "zod";
const optionsSchema = z.object({
  A: z.string().min(1, "A alternativa A é obrigatória"),
  B: z.string().min(1, "A alternativa B é obrigatória"),
  C: z.string().min(1, "A alternativa C é obrigatória"),
  D: z.string().min(1, "A alternativa D é obrigatória"),
  E: z.string().min(1, "A alternativa E é obrigatória"),
});
const correctOptionSchema = z.enum(
  ["A", "B", "C", "D", "E"],
  "Alternativa correta inválida",
);
export const createQuestionSchema = z.object({
  topicId: z.uuid("ID do tópico inválido"),
  statement: z.string().min(10, "Enunciado deve ter pelo menos 10 caracteres"),
  options: optionsSchema,
  correctOption: correctOptionSchema,
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
export const updateQuestionSchema = z.object({
  topicId: z.uuid("ID do tópico inválido").optional(),
  statement: z
    .string()
    .min(10, "Enunciado deve ter pelo menos 10 caracteres")
    .optional(),
  options: optionsSchema.optional(),
  correctOption: correctOptionSchema.optional(),
  explanation: z.string().optional(),
  difficulty: z
    .number()
    .int("Dificuldade deve ser um número inteiro")
    .min(1, "Dificuldade mínima é 1")
    .max(5, "Dificuldade máxima é 5")
    .nullable()
    .optional(),
  source: z.string().max(255).optional(),
  year: z
    .number()
    .int("Ano deve ser um número inteiro")
    .min(1900, "Ano inválido")
    .max(2100, "Ano inválido")
    .nullable()
    .optional(),
  isActive: z.boolean().optional(),
});
export type UpdateQuestionInput = z.infer<typeof updateQuestionSchema>;
