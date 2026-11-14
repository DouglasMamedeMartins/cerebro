import { AlertCircle, ArrowDown, ArrowUp, Ban, CalendarMinus, Check, Clock3, LoaderCircle, Minus, Pencil, Plus, Replace } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { DailyPlanActivity, DailyStudyPlanViewModel } from '../hooks/useDailyStudyPlan'
import type { SessionRegistrationOperation } from '../hooks/studySessionRegistrationCoordinator'
import type { DailyPlanCustomizationRequest } from '../hooks/dailyPlanCustomizationCoordinator'
import { candidateApi, type CandidateTopicSummary, type DailyPlanDecision } from '../services/api'

const actionLabels: Record<DailyPlanActivity['activityType'], string> = {
  study: 'Estudo',
  review: 'Revisão',
  questions: 'Questões',
  mixed: 'Estudo e questões',
  maintenance: 'Manutenção',
}

const priorityLabels: Record<DailyPlanActivity['priorityLevel'], string> = {
  maximum: 'Máxima',
  high: 'Alta',
  medium: 'Média',
  low: 'Baixa',
}

interface StudyPlanAvailabilityProps {
  value: number
  onChange: (minutes: number) => void
}

export function StudyPlanAvailability({ value, onChange }: StudyPlanAvailabilityProps) {
  return (
    <div className="plan-availability">
      <div className="plan-availability-heading">
        <label htmlFor="plan-available-minutes">Tempo disponível hoje</label>
        <span className="plan-availability-value" aria-live="polite">
          <strong>{value}</strong><span>min</span>
        </span>
      </div>
      <div className="plan-time-options" role="group" aria-label="Opções rápidas de tempo disponível">
        {[30, 60, 90, 120, 150, 180].map((minutes) => (
          <button
            className={`plan-time-option ${value === minutes ? 'plan-time-option-active' : ''}`}
            type="button"
            key={minutes}
            aria-pressed={value === minutes}
            onClick={() => onChange(minutes)}
          >
            {minutes}<span>min</span>
          </button>
        ))}
      </div>
      <div className="plan-custom-time">
        <label className="plan-custom-label" htmlFor="plan-available-minutes">Personalizar</label>
        <div className="plan-availability-input">
          <button type="button" className="plan-time-stepper" aria-label="Diminuir 5 minutos" onClick={() => onChange(Math.max(1, value - 5))}>
            <Minus size={16} aria-hidden="true" />
          </button>
        <input
          id="plan-available-minutes"
          type="number"
          min={1}
          max={720}
          step={1}
          value={value}
          onChange={(event) => onChange(Number(event.currentTarget.value))}
          aria-label="Tempo disponível hoje em minutos"
        />
          <span className="plan-input-unit">min</span>
          <button type="button" className="plan-time-stepper" aria-label="Aumentar 5 minutos" onClick={() => onChange(value + 5)}>
            <Plus size={16} aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  )
}

