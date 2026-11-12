export interface Candidate {
  id: string
  name: string
  email: string
}

interface LoginCredentials {
  email: string
  password: string
}

export type CandidateBestAction = {
  topicId: string
  topicName: string
  subjectName: string
  type: 'study' | 'review' | 'questions' | 'mixed' | 'maintenance'
  durationMinutes: number
  priorityScore: number
  priorityLevel: 'maximum' | 'high' | 'medium' | 'low'
  mastery: number
  masteryStatus: 'learning' | 'weak' | 'developing' | 'consolidated'
  reliability: 'very_low' | 'low' | 'moderate' | 'high' | 'very_high'
  trend: 'strong_improvement' | 'improvement' | 'stable' | 'decline' | 'strong_decline'
  reason: Array<'weak_mastery' | 'declining_trend' | 'review_due' | 'low_reliability' | 'low_coverage' | 'high_priority' | 'insufficient_data'>
  explanation: string
  expectedImpact: string
  evaluationStatus: 'not_evaluated' | 'evaluated'
}

export type CandidateTopicAction = {
  candidateId: string
  topicId: string
  type: CandidateBestAction['type']
  durationMinutes: number
  priorityScore: number
  priorityLevel: CandidateBestAction['priorityLevel']
  mastery: number
  masteryStatus: CandidateBestAction['masteryStatus']
  reliability: CandidateBestAction['reliability']
  trend: CandidateBestAction['trend']
  reason: CandidateBestAction['reason']
  explanation: string
  expectedImpact: string
}

export interface CandidateTopicSummary {
  topicId: string
  topicName: string
  subjectId: string
  subjectName: string
}

export interface TopicPerformanceSummary {
  topicId: string
  attempts: number
  correctAnswers: number
}

export interface TopicCoverageSummary {
  totalMinutes: number
  lastStudiedAt: string | null
  daysSinceStudy: number | null
  factor: number
}

export interface StudyStreakSummary {
  currentStreak: number
  longestStreak: number
  totalStudyDays: number
  lastStudyDate: string | null
  asOfDate: string
}

export interface StudySessionHistoryItem {
  id: string
  studiedAt: string
  localStudyDate: string
  durationMinutes: number
  topicId: string
  topicName: string | null
  subjectName: string | null
}

export interface StudySessionHistoryPage {
  sessions: StudySessionHistoryItem[]
  pagination: {
    page: number
    limit: number
    total: number
    totalPages: number
  }
}

export interface CandidatePriorityTopic {
  topicId: string
  topicName: string
  subjectName: string
  mastery: number
  masteryStatus: 'learning' | 'weak' | 'developing' | 'consolidated'
  reliability: 'very_low' | 'low' | 'moderate' | 'high' | 'very_high'
  trend: 'strong_improvement' | 'improvement' | 'stable' | 'decline' | 'strong_decline'
  priorityScore: number
  priorityLevel: 'maximum' | 'high' | 'medium' | 'low'
  coverageFactor: number
  reviewFactor: number
  attempts: number
  evaluationStatus: 'not_evaluated' | 'evaluated'
}

export class ApiError extends Error {
  readonly status?: number
  readonly kind: 'http' | 'network' | 'configuration' | 'response'
  readonly code?: string

  constructor(
    message: string,
    status?: number,
    kind: 'http' | 'network' | 'configuration' | 'response' = 'http',
    code?: string,
  ) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.kind = kind
    this.code = code
  }
}

const baseUrl = import.meta.env.VITE_API_BASE_URL?.trim().replace(/\/+$/, '')

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  if (!baseUrl) {
    throw new ApiError('VITE_API_BASE_URL não está configurada.', undefined, 'configuration')
  }

  let response: Response
  try {
    response = await fetch(`${baseUrl}${path}`, {
      ...init,
      credentials: 'include',
      headers: {
        ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
        ...init?.headers,
      },
    })
  } catch {
    throw new ApiError('Não foi possível conectar à API.', undefined, 'network')
  }

  if (!response.ok) {
    let code: string | undefined
    try {
      const errorBody: unknown = await response.clone().json()
      if (typeof errorBody === 'object' && errorBody !== null && 'error' in errorBody && typeof errorBody.error === 'string') {
        code = errorBody.error
      }
    } catch {
      // Algumas respostas HTTP não incluem corpo JSON.
    }
    throw new ApiError('A API recusou a solicitação.', response.status, 'http', code)
  }

  if (response.status === 204) return undefined as T

  try {
    return await response.json() as T
  } catch {
    throw new ApiError('A API retornou uma resposta inválida.', response.status, 'response')
  }
}

