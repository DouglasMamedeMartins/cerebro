import { useMemo, useRef, useSyncExternalStore } from 'react'
import { candidateApi, type CreateStudySessionPayload } from '../services/api'
import { StudySessionRegistrationCoordinator } from './studySessionRegistrationCoordinator'

const emptyOperations = new Map<string, never>()
const emptySubscribe = () => () => undefined
const emptySnapshot = () => emptyOperations

export function useStudySessionRegistration(candidateId: string | undefined, onSuccess: () => void) {
  const onSuccessRef = useRef(onSuccess)
  onSuccessRef.current = onSuccess
  const coordinator = useMemo(() => candidateId
    ? new StudySessionRegistrationCoordinator(
      (payload, key) => candidateApi.createStudySession(payload, key),
      () => onSuccessRef.current(),
    )
    : null, [candidateId])
  const operations = useSyncExternalStore(
    coordinator?.subscribe ?? emptySubscribe,
    coordinator?.getSnapshot ?? emptySnapshot,
    coordinator?.getSnapshot ?? emptySnapshot,
  )

  return {
    operations,
    start(itemId: string, topicId: string, durationMinutes: number) {
      if (!coordinator || !candidateId) return false
      const payload: CreateStudySessionPayload = { candidateId, topicId, durationMinutes, studyPlanItemId: itemId }
      return coordinator.start(itemId, payload)
    },
    retry: (itemId: string) => coordinator?.retry(itemId) ?? false,
    close: (itemId: string) => coordinator?.close(itemId) ?? false,
  }
}