export function StudyPlanGenerationControls({ plan }: { plan: DailyStudyPlanViewModel }) {
  if (plan.status === 'idle' || plan.status === 'loading' || plan.status === 'load-error') return null

  const canStartNew = !plan.generationPending && !plan.planMutationBlocked && (plan.plan === null || plan.availabilityChanged)
  const canRetrySame = plan.generationPending && !plan.planMutationBlocked && plan.generationStatus === 'error' && plan.generationRetryable
  const mustCloseOperation = plan.generationPending && (plan.generationStatus === 'conflict' || plan.generationStatus === 'failed')

  return (
    <div className="plan-generation-controls">
      {plan.availabilityChanged && <p className="plan-availability-changed" role="status">O snapshot salvo foi gerado com {plan.plan?.plan.availableMinutes} min. Gere uma nova versão para usar a disponibilidade atual de {plan.availableMinutes} min.</p>}
      {plan.generationPending && <p className="plan-pending-operation" role="status">Operação pendente para {plan.pendingAvailableMinutes} min. Alterar o seletor não muda os dados usados nesta tentativa.</p>}
      {plan.generationStatus === 'generating' && <p className="plan-message" role="status"><LoaderCircle size={16} className="plan-spinner" />Enviando o plano...</p>}
      {['error', 'conflict', 'failed'].includes(plan.generationStatus) && <p className="plan-message plan-message-error" role="alert"><AlertCircle size={16} />{plan.generationErrorMessage}</p>}
      {plan.generationStatus === 'no-action' && <p className="plan-message" role="status">O motor adaptativo não encontrou uma recomendação agora. Nenhum plano novo foi salvo.</p>}
      {canStartNew && <button className="plan-generate-button" type="button" onClick={plan.generate}>{plan.plan ? 'Gerar nova versão' : 'Gerar plano de hoje'}</button>}
      {canRetrySame && <button className="plan-generate-button" type="button" onClick={plan.generate}>Repetir mesma operação</button>}
      {mustCloseOperation && <button className="text-action" type="button" onClick={plan.closeGeneration}>Encerrar operação pendente</button>}
    </div>
  )
}

interface StudyPlanRecommendationsProps {
  activities: DailyPlanActivity[]
  compact?: boolean
  candidateId: string
  decisions: Pick<DailyStudyPlanViewModel, 'decisionOperations' | 'decide' | 'retryDecision' | 'closeDecision'>
  customization?: Pick<DailyStudyPlanViewModel, 'customizationOperation' | 'customize'>
  editable?: boolean
  externalMutationBlocked?: boolean
  registration: {
    operations: ReadonlyMap<string, SessionRegistrationOperation>
    start: (itemId: string, topicId: string, durationMinutes: number) => boolean
    retry: (itemId: string) => boolean
    close: (itemId: string) => boolean
  }
}

const executionLabels = { not_started: 'Não iniciado', in_progress: 'Em andamento', completed: 'Concluído', ignored: 'Ignorado', replaced: 'Substituído' }

