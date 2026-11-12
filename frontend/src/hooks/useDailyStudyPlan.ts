import { useEffect, useMemo, useState } from 'react'
import { ApiError, candidateApi, type CandidateBestAction } from '../services/api'

export interface DailyPlanActivity {
  id: string
  topicName: string
  subjectName: string
  type: CandidateBestAction['type']
  durationMinutes: number
  priorityScore: number
  priorityLevel: CandidateBestAction['priorityLevel']
  explanation: string
  expectedImpact: string
  isBestAction: boolean
}

export interface DailyStudyPlanViewModel {
  status: 'idle' | 'loading' | 'error' | 'empty' | 'ready'
  retryable: boolean
  activities: DailyPlanActivity[]
  recommendationCount: number
  totalMinutes: number
  bestActionExceedsAvailability: boolean
  availableMinutes: number
  setAvailableMinutes: (minutes: number) => void
  retry: () => void
}

type PlanLoadState =
  | { status: 'idle' | 'loading' | 'empty' }
  | { status: 'error'; retryable: boolean }
  | { status: 'ready'; recommendations: DailyPlanActivity[] }

const MAX_ADDITIONAL_RECOMMENDATIONS = 5

export function useDailyStudyPlan(candidateId: string | undefined): DailyStudyPlanViewModel {
  const [loadState, setLoadState] = useState<PlanLoadState>({ status: 'idle' })
  const [availableMinutes, setAvailableMinutes] = useState(120)
  const [retryKey, setRetryKey] = useState(0)

  useEffect(() => {
    if (!candidateId) {
      setLoadState({ status: 'idle' })
      return
    }

    let active = true
    setLoadState({ status: 'loading' })

    void (async () => {
      try {
        const rankedTopics = await candidateApi.getBestActionTopics(candidateId)
        if (rankedTopics.length === 0) {
          if (active) setLoadState({ status: 'empty' })
          return
        }

        const bestAction = await candidateApi.getBestAction(candidateId)
        const additionalTopics = rankedTopics
          .filter((topic) => topic.topicId !== bestAction.topicId)
          .slice(0, MAX_ADDITIONAL_RECOMMENDATIONS)

        const additionalActions = await Promise.all(additionalTopics.map(async (topic) => {
          const action = await candidateApi.getBestActionForTopic(candidateId, topic.topicId)
          if (action.candidateId !== candidateId || action.topicId !== topic.topicId) {
            throw new Error('A recomendação retornou uma identidade incompatível.')
          }
          return {
            id: action.topicId,
            topicName: topic.topicName,
            subjectName: topic.subjectName,
            type: action.type,
            durationMinutes: action.durationMinutes,
            priorityScore: action.priorityScore,
            priorityLevel: action.priorityLevel,
            explanation: action.explanation,
            expectedImpact: action.expectedImpact,
            isBestAction: false,
          } satisfies DailyPlanActivity
        }))

        const primaryActivity: DailyPlanActivity = {
          id: bestAction.topicId,
          topicName: bestAction.topicName,
          subjectName: bestAction.subjectName,
          type: bestAction.type,
          durationMinutes: bestAction.durationMinutes,
          priorityScore: bestAction.priorityScore,
          priorityLevel: bestAction.priorityLevel,
          explanation: bestAction.explanation,
          expectedImpact: bestAction.expectedImpact,
          isBestAction: true,
        }

        if (active) setLoadState({ status: 'ready', recommendations: [primaryActivity, ...additionalActions] })
      } catch (error: unknown) {
        if (!active) return
        if (error instanceof ApiError && error.code === 'NO_ACTION_AVAILABLE') {
          setLoadState({ status: 'empty' })
          return
        }

        const retryable = error instanceof ApiError && (
          error.kind === 'network' ||
          (error.kind === 'http' && (error.status === 408 || error.status === 429 || (error.status !== undefined && error.status >= 500)))
        )
        setLoadState({ status: 'error', retryable })
      }
    })()

    return () => { active = false }
  }, [candidateId, retryKey])

  const activities = useMemo(() => {
    if (loadState.status !== 'ready') return []
    const [bestAction, ...additionalActivities] = loadState.recommendations
    if (!bestAction) return []

    const selected = [bestAction]
    let total = bestAction.durationMinutes
    for (const activity of additionalActivities) {
      if (total + activity.durationMinutes <= availableMinutes) {
        selected.push(activity)
        total += activity.durationMinutes
      }
    }
    return selected
  }, [availableMinutes, loadState])

  const totalMinutes = activities.reduce((sum, activity) => sum + activity.durationMinutes, 0)
  const bestActionExceedsAvailability = activities[0] !== undefined && activities[0].durationMinutes > availableMinutes

  return {
    status: loadState.status,
    retryable: loadState.status === 'error' && loadState.retryable,
    activities,
    recommendationCount: loadState.status === 'ready' ? loadState.recommendations.length : 0,
    totalMinutes,
    bestActionExceedsAvailability,
    availableMinutes,
    setAvailableMinutes: (minutes: number) => setAvailableMinutes(Number.isFinite(minutes) ? Math.max(0, Math.trunc(minutes)) : 0),
    retry: () => setRetryKey((key) => key + 1),
  }
}