function parseCandidate(value: unknown): Candidate {
  if (
    typeof value !== 'object' || value === null ||
    !('id' in value) || typeof value.id !== 'string' ||
    !('name' in value) || typeof value.name !== 'string' ||
    !('email' in value) || typeof value.email !== 'string'
  ) {
    throw new ApiError('A API retornou os dados do candidato em formato inválido.', undefined, 'response')
  }

  return { id: value.id, name: value.name, email: value.email }
}

const actionTypes = ['study', 'review', 'questions', 'mixed', 'maintenance'] as const
const priorityLevels = ['maximum', 'high', 'medium', 'low'] as const
const masteryStatuses = ['learning', 'weak', 'developing', 'consolidated'] as const
const reliabilityLevels = ['very_low', 'low', 'moderate', 'high', 'very_high'] as const
const performanceTrends = ['strong_improvement', 'improvement', 'stable', 'decline', 'strong_decline'] as const
const actionReasons = ['weak_mastery', 'declining_trend', 'review_due', 'low_reliability', 'low_coverage', 'high_priority', 'insufficient_data'] as const
const evaluationStatuses = ['not_evaluated', 'evaluated'] as const

function isOneOf<const T extends readonly string[]>(value: unknown, values: T): value is T[number] {
  return typeof value === 'string' && (values as readonly string[]).includes(value)
}

function parseCandidateBestAction(value: unknown): CandidateBestAction {
  if (typeof value !== 'object' || value === null) {
    throw new ApiError('A API retornou uma recomendação em formato inválido.', undefined, 'response')
  }

  const action = value as Record<string, unknown>
  if (
    typeof action.topicId !== 'string' ||
    typeof action.topicName !== 'string' ||
    typeof action.subjectName !== 'string' ||
    !isOneOf(action.type, actionTypes) ||
    typeof action.durationMinutes !== 'number' ||
    typeof action.priorityScore !== 'number' ||
    !isOneOf(action.priorityLevel, priorityLevels) ||
    typeof action.mastery !== 'number' ||
    !isOneOf(action.masteryStatus, masteryStatuses) ||
    !isOneOf(action.reliability, reliabilityLevels) ||
    !isOneOf(action.trend, performanceTrends) ||
    !Array.isArray(action.reason) ||
    !action.reason.every((reason) => isOneOf(reason, actionReasons)) ||
    typeof action.explanation !== 'string' ||
    typeof action.expectedImpact !== 'string' ||
    !isOneOf(action.evaluationStatus, evaluationStatuses)
  ) {
    throw new ApiError('A API retornou uma recomendação em formato inválido.', undefined, 'response')
  }

  return action as CandidateBestAction
}

function parseCandidateTopicAction(value: unknown): CandidateTopicAction {
  if (typeof value !== 'object' || value === null) {
    throw new ApiError('A API retornou uma recomendaÃ§Ã£o em formato invÃ¡lido.', undefined, 'response')
  }

  const action = value as Record<string, unknown>
  if (
    typeof action.candidateId !== 'string' ||
    typeof action.topicId !== 'string' ||
    !isOneOf(action.type, actionTypes) ||
    typeof action.durationMinutes !== 'number' || !Number.isFinite(action.durationMinutes) || action.durationMinutes < 0 ||
    typeof action.priorityScore !== 'number' || !Number.isFinite(action.priorityScore) ||
    !isOneOf(action.priorityLevel, priorityLevels) ||
    typeof action.mastery !== 'number' ||
    !isOneOf(action.masteryStatus, masteryStatuses) ||
    !isOneOf(action.reliability, reliabilityLevels) ||
    !isOneOf(action.trend, performanceTrends) ||
    !Array.isArray(action.reason) || !action.reason.every((reason) => isOneOf(reason, actionReasons)) ||
    typeof action.explanation !== 'string' ||
    typeof action.expectedImpact !== 'string'
  ) {
    throw new ApiError('A API retornou uma recomendaÃ§Ã£o em formato invÃ¡lido.', undefined, 'response')
  }

  return action as CandidateTopicAction
}