function ActivityExecution({ activity, candidateId, decisions, actionsBlocked = false }: { activity: DailyPlanActivity; candidateId: string; decisions: StudyPlanRecommendationsProps['decisions']; actionsBlocked?: boolean }) {
  const [replaceOpen, setReplaceOpen] = useState(false)
  const [topics, setTopics] = useState<CandidateTopicSummary[]>([])
  const [topicId, setTopicId] = useState('')
  const [topicsError, setTopicsError] = useState('')
  const execution = activity.execution ?? { executedMinutes: 0, sessionCount: 0, recommendedTimePercent: 0, status: 'not_started' as const, lastSessionAt: null, events: [] }
  const operation = decisions.decisionOperations.get(activity.id)
  const terminal = ['completed', 'ignored', 'replaced'].includes(execution.status)
  useEffect(() => {
    if (!replaceOpen) return
    let active = true
    void candidateApi.getTopics(candidateId).then((result) => { if (active) { setTopics(result); setTopicsError('') } }).catch(() => { if (active) setTopicsError('Não foi possível carregar os tópicos do seu edital.') })
    return () => { active = false }
  }, [candidateId, replaceOpen])
  function confirm(decision: DailyPlanDecision) {
    const message = decision === 'completed' ? 'Confirmar que esta atividade foi concluída?' : decision === 'ignored' ? 'Registrar que você decidiu não executar esta atividade? As sessões anteriores serão preservadas.' : 'Substituir esta recomendação pelo tópico selecionado? Nenhuma sessão será criada.'
    if (window.confirm(message)) { decisions.decide(activity.id, decision, decision === 'replaced' ? topicId : undefined); setReplaceOpen(false) }
  }
  return <section className={`activity-execution execution-${execution.status}`} aria-label={`Execução de ${activity.topicName}`}>
    <div className="activity-execution-heading"><strong>Acompanhamento</strong><span className={`execution-state state-${execution.status}`}>{executionLabels[execution.status]}</span></div>
    <div className="execution-metrics"><span>Recomendado <strong>{activity.recommendedDurationMinutes} min</strong></span><span>Executado <strong>{execution.executedMinutes} min</strong></span><span>Sessões <strong>{execution.sessionCount}</strong></span><span>Tempo recomendado <strong>{execution.recommendedTimePercent}%</strong></span></div>
    <progress className="execution-progress" max={100} value={Math.min(100, execution.recommendedTimePercent)} aria-label={`${execution.recommendedTimePercent}% do tempo recomendado executado`} />
    {execution.lastSessionAt && <small>Última sessão: {new Date(execution.lastSessionAt).toLocaleString('pt-BR')}</small>}
    {execution.events.filter((event) => event.eventType === 'replaced').map((event) => { const data = event.data ?? {}; const name = typeof data.replacementTopicName === 'string' ? data.replacementTopicName : typeof data.topicName === 'string' ? data.topicName : 'atividade alternativa'; return <small key={event.id}>Recomendação substituída por: {name} · {new Date(event.occurredAt).toLocaleString('pt-BR')}</small> })}
    {!terminal && <div className="execution-actions"><button type="button" disabled={actionsBlocked || operation?.status === 'sending'} onClick={() => confirm('completed')}><Check size={14} /> Concluir</button><button type="button" disabled={actionsBlocked || operation?.status === 'sending'} onClick={() => confirm('ignored')}><Ban size={14} /> Ignorar</button><button type="button" disabled={actionsBlocked || operation?.status === 'sending'} onClick={() => setReplaceOpen((open) => !open)}><Replace size={14} /> Substituir</button></div>}
    {replaceOpen && !terminal && <div className="execution-replace-form"><label htmlFor={`replacement-${activity.id}`}>Tópico substituto do seu edital</label><select id={`replacement-${activity.id}`} value={topicId} onChange={(event) => setTopicId(event.currentTarget.value)}><option value="">Selecione um tópico</option>{topics.filter((topic) => topic.topicId !== activity.topicId).map((topic) => <option key={topic.topicId} value={topic.topicId}>{topic.subjectName} · {topic.topicName}</option>)}</select>{topicsError && <small role="alert">{topicsError}</small>}<button type="button" disabled={!topicId || actionsBlocked} onClick={() => confirm('replaced')}>Confirmar substituição</button></div>}
    {operation?.status === 'sending' && <p role="status"><LoaderCircle size={14} className="plan-spinner" />Registrando decisão…</p>}{operation?.status === 'success' && <p className="execution-success" role="status">Decisão registrada e plano atualizado.</p>}
    {operation?.status === 'retryable' && <p className="execution-error" role="alert">Falha temporária. Tentativa preservada. <button type="button" onClick={() => decisions.retryDecision(activity.id)}>Tentar novamente</button></p>}{operation?.status === 'conflict' && <p className="execution-error" role="alert">O estado mudou no servidor (HTTP 409). <button type="button" onClick={() => decisions.closeDecision(activity.id)}>Entendi</button></p>}{operation?.status === 'failed' && <p className="execution-error" role="alert">Não foi possível registrar a decisão. <button type="button" onClick={() => decisions.closeDecision(activity.id)}>Fechar</button></p>}
    {execution.events.length > 0 && <details className="execution-events"><summary>Eventos ({execution.events.length})</summary>{execution.events.map((event) => <small key={event.id}>{event.eventType} · {new Date(event.occurredAt).toLocaleString('pt-BR')}</small>)}</details>}
  </section>
}

