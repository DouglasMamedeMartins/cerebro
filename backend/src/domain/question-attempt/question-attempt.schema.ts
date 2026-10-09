import { z } from "zod";

export const createQuestionAttemptSchema = z.object({
  candidateId: z.uuid("ID do candidato inválido"),

  questionId: z.uuid("ID da questão inválido"),

  selectedOption: z.enum(
    ["A", "B", "C", "D", "E"],
    "Alternativa selecionada inválida",
  ),

  responseTimeSeconds: z
    .number()
    .int("Tempo de resposta deve ser um número inteiro")
    .nonnegative("Tempo de resposta não pode ser negativo")
    .optional(),

  confidence: z
    .number()
    .int("Confiança deve ser um número inteiro")
    .min(0, "Confiança mínima é 0")
    .max(100, "Confiança máxima é 100")
    .optional(),

  answeredAt: z.iso.datetime().optional(),
});

export type CreateQuestionAttemptInput = z.infer<
  typeof createQuestionAttemptSchema
>;