function parseCandidateTopics(value: unknown): CandidateTopicSummary[] {
  if (
    typeof value !== 'object' || value === null ||
    !('topics' in value) || !Array.isArray(value.topics) ||
    !value.topics.every((topic) => typeof topic === 'object' && topic !== null &&
      'topicId' in topic && typeof topic.topicId === 'string' &&
      'topicName' in topic && typeof topic.topicName === 'string' &&
      'subjectId' in topic && typeof topic.subjectId === 'string' &&
      'subjectName' in topic && typeof topic.subjectName === 'string')
  ) {
    throw new ApiError('A API retornou os tópicos em formato inválido.', undefined, 'response')
  }

  return value.topics.map((topic) => ({
    topicId: topic.topicId,
    topicName: topic.topicName,
    subjectId: topic.subjectId,
    subjectName: topic.subjectName,
  }))
}

function parseTopicPerformanceSummary(value: unknown): TopicPerformanceSummary {
  if (
    typeof value !== 'object' || value === null ||
    !('topicId' in value) || typeof value.topicId !== 'string' ||
    !('attempts' in value) || typeof value.attempts !== 'number' || !Number.isInteger(value.attempts) || value.attempts < 0 ||
    !('correctAnswers' in value) || typeof value.correctAnswers !== 'number' || !Number.isInteger(value.correctAnswers) || value.correctAnswers < 0
  ) {
    throw new ApiError('A API retornou o desempenho em formato inválido.', undefined, 'response')
  }

  return { topicId: value.topicId, attempts: value.attempts, correctAnswers: value.correctAnswers }
}

function parseTopicCoverageSummary(value: unknown): TopicCoverageSummary {
  if (
    typeof value !== 'object' || value === null ||
    !('totalMinutes' in value) || typeof value.totalMinutes !== 'number' || !Number.isFinite(value.totalMinutes) || value.totalMinutes < 0 ||
    !('lastStudiedAt' in value) || (value.lastStudiedAt !== null && typeof value.lastStudiedAt !== 'string') ||
    !('daysSinceStudy' in value) || (value.daysSinceStudy !== null && (typeof value.daysSinceStudy !== 'number' || !Number.isFinite(value.daysSinceStudy))) ||
    !('factor' in value) || typeof value.factor !== 'number' || !Number.isFinite(value.factor)
  ) {
    throw new ApiError('A API retornou a cobertura em formato invÃ¡lido.', undefined, 'response')
  }

  return {
    totalMinutes: value.totalMinutes,
    lastStudiedAt: value.lastStudiedAt,
    daysSinceStudy: value.daysSinceStudy,
    factor: value.factor,
  }
}

function parseStudyStreak(value: unknown): StudyStreakSummary {
  if (typeof value !== 'object' || value === null) {
    throw new ApiError('A API retornou a sequência em formato inválido.', undefined, 'response')
  }

  const streak = value as Record<string, unknown>
  if (
    !Number.isInteger(streak.currentStreak) || (streak.currentStreak as number) < 0 ||
    !Number.isInteger(streak.longestStreak) || (streak.longestStreak as number) < 0 ||
    !Number.isInteger(streak.totalStudyDays) || (streak.totalStudyDays as number) < 0 ||
    !(streak.lastStudyDate === null || typeof streak.lastStudyDate === 'string') ||
    typeof streak.asOfDate !== 'string'
  ) {
    throw new ApiError('A API retornou a sequência em formato inválido.', undefined, 'response')
  }

  return {
    currentStreak: streak.currentStreak as number,
    longestStreak: streak.longestStreak as number,
    totalStudyDays: streak.totalStudyDays as number,
    lastStudyDate: streak.lastStudyDate as string | null,
    asOfDate: streak.asOfDate,
  }
}

function parseStudySessionHistory(value: unknown): StudySessionHistoryPage {
  if (typeof value !== 'object' || value === null) {
    throw new ApiError('A API retornou o histÃ³rico em formato invÃ¡lido.', undefined, 'response')
  }

  const result = value as Record<string, unknown>
  const pagination = result.pagination
  const isValidPagination = typeof pagination === 'object' && pagination !== null &&
    Number.isInteger((pagination as Record<string, unknown>).page) &&
    Number.isInteger((pagination as Record<string, unknown>).limit) &&
    Number.isInteger((pagination as Record<string, unknown>).total) &&
    Number.isInteger((pagination as Record<string, unknown>).totalPages)
  const sessions = result.sessions
  const isValidSession = (session: unknown): session is StudySessionHistoryItem => {
    if (typeof session !== 'object' || session === null) return false
    const item = session as Record<string, unknown>
    return typeof item.id === 'string' &&
      typeof item.studiedAt === 'string' &&
      typeof item.localStudyDate === 'string' &&
      typeof item.durationMinutes === 'number' && Number.isFinite(item.durationMinutes) && item.durationMinutes >= 0 &&
      typeof item.topicId === 'string' &&
      (item.topicName === null || typeof item.topicName === 'string') &&
      (item.subjectName === null || typeof item.subjectName === 'string')
  }

  if (!Array.isArray(sessions) || !sessions.every(isValidSession) || !isValidPagination) {
    throw new ApiError('A API retornou o histÃ³rico em formato invÃ¡lido.', undefined, 'response')
  }

  return { sessions, pagination: pagination as StudySessionHistoryPage['pagination'] }
}

