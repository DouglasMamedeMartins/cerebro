export interface PendingPlanGeneration {
  idempotencyKey: string
  availableMinutes: number
}

export type PlanGenerationResult<T> =
  | { kind: 'success'; value: T }
  | { kind: 'retryable'; error: unknown }
  | { kind: 'no-action'; error: unknown }
  | { kind: 'conflict'; error: unknown }
  | { kind: 'definitive'; error: unknown }

function classify(error: unknown): 'retryable' | 'no-action' | 'conflict' | 'definitive' {
  const failure = typeof error === 'object' && error !== null
    ? error as { kind?: unknown; status?: unknown; code?: unknown }
    : {}

  if (failure.code === 'NO_ACTION_AVAILABLE') return 'no-action'
  if (failure.status === 409 || failure.code === 'IDEMPOTENCY_CONFLICT') return 'conflict'
  if (
    failure.kind === 'network' || failure.kind === 'response' ||
    failure.status === 408 || failure.status === 429 ||
    (typeof failure.status === 'number' && failure.status >= 500)
  ) return 'retryable'
  return 'definitive'
}

export class PlanGenerationCoordinator {
  private operation: PendingPlanGeneration | null = null
  private inFlight = false
  private lastResult: PlanGenerationResult<unknown>['kind'] | null = null

  get pending(): PendingPlanGeneration | null {
    return this.operation
  }

  get running(): boolean {
    return this.inFlight
  }

  get outcome(): PlanGenerationResult<unknown>['kind'] | null {
    return this.lastResult
  }

  beginOrRetry(availableMinutes: number, createUuid: () => string): PendingPlanGeneration | null {
    if (this.inFlight) return null
    if (this.operation) return this.operation
    this.operation = { idempotencyKey: createUuid(), availableMinutes }
    this.lastResult = null
    return this.operation
  }

  async execute<T>(
    request: (availableMinutes: number, idempotencyKey: string) => Promise<T>,
  ): Promise<PlanGenerationResult<T> | null> {
    if (this.inFlight || !this.operation) return null
    const operation = this.operation
    this.inFlight = true
    try {
      const value = await request(operation.availableMinutes, operation.idempotencyKey)
      if (this.operation === operation) this.operation = null
      this.lastResult = 'success'
      return { kind: 'success', value }
    } catch (error: unknown) {
      const kind = classify(error)
      if (kind === 'no-action' && this.operation === operation) this.operation = null
      this.lastResult = kind
      return { kind, error }
    } finally {
      this.inFlight = false
    }
  }

  close(): boolean {
    if (this.inFlight) return false
    this.operation = null
    this.lastResult = null
    return true
  }

  reset(): boolean {
    return this.close()
  }
}
