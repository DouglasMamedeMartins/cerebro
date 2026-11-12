import { Clock3 } from 'lucide-react'
import type { DailyPlanActivity } from '../hooks/useDailyStudyPlan'

const actionLabels: Record<DailyPlanActivity['type'], string> = {
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
    <label className="plan-availability">
      <span>Tempo disponível hoje</span>
      <span className="plan-availability-input">
        <input
          type="number"
          min={0}
          step={5}
          value={value}
          onChange={(event) => onChange(Number(event.currentTarget.value))}
          aria-label="Tempo disponível hoje em minutos"
        />
        <small>min</small>
      </span>
    </label>
  )
}

interface StudyPlanRecommendationsProps {
  activities: DailyPlanActivity[]
  compact?: boolean
}

export function StudyPlanRecommendations({ activities, compact = false }: StudyPlanRecommendationsProps) {
  if (compact) {
    return (
      <div className="activity-list">
        {activities.map((activity, index) => (
          <article className="activity-item" key={activity.id}>
            <div className={`activity-number ${index === 0 ? 'activity-blue' : 'activity-violet'}`} aria-hidden="true">{String(index + 1).padStart(2, '0')}</div>
            <div className="activity-details">
              <strong>{activity.subjectName}</strong>
              <span>{activity.topicName}</span>
              <span>{actionLabels[activity.type]} · Prioridade {priorityLabels[activity.priorityLevel]}</span>
              <p className="daily-plan-explanation">{activity.explanation}</p>
              <p className="daily-plan-impact">Impacto esperado: {activity.expectedImpact}</p>
            </div>
            <div className="activity-meta">
              <span><Clock3 size={13} aria-hidden="true" /> {activity.durationMinutes} min</span>
              <small className={activity.isBestAction ? 'state-next' : ''}>{activity.isBestAction ? 'Melhor ação' : `Prioridade ${priorityLabels[activity.priorityLevel]}`}</small>
            </div>
          </article>
        ))}
      </div>
    )
  }

  return (
    <div className="plan-activity-list">
      {activities.map((activity, index) => (
        <article className="plan-activity-row daily-plan-row" key={activity.id}>
          <div className="plan-activity-index">{String(index + 1).padStart(2, '0')}</div>
          <div className="plan-activity-content">
            <span>{activity.subjectName} · {actionLabels[activity.type]} · Prioridade {priorityLabels[activity.priorityLevel]}</span>
            <strong>{activity.topicName}</strong>
            <p className="daily-plan-explanation">{activity.explanation}</p>
            <p className="daily-plan-impact">Impacto esperado: {activity.expectedImpact}</p>
          </div>
          <div className="plan-row-duration"><Clock3 size={14} aria-hidden="true" /> {activity.durationMinutes} min</div>
          <span className={`plan-status ${activity.isBestAction ? 'plan-status-active' : 'plan-status-pending'}`}>
            {activity.isBestAction ? 'Melhor ação' : `Prioridade ${priorityLabels[activity.priorityLevel]}`}
          </span>
        </article>
      ))}
    </div>
  )
}

export function formatPlanDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60)
  const remainingMinutes = minutes % 60
  if (hours === 0) return `${remainingMinutes} min`
  if (remainingMinutes === 0) return `${hours}h`
  return `${hours}h ${remainingMinutes}min`
}
