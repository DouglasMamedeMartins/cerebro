import { AlertCircle, BookOpen, Clock3, History } from 'lucide-react'
import { useEffect, useState } from 'react'
import { candidateApi, type StudySessionHistoryItem, type StudySessionHistoryPage } from '../services/api'

type HistoryState =
  | { status: 'loading' }
  | { status: 'error' }
  | {
      status: 'loaded'
      sessions: StudySessionHistoryItem[]
      pagination: StudySessionHistoryPage['pagination']
      loadingMore: boolean
      loadMoreError: boolean
    }

const PAGE_SIZE = 5

function formatStudyDate(localStudyDate: string): string {
  const [year, month, day] = localStudyDate.split('-')
  return `${day}/${month}/${year}`
}

export function StudyHistory() {
  const [state, setState] = useState<HistoryState>({ status: 'loading' })
  const [retryKey, setRetryKey] = useState(0)

  useEffect(() => {
    let active = true
    setState({ status: 'loading' })
    void candidateApi.getStudySessionHistory(1, PAGE_SIZE)
      .then((result) => {
        if (active) {
          setState({
            status: 'loaded',
            sessions: result.sessions,
            pagination: result.pagination,
            loadingMore: false,
            loadMoreError: false,
          })
        }
      })
      .catch(() => {
        if (active) setState({ status: 'error' })
      })

    return () => { active = false }
  }, [retryKey])

  async function loadMore() {
    if (state.status !== 'loaded' || state.loadingMore) return
    const nextPage = state.pagination.page + 1
    setState({ ...state, loadingMore: true, loadMoreError: false })
    try {
      const result = await candidateApi.getStudySessionHistory(nextPage, PAGE_SIZE)
      setState((current) => current.status === 'loaded' ? {
        status: 'loaded',
        sessions: [...current.sessions, ...result.sessions],
        pagination: result.pagination,
        loadingMore: false,
        loadMoreError: false,
      } : current)
    } catch {
      setState((current) => current.status === 'loaded'
        ? { ...current, loadingMore: false, loadMoreError: true }
        : current)
    }
  }

  return (
    <section className="panel" aria-labelledby="study-history-title" style={{ marginTop: 14 }}>
      <div className="section-heading">
        <div>
          <div className="section-kicker">SESSÕES REGISTRADAS</div>
          <h2 id="study-history-title">Histórico recente de estudos</h2>
        </div>
        <History size={17} color="#65cddd" aria-hidden="true" />
      </div>

      {state.status === 'loading' && (
        <div className="history-state" role="status"><span className="loading-spinner" />Carregando histórico...</div>
      )}

      {state.status === 'error' && (
        <div className="history-state history-error" role="alert">
          <AlertCircle size={16} aria-hidden="true" />
          <span>Não foi possível carregar o histórico.</span>
          <button className="text-action" onClick={() => setRetryKey((key) => key + 1)}>Tentar novamente</button>
        </div>
      )}

      {state.status === 'loaded' && state.sessions.length === 0 && (
        <p className="history-state">Nenhuma sessão de estudo registrada.</p>
      )}

      {state.status === 'loaded' && state.sessions.length > 0 && (
        <>
          <div className="activity-list">
            {state.sessions.map((session, index) => (
              <article className="activity-item" key={session.id}>
                <div className={`activity-number ${index % 2 === 0 ? 'activity-blue' : 'activity-teal'}`} aria-hidden="true">
                  <BookOpen size={14} />
                </div>
                <div className="activity-details">
                  <strong>{session.topicName ?? 'Tópico não informado'}</strong>
                  <span>{session.subjectName ?? 'Disciplina não informada'} · {formatStudyDate(session.localStudyDate)}</span>
                </div>
                <div className="activity-meta">
                  <span><Clock3 size={12} aria-hidden="true" /> {session.durationMinutes} min</span>
                </div>
              </article>
            ))}
          </div>

          {state.pagination.page < state.pagination.totalPages && (
            <div className="history-pagination">
              <span role={state.loadMoreError ? 'alert' : undefined}>
                {state.loadMoreError ? 'Não foi possível carregar mais sessões.' : `Exibindo ${state.sessions.length} de ${state.pagination.total} sessões`}
              </span>
              <button className="text-action" onClick={() => void loadMore()} disabled={state.loadingMore}>
                {state.loadingMore ? 'Carregando...' : state.loadMoreError ? 'Tentar novamente' : 'Carregar mais'}
              </button>
            </div>
          )}
        </>
      )}
    </section>
  )
}
