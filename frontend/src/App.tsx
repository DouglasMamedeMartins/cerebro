import { Sparkles } from 'lucide-react'
import { useEffect, useState } from 'react'
import { DashboardHeader } from './components/DashboardHeader'
import { ChangePasswordDialog } from './components/ChangePasswordDialog'
import { LoginPage } from './components/LoginPage'
import { MetricCards } from './components/MetricCards'
import { NextBestAction } from './components/NextBestAction'
import { PriorityReviews } from './components/PriorityReviews'
import { PerformancePage } from './components/PerformancePage'
import { QuestionsPage } from './components/QuestionsPage'
import { ReviewsPage } from './components/ReviewsPage'
import { Sidebar } from './components/Sidebar'
import { StudyHistory } from './components/StudyHistory'
import { StudyPlan } from './components/StudyPlan'
import { StudyPlanPage } from './components/StudyPlanPage'
import { StudyProgress } from './components/StudyProgress'
import type { DashboardSection } from './data/dashboard'
import { useDailyStudyPlan } from './hooks/useDailyStudyPlan'
import { useStudySessionRegistration } from './hooks/useStudySessionRegistration'
import { ApiError, authApi, type Candidate } from './services/api'
import './App.css'

function App() {
  const [candidate, setCandidate] = useState<Candidate | null>(null)
  const [sessionStatus, setSessionStatus] = useState<'checking' | 'authenticated' | 'unauthenticated' | 'error'>('checking')
  const [sessionError, setSessionError] = useState('')
  const [loggingOut, setLoggingOut] = useState(false)
  const [passwordDialogOpen, setPasswordDialogOpen] = useState(false)
  const [activeSection, setActiveSection] = useState<DashboardSection>('Visão geral')
  const [menuOpen, setMenuOpen] = useState(false)
  const [notice, setNotice] = useState('')
  const [studyHistoryRefreshKey, setStudyHistoryRefreshKey] = useState(0)
  const dailyStudyPlan = useDailyStudyPlan(candidate?.id)
  const studySessionRegistration = useStudySessionRegistration(candidate?.id, () => { setStudyHistoryRefreshKey((key) => key + 1); dailyStudyPlan.refresh() })

  async function checkSession() {
    setSessionStatus('checking')
    setSessionError('')
    try {
      setCandidate(await authApi.me())
      setSessionStatus('authenticated')
    } catch (cause) {
      setCandidate(null)
      if (cause instanceof ApiError && cause.status === 401) {
        setSessionStatus('unauthenticated')
      } else {
        setSessionStatus('error')
        setSessionError('Não foi possível validar sua sessão. Verifique a conexão e tente novamente.')
      }
    }
  }

  useEffect(() => {
    void checkSession()
  }, [])

  async function handleLogout() {
    setLoggingOut(true)
    setNotice('')
    try {
      await authApi.logout()
      setCandidate(null)
      setSessionStatus('unauthenticated')
    } catch {
      setNotice('Não foi possível concluir o logout. Tente novamente.')
    } finally {
      setLoggingOut(false)
    }
  }

  function chooseSection(section: DashboardSection) {
    setActiveSection(section)
    setMenuOpen(false)
    setNotice('')
  }

  if (sessionStatus === 'checking') {
    return <main className="auth-screen" aria-live="polite"><div className="auth-loading"><span className="loading-spinner" />Verificando sua sessão…</div></main>
  }

  if (sessionStatus === 'error') {
    return <main className="auth-screen"><section className="auth-card auth-session-error">
      <div className="auth-brand"><div className="brand-mark" aria-hidden="true"><span /><span /><span /><span /></div><div className="brand-name">PMDF <span>CÉREBRO</span></div></div>
      <h1>Não foi possível conectar</h1><p className="auth-description">{sessionError}</p>
      <button className="auth-submit" onClick={() => void checkSession()}>Tentar novamente</button>
    </section></main>
  }

  if (sessionStatus === 'unauthenticated' || !candidate) {
    return <LoginPage onAuthenticated={(authenticatedCandidate) => {
      setCandidate(authenticatedCandidate)
      setSessionStatus('authenticated')
    }} />
  }

  return (
    <div className="app-shell min-h-screen bg-[#080e1b] text-[#e9eff9]">
      {menuOpen && <button className="mobile-scrim" aria-label="Fechar menu" onClick={() => setMenuOpen(false)} />}
      <Sidebar activeSection={activeSection} mobileOpen={menuOpen} onSelect={chooseSection} onClose={() => setMenuOpen(false)} />
      <main className="main-content min-h-screen">
        <DashboardHeader section={activeSection} candidate={candidate} onLogout={() => void handleLogout()} onOpenPasswordChange={() => setPasswordDialogOpen(true)} loggingOut={loggingOut} onOpenMenu={() => setMenuOpen(true)} />
        {passwordDialogOpen && <ChangePasswordDialog onClose={() => setPasswordDialogOpen(false)} />}
        {activeSection === 'Visão geral' ? <div className="page-content">
          <section className="welcome-row flex items-end justify-between">
            <div><div className="eyebrow"><span className="eyebrow-line" /> SEU ESPAÇO DE PREPARAÇÃO</div><h1>Visão geral</h1><p className="welcome-copy">Bom estudo! Vamos avançar hoje.</p></div>
            <div className="date-label"><span className="status-pulse" /> Painel demonstrativo</div>
          </section>
          {notice && <div className="inline-notice" role="status">{notice}</div>}
          <MetricCards candidateId={candidate.id} />
          <div className="overview-grid grid">
            <StudyProgress candidateId={candidate.id} onViewPerformance={() => chooseSection('Desempenho')} />
            <NextBestAction candidateId={candidate.id} />
          </div>
          <div className="lower-grid grid">
            <StudyPlan plan={dailyStudyPlan} candidateId={candidate.id} registration={studySessionRegistration} onViewPlan={() => chooseSection('Plano de estudos')} />
            <PriorityReviews candidateId={candidate.id} onViewReviews={() => chooseSection('Revisões')} />
          </div>
          <StudyHistory refreshKey={studyHistoryRefreshKey} />
          <footer className="page-footer flex items-center justify-between"><span><span className="footer-mark">C</span> PMDF CÉREBRO</span><span>Indicadores conectados usam dados reais da conta; sequência diária indisponível. Outras áreas são demonstrativas.</span><span>Preparação com propósito <Sparkles size={14} aria-hidden="true" /></span></footer>
        </div> : <div className="page-content">
          {activeSection === 'Plano de estudos' && <StudyPlanPage plan={dailyStudyPlan} candidateId={candidate.id} registration={studySessionRegistration} />}
          {activeSection === 'Questões' && <QuestionsPage />}
          {activeSection === 'Revisões' && <ReviewsPage />}
          {activeSection === 'Desempenho' && <PerformancePage />}
          <footer className="page-footer flex items-center justify-between"><span><span className="footer-mark">C</span> PMDF CÉREBRO</span><span>Indicadores conectados usam dados reais da conta; sequência diária indisponível. Outras áreas são demonstrativas.</span><span>Preparação com propósito <Sparkles size={14} aria-hidden="true" /></span></footer>
        </div>}
      </main>
    </div>
  )
}

export default App
