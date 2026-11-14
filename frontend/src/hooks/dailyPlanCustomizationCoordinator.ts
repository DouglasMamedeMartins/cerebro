import { ApiError, type ManualPlanActivityType } from '../services/api.ts'

export type DailyPlanCustomizationRequest =
  | { operation: 'reorder'; itemIds: readonly string[] }
  | { operation: 'duration'; itemId: string; plannedDurationMinutes: number }
  | { operation: 'add'; topicId: string; activityType: ManualPlanActivityType; plannedDurationMinutes: number; presentationOrder?: number }
  | { operation: 'unschedule'; itemId: string }

export interface DailyPlanCustomizationOperation {
  key: string
  request: DailyPlanCustomizationRequest
  status: 'sending' | 'retryable' | 'conflict' | 'failed' | 'success'
  error: unknown | null
}

function classify(error: unknown): DailyPlanCustomizationOperation['status'] {
  if (error instanceof ApiError && error.status === 409) return 'conflict'
  if (error instanceof ApiError && (
    error.kind === 'network' || error.kind === 'response' || error.status === 408 || error.status === 429 ||
    (error.status !== undefined && error.status >= 500)
  )) return 'retryable'
  return 'failed'
}

export class DailyPlanCustomizationCoordinator {
  private operation: DailyPlanCustomizationOperation | null = null
  private inFlight = false
  private listeners = new Set<() => void>()

  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => this.listeners.delete(listener) }
  snapshot = (): DailyPlanCustomizationOperation | null => this.operation
  private publish() { this.listeners.forEach((listener) => listener()) }

  async start(
    request: DailyPlanCustomizationRequest,
    createUuid: () => string,
    execute: (request: DailyPlanCustomizationRequest, key: string) => Promise<void>,
  ): Promise<boolean> {
    if (this.inFlight || (this.operation && this.operation.status !== 'success')) return false
    const immutableRequest = request.operation === 'reorder'
      ? Object.freeze({ ...request, itemIds: Object.freeze([...request.itemIds]) })
      : Object.freeze({ ...request })
    const operation: DailyPlanCustomizationOperation = {
      key: createUuid(), request: immutableRequest, status: 'sending', error: null,
    }
    this.operation = operation
    this.publish()
    await this.run(operation, execute)
    return true
  }

  async retry(execute: (request: DailyPlanCustomizationRequest, key: string) => Promise<void>): Promise<boolean> {
    const operation = this.operation
    if (!operation || operation.status !== 'retryable' || this.inFlight) return false
    const retryOperation = { ...operation, status: 'sending' as const, error: null }
    this.operation = retryOperation
    this.publish()
    await this.run(retryOperation, execute)
    return true
  }

  private async run(
    operation: DailyPlanCustomizationOperation,
    execute: (request: DailyPlanCustomizationRequest, key: string) => Promise<void>,
  ) {
    this.inFlight = true
    try {
      await execute(operation.request, operation.key)
      if (this.operation?.key === operation.key) this.operation = { ...operation, status: 'success', error: null }
    } catch (error) {
      if (this.operation?.key === operation.key) {
        this.operation = { ...operation, error, status: classify(error) }
      }
    } finally {
      this.inFlight = false
      this.publish()
    }
  }

  close(): boolean {
    if (this.inFlight || !this.operation || this.operation.status === 'sending') return false
    this.operation = null
    this.publish()
    return true
  }
}
