import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { ApiError, studyPlanApi, type DailyPlanDecision, type DailyStudyPlanItemSnapshot, type DailyStudyPlanSnapshot } from '../services/api'
import { PlanGenerationCoordinator } from './dailyStudyPlanGeneration'
import { DailyPlanDecisionCoordinator } from './dailyPlanDecisionCoordinator'

export interface DailyPlanActivity extends DailyStudyPlanItemSnapshot {
  isBestAction: boolean
}

type PlanStatus = 'idle' | 'loading' | 'load-error' | 'no-plan' | 'ready'
type GenerationStatus = 'idle' | 'generating' | 'error' | 'conflict' | 'failed' | 'no-action'
const emptyDecisionOperations = new Map<string, import('./dailyPlanDecisionCoordinator').PlanDecisionOperation>()
const noopSubscribe = () => () => {}

export interface DailyStudyPlanViewModel {
  status: PlanStatus
  retryable: boolean
  plan: DailyStudyPlanSnapshot | null
  activities: DailyPlanActivity[]
  recommendationCount: number
  totalMinutes: number
  bestActionExceedsAvailability: boolean
  availableMinutes: number
  availabilityChanged: boolean
  generationStatus: GenerationStatus
  generationRetryable: boolean
  generationPending: boolean
  pendingAvailableMinutes: number | null
  generationErrorMessage: string
  setAvailableMinutes: (minutes: number) => void
  generate: () => void
  closeGeneration: () => void
  retry: () => void
  decisionOperations: ReadonlyMap<string, import('./dailyPlanDecisionCoordinator').PlanDecisionOperation>
  decide: (itemId: string, decision: DailyPlanDecision, replacementTopicId?: string) => void
  retryDecision: (itemId: string) => void
  closeDecision: (itemId: string) => void
  refresh: () => void
}

function isRetryable(error: unknown): boolean {
  return error instanceof ApiError && (
    error.kind === 'network' ||
    error.kind === 'response' ||
    (error.kind === 'http' && (error.status === 408 || error.status === 429 || (error.status !== undefined && error.status >= 500)))
  )
}

function makeActivities(items: DailyStudyPlanItemSnapshot[]): DailyPlanActivity[] {
  return items.map((item) => ({
    ...item,
    isBestAction: item.recommendationSource === 'best_action',
  }))
}