function SessionRegistration({ activity, registration }: { activity: DailyPlanActivity; registration: StudyPlanRecommendationsProps['registration'] }) {
  const [formOpen, setFormOpen] = useState(false)
  const [minutes, setMinutes] = useState(String(activity.recommendedDurationMinutes))
  const [validationError, setValidationError] = useState('')
  const operation = registration.operations.get(activity.id)
  const operationPending = operation?.status === 'sending' || operation?.status === 'retryable'
  const locked = operation !== undefined && operation.status !== 'success'

  function submit() {
    const parsed = Number(minutes)
    if (!Number.isInteger(parsed) || parsed <= 0) {
      setValidationError('Informe uma quantidade inteira de minutos maior que zero.')
      return
    }
    setValidationError('')
    setFormOpen(true)
    registration.start(activity.id, activity.topicId, parsed)
  }

  return (
    <div className="session-registration">
      {!operation && !formOpen && <button type="button" className="session-register-button" onClick={() => setFormOpen(true)}>Registrar estudo</button>}
      {formOpen && !operation && <div className="session-registration-form">
        <label htmlFor={`session-minutes-${activity.id}`}>Minutos estudados</label>
        <div className="session-registration-input-row">
          <input id={`session-minutes-${activity.id}`} type="number" min={1} step={1} inputMode="numeric" value={minutes} onChange={(event) => setMinutes(event.currentTarget.value)} />
          <span>min</span>
          <button type="button" className="session-confirm-button" onClick={submit}>Confirmar</button>
          <button type="button" className="session-cancel-button" onClick={() => { setFormOpen(false); setValidationError('') }}>Cancelar</button>
        </div>
        {validationError && <small className="session-registration-error" role="alert">{validationError}</small>}
      </div>}
      {operation?.status === 'sending' && <p className="session-registration-message" role="status"><LoaderCircle size={14} className="plan-spinner" />Registrando sessão de {operation.payload.durationMinutes} min...</p>}
      {operation?.status === 'success' && <div className="session-registration-success" role="status"><span>Sessão de {operation.result?.durationMinutes} min registrada.</span><button type="button" className="text-action" onClick={() => { registration.close(activity.id); setMinutes(String(activity.recommendedDurationMinutes)); setFormOpen(true) }}>Registrar outra sessão</button></div>}
      {operation?.status === 'retryable' && <div className="session-registration-message session-registration-error" role="alert"><span>Não foi possível confirmar a sessão de {operation.payload.durationMinutes} min. A tentativa está preservada.</span><button type="button" className="session-register-button" onClick={() => registration.retry(activity.id)} disabled={operationPending}>Tentar novamente</button></div>}
      {operation?.status === 'conflict' && <div className="session-registration-message session-registration-error" role="alert"><span>A chave desta tentativa já está associada a outros dados. Encerre esta operação antes de iniciar outra.</span><button type="button" className="text-action" onClick={() => registration.close(activity.id)}>Encerrar tentativa</button></div>}
      {operation?.status === 'failed' && <div className="session-registration-message session-registration-error" role="alert"><span>A API rejeitou o registro{operation.error instanceof Error ? `: ${operation.error.message}` : '.'}</span><button type="button" className="text-action" onClick={() => registration.close(activity.id)}>Encerrar tentativa</button></div>}
      {locked && <small className="session-registration-locked">Tentativa original: {operation.payload.durationMinutes} min. Os dados não podem ser alterados durante a repetição.</small>}
    </div>
  )
}

