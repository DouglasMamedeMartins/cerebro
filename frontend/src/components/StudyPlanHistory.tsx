import { useEffect, useRef, useState } from 'react'
import { AlertCircle, Archive, ChevronLeft, ChevronRight, Clock3, Eye, LoaderCircle } from 'lucide-react'
import { ApiError, studyPlanApi, type DailyStudyPlanListItem, type DailyStudyPlanListResponse, type DailyStudyPlanSnapshot } from '../services/api'

const PAGE_SIZE = 5

function formatPlanDate(value: string): string {
  return new Date(`${value}T00:00:00`).toLocaleDateString('pt-BR')
}

function formatStatus(status: string): string {
  const labels: Record<string, string> = {
    not_started: 'Não iniciado',
    in_progress: 'Em andamento',
    completed: 'Concluído',
    ignored: 'Ignorado',
    replaced: 'Substituído',
  }
  return labels[status] ?? status
}

function PlanListCard({ plan, selected, onSelect }: { plan: DailyStudyPlanListItem; selected: boolean; onSelect: () => void }) {
  return (
    <article className={`plan-history-card${selected ? ' plan-history-card-selected' : ''}`}>
      <div className="plan-history-card-copy">
        <strong>{formatPlanDate(plan.planDate)} · versão {plan.version}</strong>
        <span>Gerado em {new Date(plan.generatedAt).toLocaleString('pt-BR')}</span>
        <dl>
          <div><dt>Disponibilidade</dt><dd>{plan.availableMinutes} min</dd></div>
          <div><dt>Atividades</dt><dd>{plan.itemCount}</dd></div>
        </dl>
      </div>
      <button type="button" className="plan-history-open" onClick={onSelect} aria-label={`Consultar plano de ${formatPlanDate(plan.planDate)}, versão ${plan.version}`} aria-current={selected ? 'true' : undefined}>
        <Eye size={16} aria-hidden="true" /> Consultar
      </button>
    </article>
  )
}

function HistoricalPlanDetails({ plan }: { plan: DailyStudyPlanSnapshot }) {
  const orderedItems = [...plan.items].sort((left, right) =>
    (left.personalization?.presentationOrder ?? left.presentationOrder) - (right.personalization?.presentationOrder ?? right.presentationOrder))
  const scheduled = orderedItems.filter((item) => item.personalization?.isScheduled !== false)
  const unscheduled = orderedItems.filter((item) => item.personalization?.isScheduled === false)
  const itemCard = (item: DailyStudyPlanSnapshot['items'][number], isScheduled: boolean) => {
    const execution = item.execution
    return (
      <article className="plan-history-activity" key={item.id}>
        <div className="plan-history-activity-heading">
          <div>
            <strong>{item.topicName}</strong>
            <span>{item.subjectName} · {item.activityType}</span>
          </div>
          <span className={`plan-history-state${isScheduled ? '' : ' plan-history-state-unscheduled'}`}>
            {isScheduled ? formatStatus(execution?.status ?? 'not_started') : 'Fora da programação'}
          </span>
        </div>
        {item.recommendationSource === 'manual' && <span className="manual-activity-badge">Adicionada manualmente</span>}
        <dl>
          <div><dt>Recomendado</dt><dd>{item.recommendedDurationMinutes} min</dd></div>
          <div><dt>Planejado</dt><dd>{item.personalization?.plannedDurationMinutes ?? item.recommendedDurationMinutes} min</dd></div>
          <div><dt>Executado</dt><dd>{execution?.executedMinutes ?? 0} min</dd></div>
          <div><dt>Sessões</dt><dd>{execution?.sessionCount ?? 0}</dd></div>
        </dl>
        {execution?.lastSessionAt && <small>Última sessão: {new Date(execution.lastSessionAt).toLocaleString('pt-BR')}</small>}
        {execution?.events.length ? <details>
          <summary>Eventos da atividade ({execution.events.length})</summary>
          <ul>{execution.events.map((event) => <li key={event.id}>{event.eventType === 'manual_change' ? 'Alteração manual' : formatStatus(event.eventType)} · {new Date(event.occurredAt).toLocaleString('pt-BR')}</li>)}</ul>
        </details> : null}
      </article>
    )
  }

  return (
    <div className="historical-plan-details">
      <header className="historical-plan-heading">
        <div><span className="section-kicker">CONSULTA SOMENTE LEITURA</span><h3>{formatPlanDate(plan.plan.planDate)} · versão {plan.plan.version}</h3></div>
        <span className="historical-plan-badge"><Archive size={14} aria-hidden="true" /> Plano anterior</span>
      </header>
      <p className="historical-plan-meta"><Clock3 size={14} aria-hidden="true" /> {plan.plan.availableMinutes} minutos disponíveis · gerado em {new Date(plan.plan.generatedAt).toLocaleString('pt-BR')}</p>
      <section aria-labelledby="historical-scheduled-title">
        <h4 id="historical-scheduled-title">Atividades do plano</h4>
        {scheduled.length ? <div className="plan-history-activities">{scheduled.map((item) => itemCard(item, true))}</div> : <p className="plan-history-empty">Esta versão não tem atividades na programação.</p>}
      </section>
      <section aria-labelledby="historical-unscheduled-title">
        <h4 id="historical-unscheduled-title">Fora da programação</h4>
        {unscheduled.length ? <div className="plan-history-activities">{unscheduled.map((item) => itemCard(item, false))}</div> : <p className="plan-history-empty">Nenhuma atividade foi retirada nesta versão.</p>}
      </section>
    </div>
  )
}