export function useDailyStudyPlan(candidateId: string | undefined): DailyStudyPlanViewModel {
  const [status, setStatus] = useState<PlanStatus>('idle')
  const [retryable, setRetryable] = useState(false)
  const [plan, setPlan] = useState<DailyStudyPlanSnapshot | null>(null)
  const [availableMinutes, setAvailableMinutesState] = useState(120)
  const [generationStatus, setGenerationStatus] = useState<GenerationStatus>('idle')
  const [generationRetryable, setGenerationRetryable] = useState(false)
  const [generationPending, setGenerationPending] = useState(false)
  const [pendingAvailableMinutes, setPendingAvailableMinutes] = useState<number | null>(null)
  const [generationErrorMessage, setGenerationErrorMessage] = useState('')
  const [reloadKey, setReloadKey] = useState(0)
  const [loadedCandidateId, setLoadedCandidateId] = useState<string | undefined>(undefined)
  const generationCoordinators = useRef(new Map<string, PlanGenerationCoordinator>())
  const decisionCoordinators = useRef(new Map<string, DailyPlanDecisionCoordinator>())
  const currentCandidateId = useRef(candidateId)
  currentCandidateId.current = candidateId

  const coordinatorFor = useCallback((id: string) => {
    let coordinator = generationCoordinators.current.get(id)
    if (!coordinator) {
      coordinator = new PlanGenerationCoordinator()
      generationCoordinators.current.set(id, coordinator)
    }
    return coordinator
  }, [])

  const decisionCoordinatorFor = useCallback((id: string) => {
    let coordinator = decisionCoordinators.current.get(id)
    if (!coordinator) { coordinator = new DailyPlanDecisionCoordinator(); decisionCoordinators.current.set(id, coordinator) }
    return coordinator
  }, [])
  const activeDecisionCoordinator = candidateId ? decisionCoordinatorFor(candidateId) : null
  const decisionOperations = useSyncExternalStore(activeDecisionCoordinator?.subscribe ?? noopSubscribe, activeDecisionCoordinator?.snapshot ?? (() => emptyDecisionOperations), () => emptyDecisionOperations)

  const restoreGenerationState = useCallback((coordinator: PlanGenerationCoordinator) => {
    setGenerationPending(coordinator.pending !== null)
    setPendingAvailableMinutes(coordinator.pending?.availableMinutes ?? null)
    setGenerationRetryable(coordinator.outcome === 'retryable')
    if (coordinator.running) {
      setGenerationStatus('generating')
      setGenerationErrorMessage('')
    } else if (coordinator.outcome === 'retryable') {
      setGenerationStatus('error')
      setGenerationErrorMessage('Falha de comunicação. A operação ficou pendente e pode ser repetida com os mesmos parâmetros.')
    } else if (coordinator.outcome === 'conflict') {
      setGenerationStatus('conflict')
      setGenerationErrorMessage('A API informou conflito para esta chave de idempotência. A operação foi mantida bloqueada; encerre-a explicitamente antes de iniciar outra.')
    } else if (coordinator.outcome === 'definitive') {
      setGenerationStatus('failed')
      setGenerationErrorMessage('A geração foi rejeitada. Encerre a operação antes de iniciar outra.')
    } else if (coordinator.outcome === 'no-action') {
      setGenerationStatus('no-action')
      setGenerationErrorMessage('O motor adaptativo não encontrou uma recomendação neste momento.')
    } else {
      setGenerationStatus('idle')
      setGenerationErrorMessage('')
    }
  }, [])

  const loadCurrent = useCallback(async (activeCheck?: () => boolean) => {
    if (!candidateId) {
      setPlan(null)
      setLoadedCandidateId(undefined)
      setAvailableMinutesState(120)
      setStatus('idle')
      return
    }
    setStatus('loading')
    setRetryable(false)
    try {
      const result = await studyPlanApi.getCurrent()
      if ((activeCheck && !activeCheck()) || currentCandidateId.current !== candidateId) return
      setLoadedCandidateId(candidateId)
      restoreGenerationState(coordinatorFor(candidateId))
      if (result.plan) {
        setPlan({ plan: result.plan, items: result.items })
        setAvailableMinutesState(result.plan.availableMinutes)
        setStatus('ready')
      } else {
        setPlan(null)
        setAvailableMinutesState(120)
        setStatus('no-plan')
      }
    } catch (error: unknown) {
      if ((activeCheck && !activeCheck()) || currentCandidateId.current !== candidateId) return
      setLoadedCandidateId(candidateId)
      restoreGenerationState(coordinatorFor(candidateId))
      setRetryable(isRetryable(error))
      setStatus('load-error')
    }
  }, [candidateId, coordinatorFor, restoreGenerationState])

  useEffect(() => {
    let active = true
    setLoadedCandidateId(undefined)
    setPlan(null)
    setAvailableMinutesState(120)
    setGenerationStatus('idle')
    setGenerationRetryable(false)
    void loadCurrent(() => active)
    return () => { active = false }
  }, [candidateId, loadCurrent, reloadKey])

  const setAvailableMinutes = useCallback((minutes: number) => {
    const bounded = Number.isFinite(minutes) ? Math.min(720, Math.max(1, Math.trunc(minutes))) : 1
    setAvailableMinutesState(bounded)
  }, [])

  const generate = useCallback(() => {
    if (!candidateId || loadedCandidateId !== candidateId || status === 'loading' || status === 'load-error') return

    const coordinator = coordinatorFor(candidateId)
    const operation = coordinator.beginOrRetry(availableMinutes, () => crypto.randomUUID())
    if (!operation) return

    const requestedCandidateId = candidateId
    setGenerationPending(true)
    setPendingAvailableMinutes(operation.availableMinutes)
    setGenerationStatus('generating')
    setGenerationRetryable(false)
    setGenerationErrorMessage('')

    void (async () => {
      const result = await coordinator.execute((minutes, key) => studyPlanApi.generate(minutes, key))
      if (currentCandidateId.current !== requestedCandidateId || !result) return

      if (result.kind === 'success') {
        setPlan(result.value)
        setLoadedCandidateId(requestedCandidateId)
        setStatus('ready')
        setGenerationStatus('idle')
        setGenerationRetryable(false)
        setGenerationPending(false)
        setPendingAvailableMinutes(null)
        return
      }

      setGenerationPending(coordinator.pending !== null)
      setPendingAvailableMinutes(coordinator.pending?.availableMinutes ?? null)
      if (result.kind === 'no-action') {
        setGenerationStatus('no-action')
        setGenerationRetryable(false)
        setGenerationErrorMessage('O motor adaptativo não encontrou uma recomendação neste momento.')
      } else if (result.kind === 'retryable') {
        setGenerationStatus('error')
        setGenerationRetryable(true)
        setGenerationErrorMessage('Falha de comunicação. A operação ficou pendente e pode ser repetida com os mesmos parâmetros.')
      } else if (result.kind === 'conflict') {
        setGenerationStatus('conflict')
        setGenerationRetryable(false)
        setGenerationErrorMessage('A API informou conflito para esta chave de idempotência. A operação foi mantida bloqueada; encerre-a explicitamente antes de iniciar outra.')
      } else {
        const error = result.error
        const code = error instanceof ApiError ? error.code : undefined
        const statusCode = error instanceof ApiError ? error.status : undefined
        setGenerationStatus('failed')
        setGenerationRetryable(false)
        setGenerationErrorMessage(code ? `A API rejeitou a geração (${code}).` : statusCode ? `A API rejeitou a geração (HTTP ${statusCode}).` : 'A geração foi rejeitada. Encerre a operação antes de iniciar outra.')
      }
    })()
  }, [availableMinutes, candidateId, coordinatorFor, loadedCandidateId, status])

  const closeGeneration = useCallback(() => {
    if (!candidateId || !coordinatorFor(candidateId).close()) return
    setGenerationPending(false)
    setPendingAvailableMinutes(null)
    setGenerationStatus('idle')
    setGenerationRetryable(false)
    setGenerationErrorMessage('')
  }, [candidateId, coordinatorFor])

  const executeDecision = useCallback(async (decision: DailyPlanDecision, key: string, itemId: string, replacementTopicId?: string) => {
    if (!candidateId || !plan?.plan) throw new Error('Plano indisponÃ­vel.')
    await studyPlanApi.recordDecision(plan.plan.id, itemId, decision, key, replacementTopicId)
    const fresh = await studyPlanApi.getDetails(plan.plan.id)
    if (currentCandidateId.current === candidateId) { setPlan(fresh); setStatus('ready') }
  }, [candidateId, plan])

  const decide = useCallback((itemId: string, decision: DailyPlanDecision, replacementTopicId?: string) => {
    if (!candidateId || !plan?.plan) return
    const item = plan.items.find((entry) => entry.id === itemId)
    if (!item || ['completed', 'ignored', 'replaced'].includes(item.execution?.status ?? '')) return
    const coordinator = decisionCoordinatorFor(candidateId)
    void coordinator.start(itemId, decision, replacementTopicId, () => crypto.randomUUID(), async (chosen, key, replacement) => {
      try { await executeDecision(chosen, key, itemId, replacement) }
      catch (error) {
        if (error instanceof ApiError && error.status === 409) {
          try { const fresh = await studyPlanApi.getDetails(plan.plan.id); if (currentCandidateId.current === candidateId) setPlan(fresh) } catch { /* conflict remains visible */ }
        }
        throw error
      }
    })
  }, [candidateId, decisionCoordinatorFor, executeDecision, plan])
  const retryDecision = useCallback((itemId: string) => {
    if (!candidateId || !plan?.plan) return
    void decisionCoordinatorFor(candidateId).retry(itemId, async (chosen, key, replacement) => {
      try { await executeDecision(chosen, key, itemId, replacement) }
      catch (error) {
        if (error instanceof ApiError && error.status === 409) {
          try { const fresh = await studyPlanApi.getDetails(plan.plan.id); if (currentCandidateId.current === candidateId) setPlan(fresh) } catch { /* conflict remains visible */ }
        }
        throw error
      }
    })
  }, [candidateId, decisionCoordinatorFor, executeDecision, plan])
  const closeDecision = useCallback((itemId: string) => { if (candidateId) decisionCoordinatorFor(candidateId).close(itemId) }, [candidateId, decisionCoordinatorFor])

  const candidateIsLoaded = candidateId !== undefined && loadedCandidateId === candidateId
  const visiblePlan = candidateIsLoaded ? plan : null
  const visibleStatus: PlanStatus = candidateId === undefined ? 'idle' : candidateIsLoaded ? status : 'loading'
  const visibleAvailableMinutes = candidateIsLoaded ? availableMinutes : 120
  const visibleGenerationStatus = candidateIsLoaded ? generationStatus : 'idle'
  const visibleGenerationPending = candidateIsLoaded && generationPending
  const activities = visiblePlan ? makeActivities(visiblePlan.items) : []
  const totalMinutes = activities.reduce((sum, activity) => sum + activity.recommendedDurationMinutes, 0)
  const bestAction = activities.find((activity) => activity.isBestAction)
  const availabilityChanged = visiblePlan !== null && visibleAvailableMinutes !== visiblePlan.plan.availableMinutes

  return {
    status: visibleStatus,
    retryable: candidateIsLoaded && retryable,
    plan: visiblePlan,
    activities,
    recommendationCount: activities.length,
    totalMinutes,
    bestActionExceedsAvailability: bestAction !== undefined && bestAction.recommendedDurationMinutes > visibleAvailableMinutes,
    availableMinutes: visibleAvailableMinutes,
    availabilityChanged,
    generationStatus: visibleGenerationStatus,
    generationRetryable: candidateIsLoaded && generationRetryable,
    generationPending: visibleGenerationPending,
    pendingAvailableMinutes: candidateIsLoaded ? pendingAvailableMinutes : null,
    generationErrorMessage: candidateIsLoaded ? generationErrorMessage : '',
    setAvailableMinutes,
    generate,
    closeGeneration,
    retry: () => setReloadKey((key) => key + 1),
    decisionOperations,
    decide,
    retryDecision,
    closeDecision,
    refresh: () => { if (candidateId) void studyPlanApi.getCurrent().then((fresh) => { if (currentCandidateId.current === candidateId && fresh.plan) { setPlan({ plan: fresh.plan, items: fresh.items }); setStatus('ready') } }).catch(() => {}) },
  }
}
