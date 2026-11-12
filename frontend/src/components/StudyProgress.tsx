import { ArrowRight } from 'lucide-react'
import { useEffect, useState } from 'react'
import { candidateApi } from '../services/api'

interface StudyProgressProps {
  candidateId: string
  onViewPerformance: () => void
}

interface SubjectPerformance {
  subjectId: string
  subjectName: string
  topicCount: number
  attempts: number
  correctAnswers: number
  accuracy: number | null
}

type SubjectPerformanceState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'loaded'; subjects: SubjectPerformance[] }

const progressBarColors = ['blue', 'teal', 'violet'] as const

export function StudyProgress({ candidateId, onViewPerformance }: StudyProgressProps) {
  const [state, setState] = useState<SubjectPerformanceState>({ status: 'loading' })
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let active = true
    setState({ status: 'loading' })

    async function loadSubjectPerformance() {
      try {
        const topics = await candidateApi.getTopics(candidateId)
        const performances = await Promise.all(
          topics.map((topic) => candidateApi.getTopicPerformance(topic.topicId, candidateId)),
        )
        const performanceByTopic = new Map(performances.map((performance) => [performance.topicId, performance]))
        const grouped = new Map<string, Omit<SubjectPerformance, 'accuracy'>>()

        for (const topic of topics) {
          const performance = performanceByTopic.get(topic.topicId)
          if (!performance) throw new Error('O desempenho do tópico não foi retornado.')

          const subject = grouped.get(topic.subjectId) ?? {
            subjectId: topic.subjectId,
            subjectName: topic.subjectName,
            topicCount: 0,
            attempts: 0,
            correctAnswers: 0,
          }

          subject.topicCount += 1
          subject.attempts += performance.attempts
          subject.correctAnswers += performance.correctAnswers
          grouped.set(topic.subjectId, subject)
        }

        const subjects = Array.from(grouped.values())
          .map((subject) => ({
            ...subject,
            accuracy: subject.attempts > 0
              ? (subject.correctAnswers / subject.attempts) * 100
              : null,
          }))
          .sort((left, right) => left.subjectName.localeCompare(right.subjectName, 'pt-BR'))

        if (active) setState({ status: 'loaded', subjects })
      } catch {
        if (active) setState({ status: 'error' })
      }
    }

    void loadSubjectPerformance()
    return () => { active = false }
  }, [candidateId, reloadKey])

  const totalTopics = state.status === 'loaded'
    ? state.subjects.reduce((total, subject) => total + subject.topicCount, 0)
    : null

  return (
    <section className="panel progress-panel" aria-labelledby="progress-heading">
      <div className="section-heading flex items-center justify-between"><div><span className="section-kicker">VISÃO DO EDITAL</span><h2 id="progress-heading">Desempenho por disciplina</h2></div><button className="quiet-link" onClick={onViewPerformance}>Ver desempenho <ArrowRight size={15} aria-hidden="true" /></button></div>
      <div className="progress-overview grid items-center">
        <div className="progress-ring" style={{ background: '#223246' }} role="img" aria-label={`${totalTopics ?? (state.status === 'loading' ? 'carregando' : 'indisponível')} tópicos vinculados às disciplinas`}><div className="ring-center"><strong>{totalTopics ?? (state.status === 'loading' ? '…' : '—')}</strong><small>tópicos</small></div></div>
        <div className="progress-summary"><span className="summary-label">APROVEITAMENTO EM QUESTÕES</span><strong>Acertos sobre tentativas</strong><p>O percentual indica desempenho nas questões respondidas, não conclusão do conteúdo.</p></div>
      </div>
      <div className="subject-breakdown">
        <div className="breakdown-title">APROVEITAMENTO POR DISCIPLINA <span>ACERTOS / TENTATIVAS</span></div>
        {state.status === 'loading' && <p role="status" aria-live="polite">Carregando disciplinas e desempenho…</p>}
        {state.status === 'error' && <div role="alert"><p>Não foi possível carregar o desempenho por disciplina.</p><button className="quiet-link" onClick={() => setReloadKey((key) => key + 1)}>Tentar novamente <ArrowRight size={15} aria-hidden="true" /></button></div>}
        {state.status === 'loaded' && state.subjects.length === 0 && <p role="status">Nenhuma disciplina com tópicos cadastrados para este edital.</p>}
        {state.status === 'loaded' && state.subjects.map((subject, index) => {
          const color = progressBarColors[index % progressBarColors.length]
          const accuracyLabel = subject.accuracy === null ? 'Sem dados' : `${Math.round(subject.accuracy)}%`
          const topicLabel = subject.topicCount === 1 ? 'tópico' : 'tópicos'
          const attemptLabel = subject.attempts.toLocaleString('pt-BR')

          return <div className="subject-row" key={subject.subjectId}>
            <div className="subject-label flex justify-between"><span>{subject.subjectName} · {subject.topicCount} {topicLabel} · {attemptLabel} questões respondidas</span><strong>{accuracyLabel}</strong></div>
            <div className="subject-track" role={subject.accuracy === null ? undefined : 'progressbar'} aria-label={subject.accuracy === null ? undefined : `Aproveitamento em ${subject.subjectName}`} aria-valuemin={subject.accuracy === null ? undefined : 0} aria-valuemax={subject.accuracy === null ? undefined : 100} aria-valuenow={subject.accuracy ?? undefined} aria-valuetext={subject.accuracy === null ? undefined : `${Math.round(subject.accuracy)}% de aproveitamento`}><span className={`bar-${color}`} style={{ width: `${subject.accuracy ?? 0}%` }} /></div>
          </div>
        })}
      </div>
    </section>
  )
}
