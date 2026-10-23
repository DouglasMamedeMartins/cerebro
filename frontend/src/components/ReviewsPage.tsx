import { ArrowRight, Check, CheckCheck, Clock3, RotateCcw } from 'lucide-react'
import { useState } from 'react'
import { reviewQueue } from '../data/dashboard'
import { PageHeading } from './PageHeading'

const priorityClass = { Alta: 'review-priority-high', Média: 'review-priority-medium', Atenção: 'review-priority-low' }

export function ReviewsPage() {
  const [reviewedIds, setReviewedIds] = useState<string[]>([])
  const pendingReviews = reviewQueue.filter((review) => !reviewedIds.includes(review.id))

  function markReviewed(id: string) {
    setReviewedIds((current) => current.includes(id) ? current : [...current, id])
  }

  return (
    <div className="feature-page">
      <PageHeading eyebrow="REVISÃO ATIVA" title="Revisões" description="Retome tópicos demonstrativos e marque localmente o que já revisou." />
      <section className="review-page-summary panel"><div className="review-summary-icon"><RotateCcw size={19} aria-hidden="true" /></div><div><span className="section-kicker">FILA DEMONSTRATIVA</span><strong>{pendingReviews.length} <small>tópicos pendentes</small></strong><p>{reviewedIds.length > 0 ? `${reviewedIds.length} tópico${reviewedIds.length === 1 ? '' : 's'} marcado${reviewedIds.length === 1 ? '' : 's'} como revisado nesta sessão.` : 'Marcar como revisado atualiza apenas esta tela, sem persistência.'}</p></div><div className="review-summary-progress"><span>REVISADAS</span><strong>{reviewedIds.length}/{reviewQueue.length}</strong><div className="plan-progress-track" role="progressbar" aria-label="Revisões marcadas nesta sessão" aria-valuemin={0} aria-valuemax={reviewQueue.length} aria-valuenow={reviewedIds.length}><span style={{ width: `${reviewedIds.length / reviewQueue.length * 100}%` }} /></div></div></section>

      <section className="panel review-page-list" aria-labelledby="review-list-title">
        <div className="page-panel-heading"><div><span className="section-kicker">TÓPICOS PARA RETOMAR</span><h2 id="review-list-title">Sua fila de revisão</h2></div><span className="day-pill"><CheckCheck size={14} aria-hidden="true" /> LOCAL</span></div>
        {pendingReviews.length > 0 ? <div className="review-page-items">{pendingReviews.map((review) => <article className="review-page-item" key={review.id}>
          <div className="review-priority-icon"><RotateCcw size={17} aria-hidden="true" /></div><div className="review-page-copy"><span>{review.subject}</span><strong>{review.title}</strong><div className="review-page-meta"><span className={`review-priority-pill ${priorityClass[review.priority]}`}>{review.priority} prioridade</span><span><Clock3 size={13} aria-hidden="true" /> {review.estimatedMinutes} min</span></div></div>
          <button className="mark-reviewed-button" onClick={() => markReviewed(review.id)}><Check size={15} aria-hidden="true" /> Marcar como revisado</button>
        </article>)}</div> : <div className="review-empty-state" role="status"><div><CheckCheck size={24} aria-hidden="true" /></div><strong>Fila demonstrativa concluída</strong><p>Você marcou todos os tópicos desta lista como revisados nesta sessão.</p><button className="text-action" onClick={() => setReviewedIds([])}>Reiniciar demonstração <ArrowRight size={15} aria-hidden="true" /></button></div>}
        <p className="demo-disclaimer">A fila e o estado de revisão são fictícios e não são enviados ao servidor.</p>
      </section>
    </div>
  )
}
