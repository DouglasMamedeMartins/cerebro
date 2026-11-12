import { z } from "zod";

export const createStudySessionSchema = z.object({
  candidateId: z.uuid(),
  topicId: z.uuid(),
  studyPlanItemId: z.uuid().optional(),
  durationMinutes: z.number().int().positive(),
  studiedAt: z.iso.datetime().optional(),
});

export type CreateStudySessionInput = z.infer<typeof createStudySessionSchema>;