export function StudyPlanHistory({ currentPlanId, currentPlanLoadFailed = false }: { currentPlanId: string | null | undefined; currentPlanLoadFailed?: boolean }) {
  const [page, setPage] = useState(1)
  const [list, setList] = useState<DailyStudyPlanListResponse | null>(null)
  const [listLoading, setListLoading] = useState(true)
  const [listError, setListError] = useState('')
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null)
  const [selectedPlan, setSelectedPlan] = useState<DailyStudyPlanSnapshot | null>(null)
  const [detailsLoading, setDetailsLoading] = useState(false)
  const [detailsError, setDetailsError] = useState('')
  const [listRetryKey, setListRetryKey] = useState(0)
  const detailsRequest = useRef(0)

  useEffect(() => {
    let active = true
    setListLoading(true)
    setListError('')
    void studyPlanApi.list({ page, limit: PAGE_SIZE }).then((result) => {
      if (active) setList(result)
    }).catch((error: unknown) => {
      if (!active) return
      setListError(error instanceof ApiError && error.status === 401
        ? 'Sua sessão expirou. Entre novamente para consultar o histórico.'
        : error instanceof ApiError && error.status === 403
          ? 'Sua conta não tem autorização para consultar este histórico.'
          : 'Não foi possível carregar o histórico de planos. Verifique a conexão e tente novamente.')
    }).finally(() => { if (active) setListLoading(false) })
    return () => { active = false }
  }, [listRetryKey, page])

  useEffect(() => {
    if (currentPlanId !== undefined && selectedPlanId === currentPlanId) {
      detailsRequest.current += 1
      setSelectedPlanId(null)
      setSelectedPlan(null)
      setDetailsError('')
      setDetailsLoading(false)
    }
  }, [currentPlanId, selectedPlanId])

  async function selectPlan(planId: string) {
    const requestId = ++detailsRequest.current
    setSelectedPlanId(planId)
    setSelectedPlan(null)
    setDetailsLoading(true)
    setDetailsError('')
    try {
      const details = await studyPlanApi.getDetails(planId)
      if (requestId !== detailsRequest.current) return
      setSelectedPlan(details)
    } catch (error: unknown) {
      if (requestId !== detailsRequest.current) return
      setDetailsError(error instanceof ApiError && error.status === 404
        ? 'Este plano não está disponível para sua conta.'
        : error instanceof ApiError && error.status === 401
          ? 'Sua sessão expirou. Entre novamente para consultar este plano.'
          : error instanceof ApiError && error.status === 403
            ? 'Sua conta não tem autorização para consultar este plano.'
            : 'Não foi possível carregar os detalhes. Verifique a conexão e tente novamente.')
    } finally {
      if (requestId === detailsRequest.current) setDetailsLoading(false)
    }
  }

  const historicalPlans = currentPlanId === undefined ? [] : list?.plans.filter((plan) => plan.id !== currentPlanId) ?? []
  const pagination = list?.pagination

  return (
    <section className="panel plan-list-panel plan-history-panel" aria-labelledby="plan-history-title">
      <div className="page-panel-heading"><div><span className="section-kicker">VERSÕES PERSISTIDAS</span><h2 id="plan-history-title">Histórico de planos</h2></div><Archive size={18} aria-hidden="true" /></div>
      <p className="plan-history-intro">Consulte versões anteriores salvas. A visualização é somente leitura e não altera o plano atual.</p>

      {listLoading && <p className="plan-history-message" role="status"><LoaderCircle size={16} className="plan-spinner" /> Carregando histórico...</p>}
      {!listLoading && !listError && currentPlanId === undefined && <p className="plan-history-message" role={currentPlanLoadFailed ? 'alert' : 'status'}>{currentPlanLoadFailed ? 'Não foi possível identificar o plano atual para separar esta versão do histórico. Atualize o plano acima e tente novamente.' : 'Carregando o plano atual para separar as versões anteriores...'}</p>}
      {!listLoading && listError && <div className="plan-history-message plan-history-error" role="alert"><AlertCircle size={17} aria-hidden="true" /><span>{listError}</span><button type="button" className="text-action" onClick={() => setListRetryKey((value) => value + 1)}>Tentar novamente</button></div>}
      {!listLoading && !listError && currentPlanId !== undefined && historicalPlans.length === 0 && <p className="plan-history-empty" role="status">{pagination && pagination.total > 1 ? 'Não há versões anteriores nesta página.' : 'Ainda não há versões anteriores do plano.'}</p>}
      {!listLoading && !listError && historicalPlans.length > 0 && <div className="plan-history-list">
        {historicalPlans.map((historicalPlan) => <PlanListCard key={historicalPlan.id} plan={historicalPlan} selected={selectedPlanId === historicalPlan.id} onSelect={() => void selectPlan(historicalPlan.id)} />)}
      </div>}

      {pagination && pagination.totalPages > 1 && <nav className="plan-history-pagination" aria-label="Paginação do histórico de planos">
        <button type="button" onClick={() => setPage((value) => Math.max(1, value - 1))} disabled={page <= 1 || listLoading} aria-label="Página anterior"><ChevronLeft size={17} aria-hidden="true" /> Anterior</button>
        <span>Página {pagination.page} de {pagination.totalPages} · {pagination.total} versões encontradas</span>
        <button type="button" onClick={() => setPage((value) => Math.min(pagination.totalPages, value + 1))} disabled={page >= pagination.totalPages || listLoading} aria-label="Próxima página">Próxima <ChevronRight size={17} aria-hidden="true" /></button>
      </nav>}

      {selectedPlanId && <section className="historical-plan-view" aria-live="polite">
        <div className="historical-plan-return-row"><span>Versão selecionada · somente leitura</span><button type="button" className="text-action" onClick={() => { detailsRequest.current += 1; setSelectedPlanId(null); setSelectedPlan(null); document.getElementById('current-plan-title')?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }}>Voltar ao plano atual</button></div>
        {detailsLoading && <p className="plan-history-message" role="status"><LoaderCircle size={16} className="plan-spinner" /> Carregando esta versão...</p>}
        {!detailsLoading && detailsError && <p className="plan-history-message plan-history-error" role="alert"><AlertCircle size={17} aria-hidden="true" /> {detailsError}</p>}
        {!detailsLoading && selectedPlan && <HistoricalPlanDetails plan={selectedPlan} />}
      </section>}
    </section>
  )
}