export function StudyPlanRecommendations({ activities, compact = false, registration, candidateId, decisions, customization, editable = false, externalMutationBlocked = false }: StudyPlanRecommendationsProps) {
  const movable = activities.filter((activity) => !['completed', 'ignored', 'replaced'].includes(activity.execution?.status ?? ''))
  const customizationBlocked = customization?.customizationOperation !== null && customization?.customizationOperation !== undefined && customization.customizationOperation.status !== 'success'
  const decisionBlocked = [...decisions.decisionOperations.values()].some((operation) => operation.status !== 'success')
  const mutationBlocked = customizationBlocked || decisionBlocked || externalMutationBlocked
  const moveItem = (itemId: string, direction: -1 | 1) => {
    if (!customization) return
    const current = movable.findIndex((activity) => activity.id === itemId)
    const target = current + direction
    if (current < 0 || target < 0 || target >= movable.length) return
    const next = [...movable]
    ;[next[current], next[target]] = [next[target]!, next[current]!]
    const request: DailyPlanCustomizationRequest = { operation: 'reorder', itemIds: next.map((activity) => activity.id) }
    customization.customize(request)
  }
  if (compact) {
    return (
      <div className="activity-list">
        {activities.map((activity) => (
          <article className="activity-item" key={activity.id}>
            <div className={`activity-number ${activity.isBestAction ? 'activity-blue' : 'activity-violet'}`} aria-label={`Ordem ${activity.presentationOrder}`}>{String(activity.presentationOrder).padStart(2, '0')}</div>
            <div className="activity-details">
              <strong>{activity.subjectName}</strong>
              <span>{activity.topicName}</span>
              <span>{actionLabels[activity.activityType]} · Prioridade {priorityLabels[activity.priorityLevel]} · Pontuação {activity.priorityScore}</span>
              {activity.rankingPosition !== null && <small>Posição original no ranking: {activity.rankingPosition}</small>}
              {activity.reason.length > 0 && <small>Motivos registrados: {activity.reason.join(', ')}</small>}
              <p className="daily-plan-explanation">{activity.explanation}</p>
              <p className="daily-plan-impact">Impacto esperado: {activity.expectedImpact}</p>
              <ActivityExecution activity={activity} candidateId={candidateId} decisions={decisions} actionsBlocked={mutationBlocked} />
              {editable && customization && <ActivityCustomization activity={activity} activities={activities} customization={customization} blocked={mutationBlocked} onMove={moveItem} />}
              <SessionRegistration activity={activity} registration={registration} />
            </div>
            <div className="activity-meta">
              <span><Clock3 size={13} aria-hidden="true" /> Planejado {activity.personalization?.plannedDurationMinutes ?? activity.recommendedDurationMinutes} min</span>
              {activity.recommendationSource === 'manual' && <small className="manual-activity-badge">Adicionada manualmente</small>}
              <small className={activity.isBestAction ? 'state-next' : ''}>{activity.isBestAction ? 'Melhor ação' : `Prioridade ${priorityLabels[activity.priorityLevel]}`}</small>
            </div>
          </article>
        ))}
      </div>
    )
  }

  return (
    <div className="plan-activity-list">
      {activities.map((activity) => (
        <article className="plan-activity-row daily-plan-row" key={activity.id}>
          <div className="plan-activity-index" aria-label={`Ordem ${activity.presentationOrder}`}>{String(activity.presentationOrder).padStart(2, '0')}</div>
          <div className="plan-activity-content">
            <span>{activity.subjectName} · {actionLabels[activity.activityType]} · Prioridade {priorityLabels[activity.priorityLevel]} · Pontuação {activity.priorityScore}</span>
            <strong>{activity.topicName}</strong>
            <p className="daily-plan-explanation">{activity.explanation}</p>
            <p className="daily-plan-impact">Impacto esperado: {activity.expectedImpact}</p>
            {activity.rankingPosition !== null && <small>Posição original no ranking: {activity.rankingPosition}</small>}
            {activity.reason.length > 0 && <small>Motivos registrados: {activity.reason.join(', ')}</small>}
            <ActivityExecution activity={activity} candidateId={candidateId} decisions={decisions} actionsBlocked={mutationBlocked} />
            {editable && customization && <ActivityCustomization activity={activity} activities={activities} customization={customization} blocked={mutationBlocked} onMove={moveItem} />}
            <SessionRegistration activity={activity} registration={registration} />
          </div>
          <div className="plan-row-duration"><Clock3 size={14} aria-hidden="true" /> Planejado {activity.personalization?.plannedDurationMinutes ?? activity.recommendedDurationMinutes} min <small>(recomendado {activity.recommendedDurationMinutes} min)</small></div>
          {activity.recommendationSource === 'manual' && <span className="manual-activity-badge">Adicionada manualmente</span>}
          <span className={`plan-status ${activity.isBestAction ? 'plan-status-active' : 'plan-status-pending'}`}>
            {activity.isBestAction ? 'Melhor ação' : `Prioridade ${priorityLabels[activity.priorityLevel]}`}
          </span>
        </article>
      ))}
    </div>
  )
}

