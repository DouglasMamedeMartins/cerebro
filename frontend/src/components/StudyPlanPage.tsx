import { AlertCircle, BookOpen, CalendarDays, Clock3, LoaderCircle } from 'lucide-react'
import type { DailyStudyPlanViewModel } from '../hooks/useDailyStudyPlan'
import { StudyPlanAvailability, StudyPlanRecommendations, formatPlanDuration } from './StudyPlanRecommendations'
import { PageHeading } from './PageHeading'

interface StudyPlanPageProps {
  plan: DailyStudyPlanViewModel
}

export function StudyPlanPage({ plan }: StudyPlanPageProps) {
  const hasPlan = plan.status === 'ready'
  const bestAction = hasPlan ? plan.activities[0] : undefined

  return (
    <div className="feature-page">
      <PageHeading eyebrow="ORGANIZE SEU RITMO" title="Plano de estudos" description="Recomendações adaptativas para orientar o estudo de hoje, sem horário obrigatório." />

      <section className="plan-summary-grid" aria-label="Resumo do plano diário">
        <article className="panel plan-summary-card"><div className="plan-summary-icon"><CalendarDays size={18} aria-hidden="true" /></div><span>ATIVIDADES SUGERIDAS</span><strong>{hasPlan ? plan.activities.length : '—'}</strong><small>selecionadas pelo tempo disponível</small></article>
        <article className="panel plan-summary-card"><div className="plan-summary-icon plan-icon-green"><BookOpen size={18} aria-hidden="true" /></div><span>MELHOR AÇÃO</span><strong>{bestAction ? `${bestAction.durationMinutes} min` : '—'}</strong><small>{bestAction?.topicName ?? 'Recomendação prioritária'}</small></article>
        <article className="panel plan-summary-card"><div className="plan-summary-icon plan-icon-violet"><Clock3 size={18} aria-hidden="true" /></div><span>DURAÇÃO TOTAL SUGERIDA</span><strong>{hasPlan ? formatPlanDuration(plan.totalMinutes) : '—'}</strong><small>com base nas recomendações incluídas</small></article>
        <article className="panel plan-progress-card plan-availability-card"><StudyPlanAvailability value={plan.availableMinutes} onChange={plan.setAvailableMinutes} /><p>Referência flexível; não é uma meta obrigatória.</p></article>
      </section>

      <section className="panel plan-list-panel" aria-labelledby="plan-list-title">
        <div className="page-panel-heading"><div><span className="section-kicker">MOTOR ADAPTATIVO</span><h2 id="plan-list-title">Atividades recomendadas</h2></div><span className="day-pill"><BookOpen size={14} aria-hidden="true" /> ORDEM DE PRIORIDADE</span></div>

        {plan.status === 'loading' && <div className="plan-empty-state" role="status"><LoaderCircle size={18} className="plan-spinner" /><strong>Carregando recomendações...</strong></div>}
        {plan.status === 'error' && <div className="plan-empty-state plan-error-state" role="alert"><div><AlertCircle size={23} aria-hidden="true" /></div><strong>Não foi possível carregar o plano</strong><p>O serviço não conseguiu completar a consulta.</p>{plan.retryable && <button className="text-action" onClick={plan.retry}>Tentar novamente</button>}</div>}
        {plan.status === 'empty' && <div className="plan-empty-state" role="status"><div><BookOpen size={23} aria-hidden="true" /></div><strong>Nenhuma recomendação disponível neste momento</strong><p>O motor adaptativo não retornou uma ação para este candidato.</p></div>}

        {hasPlan && <>
          <StudyPlanRecommendations activities={plan.activities} />
          {plan.bestActionExceedsAvailability && <p className="plan-limit-message">A melhor ação ({plan.activities[0].durationMinutes} min) excede o tempo disponível informado. Ela permanece em primeiro lugar; nenhuma atividade adicional foi incluída.</p>}
          {plan.activities.length === 1 && !plan.bestActionExceedsAvailability && <p className="plan-limit-message">{plan.recommendationCount === 1 ? 'Não há tópicos adicionais no ranking.' : 'Nenhum tópico adicional cabe no tempo disponível.'}</p>}
          <p className="daily-plan-disclaimer">Este plano é transitório e não registra sessões nem salva as atividades.</p>
        </>}
      </section>
    </div>
  )
}
