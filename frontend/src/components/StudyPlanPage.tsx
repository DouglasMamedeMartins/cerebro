import { BookOpen, CalendarDays, Check, Clock3, ListFilter } from 'lucide-react'
import { useState } from 'react'
import { studyPlanActivities, type StudyStatus } from '../data/dashboard'
import { PageHeading } from './PageHeading'

type PlanFilter = 'Todas' | StudyStatus
const filters: PlanFilter[] = ['Todas', 'Planejada', 'Em andamento', 'Concluída']

const statusClass: Record<StudyStatus, string> = {
  Planejada: 'plan-status-pending',
  'Em andamento': 'plan-status-active',
  Concluída: 'plan-status-done',
}

export function StudyPlanPage() {
  const [filter, setFilter] = useState<PlanFilter>('Todas')
  const activities = studyPlanActivities.filter((activity) => filter === 'Todas' || activity.status === filter)
  const completed = studyPlanActivities.filter((activity) => activity.status === 'Concluída').length
  const totalMinutes = activities.reduce((total, activity) => total + activity.durationMinutes, 0)
  const progress = Math.round(completed / studyPlanActivities.length * 100)

  return (
    <div className="feature-page">
      <PageHeading eyebrow="ORGANIZE SEU RITMO" title="Plano de estudos" description="Um roteiro demonstrativo para avançar com constância, matéria por matéria." />

      <section className="plan-summary-grid" aria-label="Resumo demonstrativo do plano">
        <article className="panel plan-summary-card"><div className="plan-summary-icon"><CalendarDays size={18} aria-hidden="true" /></div><span>ATIVIDADES NO PLANO</span><strong>{studyPlanActivities.length}</strong><small>itens demonstrativos</small></article>
        <article className="panel plan-summary-card"><div className="plan-summary-icon plan-icon-green"><Check size={18} aria-hidden="true" /></div><span>CONCLUÍDAS</span><strong>{completed} <small>de {studyPlanActivities.length}</small></strong><small>atividades marcadas como feitas</small></article>
        <article className="panel plan-summary-card"><div className="plan-summary-icon plan-icon-violet"><Clock3 size={18} aria-hidden="true" /></div><span>TEMPO NO FILTRO</span><strong>{totalMinutes} <small>min</small></strong><small>estimativa das atividades visíveis</small></article>
        <article className="panel plan-progress-card"><div className="plan-progress-heading"><span>PROGRESSO DO PLANO</span><strong>{progress}%</strong></div><div className="plan-progress-track" role="progressbar" aria-label="Atividades do plano concluídas" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}><span style={{ width: `${progress}%` }} /></div><p>Progresso demonstrativo com base nas atividades concluídas.</p></article>
      </section>

      <section className="panel plan-list-panel" aria-labelledby="plan-list-title">
        <div className="page-panel-heading"><div><span className="section-kicker">AGENDA DE ESTUDO</span><h2 id="plan-list-title">Atividades por matéria</h2></div><span className="day-pill"><BookOpen size={14} aria-hidden="true" /> PLANO DE EXEMPLO</span></div>
        <div className="plan-filter-row" aria-label="Filtrar atividades por status">
          <span className="filter-label"><ListFilter size={14} aria-hidden="true" /> Filtrar</span>
          <div className="filter-options">{filters.map((item) => <button key={item} type="button" className={`filter-button ${filter === item ? 'filter-button-active' : ''}`} aria-pressed={filter === item} onClick={() => setFilter(item)}>{item}</button>)}</div>
          <span className="visible-count">{activities.length} {activities.length === 1 ? 'atividade' : 'atividades'}</span>
        </div>
        {activities.length > 0 ? <div className="plan-activity-list">{activities.map((activity, index) => <article className="plan-activity-row" key={activity.id}>
          <div className="plan-activity-index">{String(index + 1).padStart(2, '0')}</div>
          <div className="plan-activity-content"><span>{activity.subject}</span><strong>{activity.topic}</strong><div className="plan-row-progress"><div className="plan-row-track" role="progressbar" aria-label={`Progresso de ${activity.topic}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={activity.progress}><span style={{ width: `${activity.progress}%` }} /></div><small>{activity.progress}%</small></div></div>
          <div className="plan-row-duration"><Clock3 size={14} aria-hidden="true" /> {activity.durationMinutes} min</div>
          <span className={`plan-status ${statusClass[activity.status]}`}>{activity.status}</span>
        </article>)}</div> : <div className="plan-empty-state" role="status"><div><BookOpen size={23} aria-hidden="true" /></div><strong>Nenhuma atividade neste filtro</strong><p>Escolha outro status para ver as atividades demonstrativas.</p><button className="text-action" onClick={() => setFilter('Todas')}>Limpar filtro</button></div>}
        <p className="demo-disclaimer">Este plano é apenas demonstrativo. As atividades não são salvas nem sincronizadas.</p>
      </section>
    </div>
  )
}