function ActivityCustomization({
  activity, activities, customization, blocked, onMove,
}: {
  activity: DailyPlanActivity
  activities: DailyPlanActivity[]
  customization: NonNullable<StudyPlanRecommendationsProps['customization']>
  blocked: boolean
  onMove: (itemId: string, direction: -1 | 1) => void
}) {
  const [editingDuration, setEditingDuration] = useState(false)
  const [duration, setDuration] = useState(String(activity.personalization?.plannedDurationMinutes ?? activity.recommendedDurationMinutes))
  const [durationError, setDurationError] = useState('')
  const scheduled = activity.personalization?.isScheduled !== false
  const terminal = ['completed', 'ignored', 'replaced'].includes(activity.execution?.status ?? '')
  const movable = activities.filter((item) => !['completed', 'ignored', 'replaced'].includes(item.execution?.status ?? ''))
  const position = movable.findIndex((item) => item.id === activity.id)
  const plannedMinutes = activity.personalization?.plannedDurationMinutes ?? activity.recommendedDurationMinutes

  function saveDuration() {
    const value = Number(duration)
    if (!Number.isInteger(value) || value <= 0 || value > 2_147_483_647) {
      setDurationError('Informe minutos inteiros entre 1 e 2.147.483.647.')
      return
    }
    setDurationError('')
    customization.customize({ operation: 'duration', itemId: activity.id, plannedDurationMinutes: value })
    setEditingDuration(false)
  }

  if (!scheduled) return null
  return <div className="plan-customization-controls" aria-label={`Personalizar ${activity.topicName}`}>
    <div className="plan-reorder-controls">
      <button type="button" aria-label={`Mover ${activity.topicName} para cima`} title="Mover para cima" disabled={blocked || terminal || position <= 0} onClick={() => onMove(activity.id, -1)}><ArrowUp size={15} aria-hidden="true" /></button>
      <button type="button" aria-label={`Mover ${activity.topicName} para baixo`} title="Mover para baixo" disabled={blocked || terminal || position < 0 || position >= movable.length - 1} onClick={() => onMove(activity.id, 1)}><ArrowDown size={15} aria-hidden="true" /></button>
    </div>
    {!editingDuration ? <button className="text-action" type="button" disabled={blocked || terminal} onClick={() => { setDuration(String(plannedMinutes)); setEditingDuration(true) }}><Pencil size={14} aria-hidden="true" /> Ajustar duração planejada</button> : <div className="plan-duration-editor">
      <label htmlFor={`planned-duration-${activity.id}`}>Minutos planejados</label>
      <input id={`planned-duration-${activity.id}`} type="number" min={1} max={2_147_483_647} step={1} inputMode="numeric" value={duration} onChange={(event) => setDuration(event.currentTarget.value)} />
      <button type="button" disabled={blocked} onClick={saveDuration}>Salvar duração</button>
      <button className="text-action" type="button" onClick={() => { setEditingDuration(false); setDurationError('') }}>Cancelar</button>
      {durationError && <small role="alert">{durationError}</small>}
    </div>}
    <button className="text-action unschedule-action" type="button" disabled={blocked || terminal} onClick={() => {
      if (window.confirm(`Retirar “${activity.topicName}” da programação? O histórico e as sessões serão preservados.`)) {
        customization.customize({ operation: 'unschedule', itemId: activity.id })
      }
    }}><CalendarMinus size={14} aria-hidden="true" /> Retirar da programação</button>
    {terminal && <small>Atividade com decisão terminal; personalização bloqueada.</small>}
  </div>
}

export function formatPlanDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60)
  const remainingMinutes = minutes % 60
  if (hours === 0) return `${remainingMinutes} min`
  if (remainingMinutes === 0) return `${hours}h`
  return `${hours}h ${remainingMinutes}min`
}
