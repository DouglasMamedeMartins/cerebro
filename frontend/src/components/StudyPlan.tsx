import { ArrowRight, CalendarDays, Clock3 } from 'lucide-react'
import { studyActivities } from '../data/dashboard'

interface StudyPlanProps {
  onViewPlan: () => void
}

export function StudyPlan({ onViewPlan }: StudyPlanProps) {
  return (
    <section className="panel schedule-panel" aria-labelledby="schedule-heading">
      <div className="section-heading flex items-center justify-between"><div><span className="section-kicker">PLANEJAMENTO</span><h2 id="schedule-heading">Plano de estudos de hoje</h2></div><span className="day-pill"><CalendarDays size={14} aria-hidden="true" /> HOJE</span></div>
      <div className="activity-list">{studyActivities.map((activity, index) => <article className="activity-item flex items-center" key={activity.topic}><div className={`activity-number activity-${activity.tone}`}>0{index + 1}</div><div className="activity-details"><strong>{activity.subject}</strong><span>{activity.topic}</span></div><div className="activity-meta"><span><Clock3 size={13} aria-hidden="true" /> {activity.duration}</span><small className={index === 0 ? 'state-next' : ''}>{activity.state}</small></div></article>)}</div>
      <div className="schedule-footer flex items-center justify-between"><span>Estimativa total <strong>1h 15min</strong></span><button className="text-action" onClick={onViewPlan}>Ver plano de estudos <ArrowRight size={15} aria-hidden="true" /></button></div>
    </section>
  )
}
