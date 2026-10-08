import { z } from "zod";

export const createTopicSchema = z.object({
  subjectId: z.uuid("ID da disciplina inválido"),

  parentId: z.uuid("ID do tópico pai inválido").optional(),

  name: z
    .string()
    .min(2, "Nome do tópico deve ter pelo menos 2 caracteres")
    .max(255),

  description: z.string().max(2000).optional(),

  position: z
    .number()
    .int("Posição deve ser um número inteiro")
    .positive("Posição deve ser maior que zero")
    .optional(),
});

export type CreateTopicInput = z.infer<typeof createTopicSchema>;
