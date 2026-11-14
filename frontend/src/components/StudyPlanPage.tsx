import { AlertCircle, BookOpen, CalendarDays, Clock3, LoaderCircle } from 'lucide-react'
import type { DailyStudyPlanViewModel } from '../hooks/useDailyStudyPlan'
import { StudyPlanAvailability, StudyPlanGenerationControls, StudyPlanRecommendations, formatPlanDuration } from './StudyPlanRecommendations'
import { PageHeading } from './PageHeading'
import { ManualPlanActivityForm } from './ManualPlanActivityForm'
import { StudyPlanHistory } from './StudyPlanHistory'

interface StudyPlanPageProps {
  plan: DailyStudyPlanViewModel
  candidateId: string
  registration: Parameters<typeof StudyPlanRecommendations>[0]['registration']
}

export function StudyPlanPage({ plan, candidateId, registration }: StudyPlanPageProps) {
  const hasPlan = plan.status === 'ready'
  const bestAction = hasPlan ? plan.activities.find((activity) => activity.isBestAction) : undefined
  const customization = { customizationOperation: plan.customizationOperation, customize: plan.customize }
  const operation = plan.customizationOperation
  const customizationBlocked = plan.planMutationBlocked || plan.generationPending

  return (
    <div className="feature-page">
      <PageHeading eyebrow="ORGANIZE SEU RITMO" title="Plano de estudos" description="Recomendações adaptativas para orientar o estudo de hoje, sem horário obrigatório." />

      <section className="plan-summary-grid" aria-label="Resumo do plano diário">
        <article className="panel plan-summary-card"><div className="plan-summary-icon"><CalendarDays size={18} aria-hidden="true" /></div><span>ATIVIDADES NA PROGRAMAÇÃO</span><strong>{hasPlan ? plan.activities.length : '—'}</strong><small>{hasPlan ? `${plan.unscheduledActivities.length} fora da programação` : 'registradas na versão salva'}</small></article>
        <article className="panel plan-summary-card"><div className="plan-summary-icon plan-icon-green"><BookOpen size={18} aria-hidden="true" /></div><span>MELHOR AÇÃO</span><strong>{bestAction ? `${bestAction.personalization?.plannedDurationMinutes ?? bestAction.recommendedDurationMinutes} min` : '—'}</strong><small>{bestAction?.topicName ?? 'Recomendação prioritária'}</small></article>
        <article className="panel plan-summary-card"><div className="plan-summary-icon plan-icon-violet"><Clock3 size={18} aria-hidden="true" /></div><span>DURAÇÃO PLANEJADA</span><strong>{hasPlan ? formatPlanDuration(plan.totalMinutes) : '—'}</strong><small>atividades atualmente agendadas</small></article>
        <article className="panel plan-progress-card plan-availability-card"><StudyPlanAvailability value={plan.availableMinutes} onChange={plan.setAvailableMinutes} /><p>Referência flexível; não é uma meta obrigatória.</p></article>
      </section>

      <section className="panel plan-list-panel" aria-labelledby="plan-list-title">
        <div className="page-panel-heading"><div><span className="section-kicker">MOTOR ADAPTATIVO</span><h2 id="current-plan-title" tabIndex={-1}>Atividades recomendadas</h2></div><span className="day-pill"><BookOpen size={14} aria-hidden="true" /> ORDEM DE PRIORIDADE</span></div>

        {plan.status === 'loading' && <div className="plan-empty-state" role="status"><LoaderCircle size={18} className="plan-spinner" /><strong>Carregando plano salvo...</strong></div>}
        {plan.status === 'load-error' && <div className="plan-empty-state plan-error-state" role="alert"><div><AlertCircle size={23} aria-hidden="true" /></div><strong>Não foi possível consultar o plano salvo</strong><p>O serviço não conseguiu completar a consulta.</p>{plan.retryable && <button className="text-action" onClick={plan.retry}>Tentar novamente</button>}</div>}
        {plan.status === 'no-plan' && <div className="plan-empty-state" role="status"><div><BookOpen size={23} aria-hidden="true" /></div><strong>Ainda não há um plano salvo para hoje</strong><p>Gere o primeiro snapshot quando quiser.</p></div>}
        <StudyPlanGenerationControls plan={plan} />

        {hasPlan && <>
          <StudyPlanRecommendations activities={plan.activities} registration={registration} candidateId={candidateId} decisions={plan} customization={customization} editable externalMutationBlocked={plan.generationPending} />
          {plan.bestActionExceedsAvailability && <p className="plan-limit-message">A melhor ação ({bestAction?.recommendedDurationMinutes} min) excede a disponibilidade selecionada. O snapshot salvo não foi alterado.</p>}
          {plan.activities.length === 1 && <p className="plan-limit-message">O snapshot contém somente uma atividade.</p>}
          {plan.activities.length === 0 && <div className="plan-empty-state" role="status"><strong>Não há atividades na programação ativa.</strong><p>Você pode incluir uma atividade manualmente ou consultar os itens fora da programação abaixo.</p></div>}
          <p className="daily-plan-snapshot-meta">Snapshot versão {plan.plan?.plan.version} · gerado em {plan.plan ? new Date(plan.plan.plan.generatedAt).toLocaleString('pt-BR') : ''}.</p>
        </>}
      </section>

      {hasPlan && <>
        <ManualPlanActivityForm candidateId={candidateId} activeCount={plan.activities.length} operation={operation} blocked={customizationBlocked} onAdd={plan.customize} />
        {operation && <section className={`panel plan-customization-feedback ${operation.status === 'conflict' || operation.status === 'failed' ? 'execution-error' : ''}`} role={operation.status === 'failed' || operation.status === 'conflict' ? 'alert' : 'status'}>
          {operation.status === 'sending' && <><span>Salvando personalização...</span><LoaderCircle size={15} className="plan-spinner" /></>}
          {operation.status === 'success' && <span>Personalização salva e plano atualizado.</span>}
          {operation.status === 'retryable' && <><span>Não foi possível confirmar a operação. A mesma solicitação está preservada.</span><button type="button" onClick={plan.retryCustomization}>Tentar novamente</button></>}
          {operation.status === 'conflict' && <><span>O plano mudou antes da operação (HTTP 409). Os dados atualizados foram carregados; confira a programação antes de tentar outra ação.</span><button type="button" onClick={plan.closeCustomization}>Entendi</button></>}
          {operation.status === 'failed' && <><span>Não foi possível aplicar a personalização. Revise os dados e encerre esta tentativa antes de iniciar outra.</span><button type="button" onClick={plan.closeCustomization}>Fechar</button></>}
        </section>}
        <section className="panel plan-list-panel unscheduled-panel" aria-labelledby="unscheduled-title">
          <div className="page-panel-heading"><div><span className="section-kicker">HISTÓRICO DO PLANO</span><h2 id="unscheduled-title">Fora da programação</h2></div></div>
          {plan.unscheduledActivities.length === 0 ? <p className="plan-muted-message">Nenhuma atividade foi retirada da programação.</p> : <div className="unscheduled-activity-list">
            {plan.unscheduledActivities.map((activity) => {
              const execution = activity.execution
              return <article className="unscheduled-activity" key={activity.id}>
                <div><strong>{activity.topicName}</strong><span>{activity.subjectName} · {activity.activityType === 'study' ? 'Estudo' : activity.activityType === 'review' ? 'Revisão' : activity.activityType === 'questions' ? 'Questões' : activity.activityType === 'mixed' ? 'Estudo e questões' : 'Manutenção'}</span>
                  {activity.recommendationSource === 'manual' && <small className="manual-activity-badge">Adicionada manualmente</small>}
                </div>
                <dl><div><dt>Recomendado</dt><dd>{activity.recommendedDurationMinutes} min</dd></div><div><dt>Planejado</dt><dd>{activity.personalization?.plannedDurationMinutes ?? activity.recommendedDurationMinutes} min</dd></div><div><dt>Executado</dt><dd>{execution?.executedMinutes ?? 0} min</dd></div><div><dt>Sessões</dt><dd>{execution?.sessionCount ?? 0}</dd></div></dl>
                {execution?.lastSessionAt && <small>Última sessão: {new Date(execution.lastSessionAt).toLocaleString('pt-BR')}</small>}
                {execution?.events && execution.events.length > 0 && <details><summary>Histórico da atividade ({execution.events.length} eventos)</summary>{execution.events.map((event) => <small key={event.id}>{event.eventType === 'manual_change' ? 'Alteração manual' : event.eventType} · {new Date(event.occurredAt).toLocaleString('pt-BR')}</small>)}</details>}
                <span className="unscheduled-state">Fora da programação · sessões e eventos preservados</span>
              </article>
            })}
          </div>}
        </section>
      </>}
      <StudyPlanHistory currentPlanId={plan.status === 'ready' ? plan.plan?.plan.id ?? null : plan.status === 'no-plan' ? null : undefined} currentPlanLoadFailed={plan.status === 'load-error'} />
    </div>
  )
}
