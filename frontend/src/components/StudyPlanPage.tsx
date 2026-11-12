import { AlertCircle, BookOpen, CalendarDays, Clock3, LoaderCircle } from 'lucide-react'
import type { DailyStudyPlanViewModel } from '../hooks/useDailyStudyPlan'
import { StudyPlanAvailability, StudyPlanGenerationControls, StudyPlanRecommendations, formatPlanDuration } from './StudyPlanRecommendations'
import { PageHeading } from './PageHeading'

interface StudyPlanPageProps {
  plan: DailyStudyPlanViewModel
  candidateId: string
  registration: Parameters<typeof StudyPlanRecommendations>[0]['registration']
}

export function StudyPlanPage({ plan, candidateId, registration }: StudyPlanPageProps) {
  const hasPlan = plan.status === 'ready'
  const bestAction = hasPlan ? plan.activities[0] : undefined

  return (
    <div className="feature-page">
      <PageHeading eyebrow="ORGANIZE SEU RITMO" title="Plano de estudos" description="Recomendações adaptativas para orientar o estudo de hoje, sem horário obrigatório." />

      <section className="plan-summary-grid" aria-label="Resumo do plano diário">
        <article className="panel plan-summary-card"><div className="plan-summary-icon"><CalendarDays size={18} aria-hidden="true" /></div><span>ATIVIDADES NO SNAPSHOT</span><strong>{hasPlan ? plan.activities.length : '—'}</strong><small>registradas na versão salva</small></article>
        <article className="panel plan-summary-card"><div className="plan-summary-icon plan-icon-green"><BookOpen size={18} aria-hidden="true" /></div><span>MELHOR AÇÃO</span><strong>{bestAction ? `${bestAction.recommendedDurationMinutes} min` : '—'}</strong><small>{bestAction?.topicName ?? 'Recomendação prioritária'}</small></article>
        <article className="panel plan-summary-card"><div className="plan-summary-icon plan-icon-violet"><Clock3 size={18} aria-hidden="true" /></div><span>DURAÇÃO TOTAL SUGERIDA</span><strong>{hasPlan ? formatPlanDuration(plan.totalMinutes) : '—'}</strong><small>com base nas recomendações incluídas</small></article>
        <article className="panel plan-progress-card plan-availability-card"><StudyPlanAvailability value={plan.availableMinutes} onChange={plan.setAvailableMinutes} /><p>Referência flexível; não é uma meta obrigatória.</p></article>
      </section>

      <section className="panel plan-list-panel" aria-labelledby="plan-list-title">
        <div className="page-panel-heading"><div><span className="section-kicker">MOTOR ADAPTATIVO</span><h2 id="plan-list-title">Atividades recomendadas</h2></div><span className="day-pill"><BookOpen size={14} aria-hidden="true" /> ORDEM DE PRIORIDADE</span></div>

        {plan.status === 'loading' && <div className="plan-empty-state" role="status"><LoaderCircle size={18} className="plan-spinner" /><strong>Carregando plano salvo...</strong></div>}
        {plan.status === 'load-error' && <div className="plan-empty-state plan-error-state" role="alert"><div><AlertCircle size={23} aria-hidden="true" /></div><strong>Não foi possível consultar o plano salvo</strong><p>O serviço não conseguiu completar a consulta.</p>{plan.retryable && <button className="text-action" onClick={plan.retry}>Tentar novamente</button>}</div>}
        {plan.status === 'no-plan' && <div className="plan-empty-state" role="status"><div><BookOpen size={23} aria-hidden="true" /></div><strong>Ainda não há um plano salvo para hoje</strong><p>Gere o primeiro snapshot quando quiser.</p></div>}
        <StudyPlanGenerationControls plan={plan} />

        {hasPlan && <>
          <StudyPlanRecommendations activities={plan.activities} registration={registration} candidateId={candidateId} decisions={plan} />
          {plan.bestActionExceedsAvailability && <p className="plan-limit-message">A melhor ação ({bestAction?.recommendedDurationMinutes} min) excede a disponibilidade selecionada. O snapshot salvo não foi alterado.</p>}
          {plan.activities.length === 1 && <p className="plan-limit-message">O snapshot contém somente uma atividade.</p>}
          <p className="daily-plan-snapshot-meta">Snapshot versão {plan.plan?.plan.version} · gerado em {plan.plan ? new Date(plan.plan.plan.generatedAt).toLocaleString('pt-BR') : ''}.</p>
        </>}
      </section>
    </div>
  )
}
