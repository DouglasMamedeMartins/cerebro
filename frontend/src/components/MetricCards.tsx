import { CalendarDays, ClipboardCheck, Clock3, Target } from 'lucide-react'
import { metrics } from '../data/dashboard'

const metricIcons = {
  questions: ClipboardCheck,
  target: Target,
  calendar: CalendarDays,
  clock: Clock3,
}

export function MetricCards() {
  return (
    <section aria-labelledby="stats-heading">
      <div className="section-heading compact-heading flex items-center justify-between"><div><span className="section-kicker">SEU RITMO</span><h2 id="stats-heading">Resumo de desempenho</h2></div><span className="demo-tag">DADOS DE DEMONSTRAÇÃO</span></div>
      <div className="stats-grid grid">
        {metrics.map((metric, index) => {
          const MetricIcon = metricIcons[metric.icon]
          return <article className="stat-card" key={metric.label}>
            <div className={`stat-icon tone-${metric.tone}`}><MetricIcon size={19} strokeWidth={1.8} aria-hidden="true" /></div>
            <div className="stat-label">{metric.label}</div>
            <div className="stat-value">{metric.value}</div>
            <div className="stat-note"><span className="stat-index">0{index + 1}</span>{metric.note}</div>
          </article>
        })}
      </div>
    </section>
  )
}
