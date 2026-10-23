import { ArrowRight } from 'lucide-react'
import { priorityReviews } from '../data/dashboard'

interface PriorityReviewsProps {
  onViewReviews: () => void
}

export function PriorityReviews({ onViewReviews }: PriorityReviewsProps) {
  return (
    <section className="panel reviews-panel" aria-labelledby="reviews-heading">
      <div className="section-heading flex items-center justify-between"><div><span className="section-kicker">MANTENHA EM DIA</span><h2 id="reviews-heading">Revisões prioritárias</h2></div><span className="review-count">03</span></div>
      <div className="review-list">{priorityReviews.map((item) => <article className="review-item flex items-center" key={item.title}><span className={`priority-marker priority-${item.tone}`} /><div className="review-copy"><strong>{item.title}</strong><span>{item.subject}</span></div><span className={`priority-label label-${item.tone}`}>{item.urgency}</span></article>)}</div>
      <button className="reviews-action" onClick={onViewReviews}>Explorar revisões <ArrowRight size={15} aria-hidden="true" /></button>
    </section>
  )
}
