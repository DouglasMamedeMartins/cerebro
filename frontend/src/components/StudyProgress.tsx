import { ArrowRight } from 'lucide-react'
import { subjectProgress } from '../data/dashboard'

interface StudyProgressProps {
  onViewPerformance: () => void
}

export function StudyProgress({ onViewPerformance }: StudyProgressProps) {
  return (
    <section className="panel progress-panel" aria-labelledby="progress-heading">
      <div className="section-heading flex items-center justify-between"><div><span className="section-kicker">VISÃO DO EDITAL</span><h2 id="progress-heading">Progresso dos estudos</h2></div><button className="quiet-link" onClick={onViewPerformance}>Ver desempenho <ArrowRight size={15} aria-hidden="true" /></button></div>
      <div className="progress-overview grid items-center">
        <div className="progress-ring" role="img" aria-label="Progresso geral demonstrativo: 64 por cento"><div className="ring-center"><strong>64<span>%</span></strong><small>concluído</small></div></div>
        <div className="progress-summary"><span className="summary-label">PROGRESSO GERAL</span><strong>Uma etapa de cada vez.</strong><p>Seu plano demonstrativo está avançando. Mantenha a regularidade para consolidar o conteúdo.</p><div className="progress-line" role="progressbar" aria-label="Progresso geral dos estudos" aria-valuemin={0} aria-valuemax={100} aria-valuenow={64}><span style={{ width: '64%' }} /></div><div className="progress-scale flex justify-between"><span>Início</span><span>64% do plano</span><span>Meta</span></div></div>
      </div>
      <div className="subject-breakdown"><div className="breakdown-title flex justify-between">PROGRESSO POR MATÉRIA <span>DEMONSTRATIVO</span></div>{subjectProgress.map((subject) => <div className="subject-row" key={subject.name}><div className="subject-label flex justify-between"><span>{subject.name}</span><strong>{subject.progress}%</strong></div><div className="subject-track" role="progressbar" aria-label={`Progresso em ${subject.name}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={subject.progress}><span className={`bar-${subject.color}`} style={{ width: `${subject.progress}%` }} /></div></div>)}</div>
    </section>
  )
}