function parseCandidatePriorityTopics(value: unknown): CandidatePriorityTopic[] {
  const topicFieldsAreValid = (topic: unknown): topic is CandidatePriorityTopic => {
    if (typeof topic !== 'object' || topic === null) return false
    const entry = topic as Record<string, unknown>
    return typeof entry.topicId === 'string' &&
      typeof entry.topicName === 'string' &&
      typeof entry.subjectName === 'string' &&
      typeof entry.mastery === 'number' &&
      isOneOf(entry.masteryStatus, masteryStatuses) &&
      isOneOf(entry.reliability, reliabilityLevels) &&
      isOneOf(entry.trend, performanceTrends) &&
      typeof entry.priorityScore === 'number' &&
      isOneOf(entry.priorityLevel, priorityLevels) &&
      typeof entry.coverageFactor === 'number' &&
      typeof entry.reviewFactor === 'number' &&
      typeof entry.attempts === 'number' &&
      Number.isInteger(entry.attempts) && entry.attempts >= 0 &&
      isOneOf(entry.evaluationStatus, evaluationStatuses)
  }

  if (
    typeof value !== 'object' || value === null ||
    !('count' in value) || typeof value.count !== 'number' || !Number.isInteger(value.count) ||
    !('topics' in value) || !Array.isArray(value.topics) ||
    !value.topics.every(topicFieldsAreValid) || value.count !== value.topics.length
  ) {
    throw new ApiError('A API retornou o ranking em formato inválido.', undefined, 'response')
  }

  return value.topics
}

export const authApi = {
  async login(credentials: LoginCredentials): Promise<Candidate> {
    const result = await request<unknown>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(credentials),
    })
    return parseCandidate(result)
  },

  async me(): Promise<Candidate> {
    return parseCandidate(await request<unknown>('/api/auth/me'))
  },

  logout(): Promise<void> {
    return request<void>('/api/auth/logout', { method: 'POST' })
  },
}

export const candidateApi = {
  async getStudySessionHistory(page = 1, limit = 5): Promise<StudySessionHistoryPage> {
    const query = new URLSearchParams({ page: String(page), limit: String(limit) })
    return parseStudySessionHistory(await request<unknown>(`/api/study-sessions/history?${query}`))
  },

  async getStudyStreak(): Promise<StudyStreakSummary> {
    return parseStudyStreak(await request<unknown>('/api/study-sessions/streak'))
  },

  async getBestActionTopics(candidateId: string): Promise<CandidatePriorityTopic[]> {
    const result = await request<unknown>(`/api/candidates/${encodeURIComponent(candidateId)}/best-action/topics`)
    return parseCandidatePriorityTopics(result)
  },

  async getTopics(candidateId: string): Promise<CandidateTopicSummary[]> {
    const result = await request<unknown>(`/api/candidates/${encodeURIComponent(candidateId)}/topics`)
    return parseCandidateTopics(result)
  },

  async getTopicPerformance(topicId: string, candidateId: string): Promise<TopicPerformanceSummary> {
    const query = new URLSearchParams({ candidateId })
    const result = await request<unknown>(`/api/performance/topics/${encodeURIComponent(topicId)}?${query}`)
    return parseTopicPerformanceSummary(result)
  },

  async getTopicCoverage(candidateId: string, topicId: string): Promise<TopicCoverageSummary> {
    const result = await request<unknown>(`/api/study-sessions/${encodeURIComponent(candidateId)}/${encodeURIComponent(topicId)}/coverage`)
    return parseTopicCoverageSummary(result)
  },

  async getBestAction(candidateId: string): Promise<CandidateBestAction> {
    const result = await request<unknown>(`/api/candidates/${encodeURIComponent(candidateId)}/best-action`)
    return parseCandidateBestAction(result)
  },

  async getBestActionForTopic(candidateId: string, topicId: string): Promise<CandidateTopicAction> {
    const result = await request<unknown>(`/api/candidates/${encodeURIComponent(candidateId)}/best-action/${encodeURIComponent(topicId)}`)
    return parseCandidateTopicAction(result)
  },
}
