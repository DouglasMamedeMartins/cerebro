import { ArrowRight } from 'lucide-react'
import { useEffect, useState } from 'react'
import { candidateApi, type CandidatePriorityTopic } from '../services/api'

interface PriorityReviewsProps {
  candidateId: string
  onViewReviews: () => void
}

type PriorityTopicsState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'loaded'; topics: CandidatePriorityTopic[] }

const priorityPresentation: Record<CandidatePriorityTopic['priorityLevel'], { label: string; tone: 'high' | 'medium' | 'low' }> = {
  maximum: { label: 'Prioridade máxima', tone: 'high' },
  high: { label: 'Prioridade alta', tone: 'high' },
  medium: { label: 'Prioridade média', tone: 'medium' },
  low: { label: 'Prioridade baixa', tone: 'low' },
}

const masteryLabels: Record<CandidatePriorityTopic['masteryStatus'], string> = {
  learning: 'Em aprendizagem',
  weak: 'Domínio frágil',
  developing: 'Em desenvolvimento',
  consolidated: 'Consolidado',
}

export function PriorityReviews({ candidateId, onViewReviews }: PriorityReviewsProps) {
  const [state, setState] = useState<PriorityTopicsState>({ status: 'loading' })
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let active = true
    setState({ status: 'loading' })

    candidateApi.getBestActionTopics(candidateId)
      .then((topics) => {
        if (active) setState({ status: 'loaded', topics })
      })
      .catch(() => {
        if (active) setState({ status: 'error' })
      })

    return () => { active = false }
  }, [candidateId, reloadKey])

  const retry = () => setReloadKey((key) => key + 1)
  const topTopics = state.status === 'loaded' ? state.topics.slice(0, 3) : []

  return (
    <section className="panel reviews-panel" aria-labelledby="reviews-heading">
      <div className="section-heading flex items-center justify-between"><div><span className="section-kicker">FOCO SUGERIDO PELO SISTEMA</span><h2 id="reviews-heading">Tópicos prioritários</h2></div><span className="review-count">{String(topTopics.length).padStart(2, '0')}</span></div>
      {state.status === 'loading' && <p className="review-list" role="status" aria-live="polite">Carregando tópicos prioritários…</p>}
      {state.status === 'error' && <div className="review-list" role="alert"><p>Não foi possível carregar os tópicos prioritários.</p><button className="reviews-action" onClick={retry}>Tentar novamente <ArrowRight size={15} aria-hidden="true" /></button></div>}
      {state.status === 'loaded' && state.topics.length === 0 && <p className="review-list" role="status">Nenhum tópico disponível para priorização.</p>}
      {state.status === 'loaded' && topTopics.length > 0 && <>
        <div className="review-list">{topTopics.map((topic) => {
          const priority = priorityPresentation[topic.priorityLevel]
          return <article className="review-item flex items-center" key={topic.topicId}>
            <span className={`priority-marker priority-${priority.tone}`} />
            <div className="review-copy"><strong>{topic.topicName}</strong><span>{topic.subjectName} · {masteryLabels[topic.masteryStatus]}</span></div>
            <span className={`priority-label label-${priority.tone}`}>{priority.label} · {topic.priorityScore}</span>
          </article>
        })}</div>
        <p className="review-copy">Ordenados pelo score de prioridade calculado pelo sistema. O ranking não confirma revisão vencida.</p>
      </>}
      <button className="reviews-action" onClick={onViewReviews}>Explorar revisões <ArrowRight size={15} aria-hidden="true" /></button>
    </section>
  )
}
