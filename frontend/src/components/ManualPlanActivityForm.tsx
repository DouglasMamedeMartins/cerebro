import { useEffect, useState } from 'react'
import { AlertCircle, LoaderCircle, Plus } from 'lucide-react'
import type { DailyPlanCustomizationOperation } from '../hooks/dailyPlanCustomizationCoordinator'
import type { ManualPlanActivityType } from '../services/api'
import { candidateApi } from '../services/api'

const activityTypes: { value: ManualPlanActivityType; label: string }[] = [
  { value: 'study', label: 'Estudo' },
  { value: 'review', label: 'Revisão' },
  { value: 'questions', label: 'Questões' },
  { value: 'mixed', label: 'Estudo e questões' },
  { value: 'maintenance', label: 'Manutenção' },
]

export function ManualPlanActivityForm({
  candidateId, activeCount, operation, blocked, onAdd,
}: {
  candidateId: string
  activeCount: number
  operation: DailyPlanCustomizationOperation | null
  blocked: boolean
  onAdd: (request: { operation: 'add'; topicId: string; activityType: ManualPlanActivityType; plannedDurationMinutes: number; presentationOrder?: number }) => void
}) {
  const [open, setOpen] = useState(false)
  const [loadingTopics, setLoadingTopics] = useState(false)
  const [topicReloadKey, setTopicReloadKey] = useState(0)
  const [topicError, setTopicError] = useState('')
  const [topics, setTopics] = useState<Awaited<ReturnType<typeof candidateApi.getTopics>>>([])
  const [topicId, setTopicId] = useState('')
  const [activityType, setActivityType] = useState<ManualPlanActivityType>('study')
  const [minutes, setMinutes] = useState('30')
  const [position, setPosition] = useState('')
  const [validationError, setValidationError] = useState('')

  useEffect(() => {
    if (!open || topics.length > 0) return
    let active = true
    setLoadingTopics(true)
    setTopicError('')
    void candidateApi.getTopics(candidateId).then((result) => {
      if (active) setTopics(result)
    }).catch(() => {
      if (active) setTopicError('Não foi possível carregar os tópicos do seu edital.')
    }).finally(() => { if (active) setLoadingTopics(false) })
    return () => { active = false }
  }, [candidateId, open, topicReloadKey, topics.length])

  function submit() {
    const plannedDurationMinutes = Number(minutes)
    const presentationOrder = position === '' ? undefined : Number(position)
    if (!topicId) { setValidationError('Selecione um tópico do seu edital.'); return }
    if (!Number.isInteger(plannedDurationMinutes) || plannedDurationMinutes < 1 || plannedDurationMinutes > 2_147_483_647) {
      setValidationError('Informe minutos inteiros entre 1 e 2.147.483.647.'); return
    }
    if (presentationOrder !== undefined && (!Number.isInteger(presentationOrder) || presentationOrder < 1 || presentationOrder > 1000 || presentationOrder > activeCount + 1)) {
      setValidationError(`A posição deve estar entre 1 e ${Math.min(1000, activeCount + 1)}.`); return
    }
    setValidationError('')
    onAdd({ operation: 'add', topicId, activityType, plannedDurationMinutes, ...(presentationOrder === undefined ? {} : { presentationOrder }) })
  }

  return <section className="panel manual-activity-panel" aria-labelledby="manual-activity-title">
    <div className="page-panel-heading"><div><span className="section-kicker">PERSONALIZAÇÃO</span><h2 id="manual-activity-title">Adicionar atividade</h2></div>
      <button type="button" className="text-action" aria-expanded={open} onClick={() => setOpen((value) => !value)}><Plus size={15} aria-hidden="true" />{open ? 'Fechar formulário' : 'Nova atividade'}</button>
    </div>
    {open && <div className="manual-activity-form">
      {loadingTopics && <p role="status"><LoaderCircle size={15} className="plan-spinner" />Carregando tópicos do seu edital...</p>}
      {topicError && <p role="alert" className="execution-error"><AlertCircle size={15} />{topicError}<button type="button" onClick={() => { setTopics([]); setTopicReloadKey((key) => key + 1) }}>Tentar novamente</button></p>}
      {!loadingTopics && !topicError && topics.length === 0 && <p role="status">Não há tópicos disponíveis no edital vinculado à sua conta.</p>}
      {!loadingTopics && topics.length > 0 && <>
        <label htmlFor="manual-plan-topic">Tópico do edital</label>
        <select id="manual-plan-topic" value={topicId} onChange={(event) => setTopicId(event.currentTarget.value)}>
          <option value="">Selecione um tópico</option>
          {topics.map((topic) => <option key={topic.topicId} value={topic.topicId}>{topic.subjectName} · {topic.topicName}</option>)}
        </select>
        <div className="manual-activity-fields">
          <div><label htmlFor="manual-plan-type">Tipo de atividade</label><select id="manual-plan-type" value={activityType} onChange={(event) => setActivityType(event.currentTarget.value as ManualPlanActivityType)}>{activityTypes.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}</select></div>
          <div><label htmlFor="manual-plan-minutes">Duração planejada (min)</label><input id="manual-plan-minutes" type="number" min={1} max={2_147_483_647} step={1} inputMode="numeric" value={minutes} onChange={(event) => setMinutes(event.currentTarget.value)} /></div>
          <div><label htmlFor="manual-plan-position">Posição (opcional)</label><input id="manual-plan-position" type="number" min={1} max={Math.min(1000, activeCount + 1)} step={1} inputMode="numeric" placeholder="Final do plano" value={position} onChange={(event) => setPosition(event.currentTarget.value)} /></div>
        </div>
        {validationError && <small className="execution-error" role="alert">{validationError}</small>}
        <button type="button" className="session-confirm-button" disabled={blocked} onClick={submit}>Adicionar ao plano</button>
      </>}
    </div>}
    {operation?.request.operation === 'add' && operation.status === 'success' && <p className="execution-success" role="status">Atividade adicionada à programação.</p>}
  </section>
}
