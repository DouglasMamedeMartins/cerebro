import { Sparkles } from 'lucide-react'
import { useState } from 'react'
import { DashboardHeader } from './components/DashboardHeader'
import { MetricCards } from './components/MetricCards'
import { NextBestAction } from './components/NextBestAction'
import { PriorityReviews } from './components/PriorityReviews'
import { PerformancePage } from './components/PerformancePage'
import { QuestionsPage } from './components/QuestionsPage'
import { ReviewsPage } from './components/ReviewsPage'
import { Sidebar } from './components/Sidebar'
import { StudyPlan } from './components/StudyPlan'
import { StudyPlanPage } from './components/StudyPlanPage'
import { StudyProgress } from './components/StudyProgress'
import type { DashboardSection } from './data/dashboard'
import './App.css'

function App() {
  const [activeSection, setActiveSection] = useState<DashboardSection>('Visão geral')
  const [menuOpen, setMenuOpen] = useState(false)
  const [notice, setNotice] = useState('')

  function chooseSection(section: DashboardSection) {
    setActiveSection(section)
    setMenuOpen(false)
    setNotice('')
  }

  return (
    <div className="app-shell min-h-screen bg-[#080e1b] text-[#e9eff9]">
      {menuOpen && <button className="mobile-scrim" aria-label="Fechar menu" onClick={() => setMenuOpen(false)} />}
      <Sidebar activeSection={activeSection} mobileOpen={menuOpen} onSelect={chooseSection} onClose={() => setMenuOpen(false)} />
      <main className="main-content min-h-screen">
        <DashboardHeader section={activeSection} onOpenMenu={() => setMenuOpen(true)} />
        {activeSection === 'Visão geral' ? <div className="page-content">
          <section className="welcome-row flex items-end justify-between">
            <div><div className="eyebrow"><span className="eyebrow-line" /> SEU ESPAÇO DE PREPARAÇÃO</div><h1>Visão geral</h1><p className="welcome-copy">Bom estudo! Vamos avançar hoje.</p></div>
            <div className="date-label"><span className="status-pulse" /> Painel demonstrativo</div>
          </section>
          {notice && <div className="inline-notice" role="status">{notice}</div>}
          <MetricCards />
          <div className="overview-grid grid">
            <StudyProgress onViewPerformance={() => chooseSection('Desempenho')} />
            <NextBestAction onAction={() => setNotice('Esta recomendação é demonstrativa. A ação adaptativa ainda não está conectada.')} />
          </div>
          <div className="lower-grid grid">
            <StudyPlan onViewPlan={() => chooseSection('Plano de estudos')} />
            <PriorityReviews onViewReviews={() => chooseSection('Revisões')} />
          </div>
          <footer className="page-footer flex items-center justify-between"><span><span className="footer-mark">C</span> PMDF CÉREBRO</span><span>Interface demonstrativa · Os dados exibidos são fictícios.</span><span>Preparação com propósito <Sparkles size={14} aria-hidden="true" /></span></footer>
        </div> : <div className="page-content">
          {activeSection === 'Plano de estudos' && <StudyPlanPage />}
          {activeSection === 'Questões' && <QuestionsPage />}
          {activeSection === 'Revisões' && <ReviewsPage />}
          {activeSection === 'Desempenho' && <PerformancePage />}
          <footer className="page-footer flex items-center justify-between"><span><span className="footer-mark">C</span> PMDF CÉREBRO</span><span>Interface demonstrativa · Os dados exibidos são fictícios.</span><span>Preparação com propósito <Sparkles size={14} aria-hidden="true" /></span></footer>
        </div>}
      </main>
    </div>
  )
}

export default App
