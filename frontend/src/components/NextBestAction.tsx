import { ArrowRight, Info, Sparkles, Target } from 'lucide-react'

interface NextBestActionProps {
  onAction: () => void
}

export function NextBestAction({ onAction }: NextBestActionProps) {
  return (
    <section className="panel focus-panel" aria-labelledby="focus-heading">
      <div className="section-heading flex items-center justify-between"><div><span className="section-kicker">RECOMENDAÇÃO DO SISTEMA</span><h2 id="focus-heading">Próxima melhor ação</h2></div><span className="focus-badge"><Sparkles size={14} aria-hidden="true" /> ADAPTATIVA</span></div>
      <div className="focus-visual"><div className="focus-orbit orbit-one" /><div className="focus-orbit orbit-two" /><div className="focus-symbol"><Target size={29} strokeWidth={1.5} aria-hidden="true" /></div><span className="orbit-point point-one" /><span className="orbit-point point-two" /></div>
      <div className="focus-subject">DIREITO CONSTITUCIONAL <span>•</span> TÓPICO EM FOCO</div>
      <h3>Direitos e garantias fundamentais</h3>
      <p>Seu desempenho recente sugere que vale reforçar este tópico.</p>
      <button className="primary-action" onClick={onAction}>Ver recomendação <ArrowRight size={16} aria-hidden="true" /></button>
      <div className="focus-footnote"><Info className="tiny-info" size={13} aria-hidden="true" /> Recomendação demonstrativa, sem dados reais de desempenho.</div>
    </section>
  )
}
