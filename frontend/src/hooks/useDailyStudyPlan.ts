import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { ApiError, studyPlanApi, type DailyPlanDecision, type DailyStudyPlanItemSnapshot, type DailyStudyPlanSnapshot } from '../services/api'
import { PlanGenerationCoordinator } from './dailyStudyPlanGeneration'
import { DailyPlanDecisionCoordinator } from './dailyPlanDecisionCoordinator'
import { DailyPlanCustomizationCoordinator, type DailyPlanCustomizationOperation, type DailyPlanCustomizationRequest } from './dailyPlanCustomizationCoordinator'

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
  allActivities: DailyPlanActivity[]
  unscheduledActivities: DailyPlanActivity[]
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
  planMutationBlocked: boolean
  decide: (itemId: string, decision: DailyPlanDecision, replacementTopicId?: string) => void
  retryDecision: (itemId: string) => void
  closeDecision: (itemId: string) => void
  customizationOperation: DailyPlanCustomizationOperation | null
  customize: (request: DailyPlanCustomizationRequest) => void
  retryCustomization: () => void
  closeCustomization: () => void
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

function byPersonalizedOrder(left: DailyPlanActivity, right: DailyPlanActivity): number {
  return (left.personalization?.presentationOrder ?? left.presentationOrder)
    - (right.personalization?.presentationOrder ?? right.presentationOrder)
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
  const customizationCoordinators = useRef(new Map<string, DailyPlanCustomizationCoordinator>())
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
  const customizationCoordinator = candidateId ? (() => {
    let coordinator = customizationCoordinators.current.get(candidateId)
    if (!coordinator) { coordinator = new DailyPlanCustomizationCoordinator(); customizationCoordinators.current.set(candidateId, coordinator) }
    return coordinator
  })() : null
  const customizationOperation = useSyncExternalStore(
    customizationCoordinator?.subscribe ?? noopSubscribe,
    customizationCoordinator?.snapshot ?? (() => null),
    () => null,
  )

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
        const details = await studyPlanApi.getDetails(result.plan.id)
        if ((activeCheck && !activeCheck()) || currentCandidateId.current !== candidateId) return
        setPlan(details)
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
    if (customizationCoordinator?.snapshot()?.status !== undefined && customizationCoordinator.snapshot()?.status !== 'success') return
    if ([...decisionOperations.values()].some((operation) => operation.status !== 'success')) return

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
  }, [availableMinutes, candidateId, coordinatorFor, customizationCoordinator, decisionOperations, loadedCandidateId, status])

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
    if (generationCoordinators.current.get(candidateId)?.pending || customizationCoordinator?.snapshot()?.status && customizationCoordinator.snapshot()?.status !== 'success') return
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
  }, [candidateId, customizationCoordinator, decisionCoordinatorFor, executeDecision, plan])
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

  const executeCustomization = useCallback(async (request: DailyPlanCustomizationRequest, key: string) => {
    if (!candidateId || !plan?.plan) throw new Error('Plano indisponÃ­vel.')
    const planId = plan.plan.id
    try {
      const result = request.operation === 'reorder'
        ? await studyPlanApi.reorder(planId, [...request.itemIds], key)
        : request.operation === 'duration'
          ? await studyPlanApi.changeDuration(planId, request.itemId, request.plannedDurationMinutes, key)
          : request.operation === 'add'
            ? await studyPlanApi.addActivity(planId, {
              topicId: request.topicId,
              activityType: request.activityType,
              plannedDurationMinutes: request.plannedDurationMinutes,
              ...(request.presentationOrder === undefined ? {} : { presentationOrder: request.presentationOrder }),
            }, key)
            : await studyPlanApi.unschedule(planId, request.itemId, key)
      if (currentCandidateId.current === candidateId) {
        setPlan(result.plan)
        setStatus('ready')
      }
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        try {
          const fresh = await studyPlanApi.getDetails(planId)
          if (currentCandidateId.current === candidateId) setPlan(fresh)
        } catch { /* o conflito continua visÃ­vel para atualizaÃ§Ã£o explÃ­cita */ }
      }
      throw error
    }
  }, [candidateId, plan])

  const customize = useCallback((request: DailyPlanCustomizationRequest) => {
    if (!candidateId || !plan?.plan || !customizationCoordinator) return
    if (generationCoordinators.current.get(candidateId)?.pending || [...decisionOperations.values()].some((operation) => operation.status !== 'success')) return
    void customizationCoordinator.start(request, () => crypto.randomUUID(), executeCustomization)
  }, [candidateId, customizationCoordinator, decisionOperations, executeCustomization, plan])

  const retryCustomization = useCallback(() => {
    if (customizationCoordinator) void customizationCoordinator.retry(executeCustomization)
  }, [customizationCoordinator, executeCustomization])

  const closeCustomization = useCallback(() => { customizationCoordinator?.close() }, [customizationCoordinator])

  const candidateIsLoaded = candidateId !== undefined && loadedCandidateId === candidateId
  const visiblePlan = candidateIsLoaded ? plan : null
  const visibleStatus: PlanStatus = candidateId === undefined ? 'idle' : candidateIsLoaded ? status : 'loading'
  const visibleAvailableMinutes = candidateIsLoaded ? availableMinutes : 120
  const visibleGenerationStatus = candidateIsLoaded ? generationStatus : 'idle'
  const visibleGenerationPending = candidateIsLoaded && generationPending
  const allActivities = visiblePlan ? makeActivities(visiblePlan.items) : []
  const activities = allActivities.filter((activity) => activity.personalization?.isScheduled !== false).sort(byPersonalizedOrder)
  const unscheduledActivities = allActivities.filter((activity) => activity.personalization?.isScheduled === false).sort(byPersonalizedOrder)
  const totalMinutes = activities.reduce((sum, activity) => sum + (activity.personalization?.plannedDurationMinutes ?? activity.recommendedDurationMinutes), 0)
  const bestAction = activities.find((activity) => activity.isBestAction)
  const availabilityChanged = visiblePlan !== null && visibleAvailableMinutes !== visiblePlan.plan.availableMinutes
  const planMutationBlocked = (customizationOperation !== null && customizationOperation.status !== 'success')
    || [...decisionOperations.values()].some((operation) => operation.status !== 'success')

  return {
    status: visibleStatus,
    retryable: candidateIsLoaded && retryable,
    plan: visiblePlan,
    activities,
    allActivities,
    unscheduledActivities,
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
    planMutationBlocked,
    decide,
    retryDecision,
    closeDecision,
    customizationOperation: candidateIsLoaded ? customizationOperation : null,
    customize,
    retryCustomization,
    closeCustomization,
    refresh: () => {
      if (!candidateId) return
      const planId = plan?.plan.id
      if (planId) void studyPlanApi.getDetails(planId).then((fresh) => { if (currentCandidateId.current === candidateId) { setPlan(fresh); setStatus('ready') } }).catch(() => {})
      else void loadCurrent()
    },
  }
}
