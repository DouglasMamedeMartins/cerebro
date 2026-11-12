import { CalendarDays, ClipboardCheck, Clock3, Target } from 'lucide-react'
import { useEffect, useState } from 'react'
import { metrics } from '../data/dashboard'
import { candidateApi } from '../services/api'

interface MetricCardsProps {
  candidateId: string
}

type CandidateQuestionStats = {
  attempts: number
  correctAnswers: number
  studyMinutes: number
}

type StatsState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'loaded'; stats: CandidateQuestionStats }

type StreakState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'loaded'; currentStreak: number }

const metricIcons = {
  questions: ClipboardCheck,
  target: Target,
  calendar: CalendarDays,
  clock: Clock3,
}

export function MetricCards({ candidateId }: MetricCardsProps) {
  const [state, setState] = useState<StatsState>({ status: 'loading' })
  const [reloadKey, setReloadKey] = useState(0)
  const [streakState, setStreakState] = useState<StreakState>({ status: 'loading' })
  const [streakReloadKey, setStreakReloadKey] = useState(0)

  useEffect(() => {
    let active = true
    setState({ status: 'loading' })

    async function loadStats() {
      try {
        const topics = await candidateApi.getTopics(candidateId)
        const topicStats = await Promise.all(
          topics.map(async ({ topicId }) => {
            const [performance, coverage] = await Promise.all([
              candidateApi.getTopicPerformance(topicId, candidateId),
              candidateApi.getTopicCoverage(candidateId, topicId),
            ])
            return { performance, coverage }
          }),
        )
        const stats = topicStats.reduce<CandidateQuestionStats>((total, { performance, coverage }) => ({
          attempts: total.attempts + performance.attempts,
          correctAnswers: total.correctAnswers + performance.correctAnswers,
          studyMinutes: total.studyMinutes + coverage.totalMinutes,
        }), { attempts: 0, correctAnswers: 0, studyMinutes: 0 })

        if (active) setState({ status: 'loaded', stats })
      } catch {
        if (active) setState({ status: 'error' })
      }
    }

    void loadStats()
    return () => { active = false }
  }, [candidateId, reloadKey])

  useEffect(() => {
    let active = true
    setStreakState({ status: 'loading' })

    candidateApi.getStudyStreak().then((streak) => {
      if (active) setStreakState({ status: 'loaded', currentStreak: streak.currentStreak })
    }).catch(() => {
      if (active) setStreakState({ status: 'error' })
    })

    return () => { active = false }
  }, [candidateId, streakReloadKey])

  return (
    <section aria-labelledby="stats-heading">
      <div className="section-heading compact-heading flex items-center justify-between"><div><span className="section-kicker">SEU RITMO</span><h2 id="stats-heading">Resumo de desempenho</h2></div><span className="demo-tag">INDICADORES REAIS E DEMONSTRATIVOS</span></div>
      {state.status === 'error' && <div className="inline-notice" role="alert">Não foi possível carregar questões, aproveitamento e tempo de estudo. <button onClick={() => setReloadKey((key) => key + 1)}>Tentar novamente</button></div>}
      {streakState.status === 'error' && <div className="inline-notice" role="alert">Não foi possível carregar a sequência de estudos. <button onClick={() => setStreakReloadKey((key) => key + 1)}>Tentar novamente</button></div>}
      <div className="stats-grid grid">
        {metrics.map((metric, index) => {
          const MetricIcon = metricIcons[metric.icon]
          let value = metric.value ?? '—'
          let note = metric.note

          if (metric.key === 'answered' || metric.key === 'accuracy') {
            if (state.status === 'loading') {
              value = '…'
              note = 'Carregando dados reais'
            } else if (state.status === 'error') {
              value = '—'
              note = 'Não disponível'
            } else if (metric.key === 'answered') {
              value = state.stats.attempts.toLocaleString('pt-BR')
              note = 'no total'
            } else if (state.stats.attempts === 0) {
              value = 'Sem dados'
              note = 'Nenhuma tentativa registrada'
            } else {
              value = `${Math.round((state.stats.correctAnswers / state.stats.attempts) * 100)}%`
              note = 'percentual geral'
            }
          }

          if (metric.key === 'studyTime') {
            if (state.status === 'loading') {
              value = '…'
              note = 'Carregando dados reais'
            } else if (state.status === 'error') {
              value = '—'
              note = 'Não disponível'
            } else {
              const hours = Math.floor(state.stats.studyMinutes / 60)
              const minutes = state.stats.studyMinutes % 60
              value = `${hours}h ${minutes}min`
              note = state.stats.studyMinutes === 0 ? 'Sem estudo registrado' : 'tempo acumulado'
            }
          }

          if (metric.key === 'streak') {
            if (streakState.status === 'loading') {
              value = '…'
              note = 'Carregando dados reais'
            } else if (streakState.status === 'error') {
              value = '—'
              note = 'Não disponível'
            } else {
              value = `${streakState.currentStreak} dias`
              note = 'sequência atual'
            }
          }

          return <article className="stat-card" key={metric.label}>
            <div className={`stat-icon tone-${metric.tone}`}><MetricIcon size={19} strokeWidth={1.8} aria-hidden="true" /></div>
            <div className="stat-label">{metric.label}</div>
            <div className="stat-value">{value}</div>
            <div className="stat-note"><span className="stat-index">0{index + 1}</span>{note}</div>
          </article>
        })}
      </div>
    </section>
  )
}
