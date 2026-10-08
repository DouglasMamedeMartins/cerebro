import { z } from "zod";

export const createSubjectSchema = z.object({
  editalVersionId: z.uuid("ID do edital inválido"),

  name: z
    .string()
    .min(2, "Nome da disciplina deve ter pelo menos 2 caracteres")
    .max(150),

  description: z.string().max(1000).optional(),

  weight: z
    .number()
    .int("Peso deve ser um número inteiro")
    .positive("Peso deve ser maior que zero")
    .optional(),

  position: z
    .number()
    .int("Posição deve ser um número inteiro")
    .positive("Posição deve ser maior que zero")
    .optional(),
});

export type CreateSubjectInput = z.infer<typeof createSubjectSchema>;
