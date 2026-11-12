import { ApiError, type DailyPlanDecision } from '../services/api.ts'

export interface PlanDecisionOperation {
  status: 'sending' | 'retryable' | 'conflict' | 'failed' | 'success'
  decision: DailyPlanDecision
  replacementTopicId?: string
  error?: unknown
}

interface PendingOperation extends PlanDecisionOperation { key: string }

export class DailyPlanDecisionCoordinator {
  private operations = new Map<string, PendingOperation>()
  private listeners = new Set<() => void>()

  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => this.listeners.delete(listener) }
  snapshot = (): ReadonlyMap<string, PlanDecisionOperation> => this.operations

  private publish() { for (const listener of this.listeners) listener() }

  async start(itemId: string, decision: DailyPlanDecision, replacementTopicId: string | undefined, keyFactory: () => string,
    execute: (decision: DailyPlanDecision, key: string, replacementTopicId?: string) => Promise<void>): Promise<boolean> {
    const current = this.operations.get(itemId)
    if (current && current.status !== 'success') return false
    const op: PendingOperation = { status: 'sending', decision, replacementTopicId, key: keyFactory() }
    this.operations.set(itemId, op)
    this.publish()
    await this.run(itemId, op, execute)
    return true
  }

  async retry(itemId: string, execute: (decision: DailyPlanDecision, key: string, replacementTopicId?: string) => Promise<void>): Promise<boolean> {
    const op = this.operations.get(itemId)
    if (!op || op.status !== 'retryable') return false
    op.status = 'sending'; op.error = undefined; this.publish()
    await this.run(itemId, op, execute)
    return true
  }

  private async run(_itemId: string, op: PendingOperation, execute: (decision: DailyPlanDecision, key: string, replacementTopicId?: string) => Promise<void>) {
    try { await execute(op.decision, op.key, op.replacementTopicId); op.status = 'success' }
    catch (error) {
      op.error = error
      op.status = error instanceof ApiError && error.status === 409 ? 'conflict' :
        error instanceof ApiError && (error.kind === 'network' || error.kind === 'response' || error.status === 408 || error.status === 429 || (error.status !== undefined && error.status >= 500)) ? 'retryable' : 'failed'
    }
    this.publish()
  }

  close(itemId: string): boolean {
    const op = this.operations.get(itemId)
    if (!op || op.status === 'sending') return false
    this.operations.delete(itemId); this.publish(); return true
  }
}
