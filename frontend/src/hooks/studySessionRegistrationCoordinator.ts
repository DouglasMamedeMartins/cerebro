import type { CreateStudySessionPayload, CreatedStudySession } from '../services/api'

export type SessionRegistrationStatus = 'sending' | 'retryable' | 'conflict' | 'failed' | 'success'

export interface SessionRegistrationOperation {
  idempotencyKey: string
  payload: Readonly<CreateStudySessionPayload>
  status: SessionRegistrationStatus
  error: unknown | null
  result: CreatedStudySession | null
}

export type SessionRequest = (payload: CreateStudySessionPayload, idempotencyKey: string) => Promise<CreatedStudySession>

function classify(error: unknown): 'retryable' | 'conflict' | 'failed' {
  const failure = typeof error === 'object' && error !== null
    ? error as { kind?: unknown; status?: unknown }
    : {}
  if (failure.status === 409) return 'conflict'
  if (
    failure.kind === 'network' || failure.kind === 'response' || failure.status === 408 ||
    failure.status === 429 || (typeof failure.status === 'number' && failure.status >= 500)
  ) return 'retryable'
  return 'failed'
}

export class StudySessionRegistrationCoordinator {
  private operations = new Map<string, SessionRegistrationOperation>()
  private listeners = new Set<() => void>()
  private readonly request: SessionRequest
  private readonly onSuccess: () => void
  private readonly createUuid: () => string

  constructor(
    request: SessionRequest,
    onSuccess: () => void,
    createUuid: () => string = () => crypto.randomUUID(),
  ) {
    this.request = request
    this.onSuccess = onSuccess
    this.createUuid = createUuid
  }

  getSnapshot = (): ReadonlyMap<string, SessionRegistrationOperation> => this.operations

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private publish(itemId: string, operation: SessionRegistrationOperation): void {
    const next = new Map(this.operations)
    next.set(itemId, operation)
    this.operations = next
    this.listeners.forEach((listener) => listener())
  }

  start(itemId: string, payload: CreateStudySessionPayload): boolean {
    if (!Number.isInteger(payload.durationMinutes) || payload.durationMinutes <= 0) {
      throw new RangeError('A duração deve ser um número inteiro positivo.')
    }
    const current = this.operations.get(itemId)
    if (current && current.status !== 'success') return false

    const operation: SessionRegistrationOperation = {
      idempotencyKey: this.createUuid(),
      payload: Object.freeze({ ...payload }),
      status: 'sending',
      error: null,
      result: null,
    }
    this.publish(itemId, operation)
    void this.send(itemId, operation)
    return true
  }

  retry(itemId: string): boolean {
    const current = this.operations.get(itemId)
    if (!current || current.status !== 'retryable') return false
    const operation = { ...current, status: 'sending' as const, error: null }
    this.publish(itemId, operation)
    void this.send(itemId, operation)
    return true
  }

  private async send(itemId: string, operation: SessionRegistrationOperation): Promise<void> {
    try {
      const result = await this.request({ ...operation.payload }, operation.idempotencyKey)
      if (this.operations.get(itemId) !== operation) return
      this.publish(itemId, { ...operation, status: 'success', result, error: null })
      this.onSuccess()
    } catch (error: unknown) {
      if (this.operations.get(itemId) !== operation) return
      this.publish(itemId, { ...operation, status: classify(error), error })
    }
  }

  close(itemId: string): boolean {
    const current = this.operations.get(itemId)
    if (!current || current.status === 'sending' || current.status === 'retryable') return false
    const next = new Map(this.operations)
    next.delete(itemId)
    this.operations = next
    this.listeners.forEach((listener) => listener())
    return true
  }
}
