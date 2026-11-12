import { AlertCircle, ArrowRight, CalendarDays, LoaderCircle } from 'lucide-react'
import type { DailyStudyPlanViewModel } from '../hooks/useDailyStudyPlan'
import { StudyPlanAvailability, StudyPlanRecommendations, formatPlanDuration } from './StudyPlanRecommendations'

interface StudyPlanProps {
  plan: DailyStudyPlanViewModel
  onViewPlan: () => void
}

export function StudyPlan({ plan, onViewPlan }: StudyPlanProps) {
  return (
    <section className="panel schedule-panel" aria-labelledby="schedule-heading">
      <div className="section-heading flex items-center justify-between">
        <div><span className="section-kicker">PLANEJAMENTO ADAPTATIVO</span><h2 id="schedule-heading">Plano de estudos de hoje</h2></div>
        <span className="day-pill"><CalendarDays size={14} aria-hidden="true" /> HOJE</span>
      </div>

      <StudyPlanAvailability value={plan.availableMinutes} onChange={plan.setAvailableMinutes} />

      {plan.status === 'loading' && <div className="plan-message" role="status"><LoaderCircle size={16} className="plan-spinner" />Carregando recomendações...</div>}
      {plan.status === 'error' && <div className="plan-message plan-message-error" role="alert"><AlertCircle size={16} />Não foi possível carregar o plano.{plan.retryable && <button className="text-action" onClick={plan.retry}>Tentar novamente</button>}</div>}
      {plan.status === 'empty' && <div className="plan-message" role="status">Não há uma recomendação disponível neste momento.</div>}

      {plan.status === 'ready' && <>
        <StudyPlanRecommendations activities={plan.activities} compact />
        {plan.bestActionExceedsAvailability && <p className="plan-limit-message">A melhor ação ({plan.activities[0].durationMinutes} min) excede o tempo disponível informado e foi mantida como primeira atividade.</p>}
        {plan.activities.length === 1 && !plan.bestActionExceedsAvailability && <p className="plan-limit-message">{plan.recommendationCount === 1 ? 'Não há tópicos adicionais no ranking.' : 'Nenhum tópico adicional cabe no tempo disponível.'}</p>}
        <div className="schedule-footer flex items-center justify-between">
          <span>Duração total sugerida <strong>{formatPlanDuration(plan.totalMinutes)}</strong></span>
          <button className="text-action" onClick={onViewPlan}>Ver plano completo <ArrowRight size={15} aria-hidden="true" /></button>
        </div>
      </>}
    </section>
  )
}
