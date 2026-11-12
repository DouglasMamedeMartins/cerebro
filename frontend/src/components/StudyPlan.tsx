import { AlertCircle, ArrowRight, CalendarDays, LoaderCircle } from 'lucide-react'
import type { DailyStudyPlanViewModel } from '../hooks/useDailyStudyPlan'
import { StudyPlanAvailability, StudyPlanGenerationControls, StudyPlanRecommendations, formatPlanDuration } from './StudyPlanRecommendations'

interface StudyPlanProps {
  plan: DailyStudyPlanViewModel
  candidateId: string
  registration: Parameters<typeof StudyPlanRecommendations>[0]['registration']
  onViewPlan: () => void
}

export function StudyPlan({ plan, candidateId, registration, onViewPlan }: StudyPlanProps) {
  return (
    <section className="panel schedule-panel" aria-labelledby="schedule-heading">
      <div className="section-heading flex items-center justify-between">
        <div><span className="section-kicker">PLANEJAMENTO ADAPTATIVO</span><h2 id="schedule-heading">Plano de estudos de hoje</h2></div>
        <span className="day-pill"><CalendarDays size={14} aria-hidden="true" /> HOJE</span>
      </div>

      <StudyPlanAvailability value={plan.availableMinutes} onChange={plan.setAvailableMinutes} />

      {plan.status === 'loading' && <div className="plan-message" role="status"><LoaderCircle size={16} className="plan-spinner" />Carregando recomendações...</div>}
      {plan.status === 'load-error' && <div className="plan-message plan-message-error" role="alert"><AlertCircle size={16} />Não foi possível consultar o plano salvo.{plan.retryable && <button className="text-action" onClick={plan.retry}>Tentar novamente</button>}</div>}
      {plan.status === 'no-plan' && <div className="plan-message" role="status">Ainda não há um plano salvo para hoje.</div>}
      <StudyPlanGenerationControls plan={plan} />

      {plan.status === 'ready' && <>
        <StudyPlanRecommendations activities={plan.activities} compact registration={registration} candidateId={candidateId} decisions={plan} />
        {plan.bestActionExceedsAvailability && <p className="plan-limit-message">A melhor ação ({plan.activities.find((activity) => activity.isBestAction)?.recommendedDurationMinutes} min) excede a disponibilidade selecionada. O snapshot permanece inalterado.</p>}
        {plan.activities.length === 1 && <p className="plan-limit-message">{plan.recommendationCount === 1 ? 'O snapshot contém somente uma atividade.' : 'O snapshot não contém atividades adicionais.'}</p>}
        <div className="schedule-footer flex items-center justify-between">
          <span>Duração total sugerida <strong>{formatPlanDuration(plan.totalMinutes)}</strong></span>
          <button className="text-action" onClick={onViewPlan}>Ver plano completo <ArrowRight size={15} aria-hidden="true" /></button>
        </div>
        <p className="daily-plan-snapshot-meta">Versão {plan.plan?.plan.version} · gerado em {plan.plan ? new Date(plan.plan.plan.generatedAt).toLocaleString('pt-BR') : ''}</p>
      </>}
    </section>
  )
}
