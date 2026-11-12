import { ArrowRight, Info, Sparkles, Target } from 'lucide-react'
import { useEffect, useState } from 'react'
import { ApiError, candidateApi, type CandidateBestAction } from '../services/api'

interface NextBestActionProps {
  candidateId: string
}

const actionLabels: Record<CandidateBestAction['type'], string> = {
  study: 'Estudo',
  review: 'Revisão',
  questions: 'Questões',
  mixed: 'Estudo e questões',
  maintenance: 'Manutenção',
}

const priorityLabels: Record<CandidateBestAction['priorityLevel'], string> = {
  maximum: 'Máxima',
  high: 'Alta',
  medium: 'Média',
  low: 'Baixa',
}

type BestActionState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'empty' }
  | { status: 'loaded'; action: CandidateBestAction }

export function NextBestAction({ candidateId }: NextBestActionProps) {
  const [state, setState] = useState<BestActionState>({ status: 'loading' })
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let active = true
    setState({ status: 'loading' })

    candidateApi.getBestAction(candidateId)
      .then((action) => {
        if (active) setState({ status: 'loaded', action })
      })
      .catch((error: unknown) => {
        if (!active) return
        if (error instanceof ApiError && error.status === 404 && error.code === 'NO_ACTION_AVAILABLE') {
          setState({ status: 'empty' })
        } else {
          setState({ status: 'error' })
        }
      })

    return () => { active = false }
  }, [candidateId, reloadKey])

  const retry = () => setReloadKey((key) => key + 1)

  return (
    <section className="panel focus-panel" aria-labelledby="focus-heading">
      <div className="section-heading flex items-center justify-between"><div><span className="section-kicker">RECOMENDAÇÃO DO SISTEMA</span><h2 id="focus-heading">Próxima melhor ação</h2></div><span className="focus-badge"><Sparkles size={14} aria-hidden="true" /> ADAPTATIVA</span></div>
      <div className="focus-visual"><div className="focus-orbit orbit-one" /><div className="focus-orbit orbit-two" /><div className="focus-symbol"><Target size={29} strokeWidth={1.5} aria-hidden="true" /></div><span className="orbit-point point-one" /><span className="orbit-point point-two" /></div>
      {state.status === 'loading' && <div className="focus-copy" role="status" aria-live="polite"><div className="focus-subject">CONSULTANDO SEU DESEMPENHO</div><h3>Carregando recomendação…</h3><p>Aguarde enquanto buscamos sua próxima ação.</p></div>}
      {state.status === 'error' && <div className="focus-copy" role="alert"><div className="focus-subject">RECOMENDAÇÃO INDISPONÍVEL</div><h3>Não foi possível carregar</h3><p>Ocorreu uma falha ao consultar a recomendação. Tente novamente.</p><button className="primary-action" onClick={retry}>Tentar novamente <ArrowRight size={16} aria-hidden="true" /></button></div>}
      {state.status === 'empty' && <div className="focus-copy" role="status"><div className="focus-subject">SEM TÓPICOS PARA PRIORIZAR</div><h3>Nenhuma ação disponível</h3><p>Não há uma recomendação disponível para seu edital neste momento.</p><button className="primary-action" onClick={retry}>Consultar novamente <ArrowRight size={16} aria-hidden="true" /></button></div>}
      {state.status === 'loaded' && <>
        <div className="focus-subject">{state.action.subjectName} <span>•</span> {actionLabels[state.action.type].toUpperCase()}</div>
        <h3>{state.action.topicName}</h3>
        <p>{state.action.explanation}</p>
        <button className="primary-action" onClick={retry}>Atualizar recomendação <ArrowRight size={16} aria-hidden="true" /></button>
        <div className="focus-footnote"><Info className="tiny-info" size={13} aria-hidden="true" /> {actionLabels[state.action.type]} · Prioridade {priorityLabels[state.action.priorityLevel]} ({state.action.priorityScore}) · {state.action.durationMinutes} min</div>
        <div className="focus-footnote"><Info className="tiny-info" size={13} aria-hidden="true" /> Impacto esperado: {state.action.expectedImpact}</div>
      </>}
    </section>
  )
}
