import { ArrowUpRight, ChartNoAxesColumnIncreasing, CircleHelp, Target } from 'lucide-react'
import { performanceBySubject, performanceHistory } from '../data/dashboard'
import { PageHeading } from './PageHeading'

const chartPoints = performanceHistory.map((point, index) => `${30 + index * 70},${126 - point.score}`).join(' ')

export function PerformancePage() {
  return (
    <div className="feature-page">
      <PageHeading eyebrow="ACOMPANHE SUA EVOLUÇÃO" title="Desempenho" description="Uma leitura demonstrativa do aproveitamento e da distribuição por matéria." />
      <section className="performance-metrics" aria-label="Indicadores demonstrativos de desempenho">
        <article className="panel performance-metric"><div className="performance-metric-icon"><Target size={18} aria-hidden="true" /></div><span>APROVEITAMENTO MÉDIO</span><strong>78%</strong><small><ArrowUpRight size={13} aria-hidden="true" /> 16 pontos no período demonstrativo</small></article>
        <article className="panel performance-metric"><div className="performance-metric-icon perf-icon-violet"><ChartNoAxesColumnIncreasing size={18} aria-hidden="true" /></div><span>QUESTÕES RESPONDIDAS</span><strong>1.284</strong><small>em todas as matérias</small></article>
        <article className="panel performance-metric"><div className="performance-metric-icon perf-icon-green"><CircleHelp size={18} aria-hidden="true" /></div><span>MATÉRIA DE DESTAQUE</span><strong className="highlight-subject">Direito Constitucional</strong><small>84% de aproveitamento demonstrativo</small></article>
      </section>

      <div className="performance-grid">
        <section className="panel trend-panel" aria-labelledby="trend-title">
          <div className="page-panel-heading"><div><span className="section-kicker">EVOLUÇÃO ILUSTRATIVA</span><h2 id="trend-title">Aproveitamento ao longo do tempo</h2></div><span className="chart-period">6 SEMANAS</span></div>
          <div className="trend-chart-wrap"><div className="chart-y-labels" aria-hidden="true"><span>100%</span><span>75%</span><span>50%</span><span>25%</span></div><svg className="trend-chart" viewBox="0 0 400 140" preserveAspectRatio="none" role="img" aria-label={`Gráfico demonstrativo de aproveitamento em seis semanas: ${performanceHistory.map((point) => `${point.label}, ${point.score} por cento`).join('; ')}.`}>
            <line x1="20" y1="26" x2="390" y2="26" className="chart-gridline" /><line x1="20" y1="51" x2="390" y2="51" className="chart-gridline" /><line x1="20" y1="76" x2="390" y2="76" className="chart-gridline" /><line x1="20" y1="101" x2="390" y2="101" className="chart-gridline" />
            <polyline points={chartPoints} className="trend-line" />
            {performanceHistory.map((point, index) => <circle key={point.label} cx={30 + index * 70} cy={126 - point.score} r="3.5" className="trend-point"><title>{point.label}: {point.score}%</title></circle>)}
          </svg></div>
          <div className="chart-x-labels">{performanceHistory.map((point) => <span key={point.label}>{point.label}</span>)}</div>
          <div className="chart-summary"><span className="chart-legend-dot" /> Aproveitamento demonstrativo <strong>+16 pts</strong></div>
        </section>

        <section className="panel subject-performance-panel" aria-labelledby="subject-performance-title">
          <div className="page-panel-heading"><div><span className="section-kicker">COMPARATIVO</span><h2 id="subject-performance-title">Por matéria</h2></div></div>
          <div className="subject-performance-list">{performanceBySubject.map((item, index) => <article className="subject-performance-row" key={item.subject}>
            <div className="subject-performance-heading"><span className="subject-rank">0{index + 1}</span><strong>{item.subject}</strong><span className="subject-score">{item.score}%</span></div>
            <div className="performance-bar-track" role="progressbar" aria-label={`Aproveitamento demonstrativo em ${item.subject}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={item.score}><span style={{ width: `${item.score}%` }} /></div>
            <small>{item.answered} questões demonstrativas</small>
          </article>)}</div>
          <p className="demo-disclaimer">As barras exibem o aproveitamento de cada matéria e também estão identificadas com seus valores.</p>
        </section>
      </div>
      <p className="performance-note"><CircleHelp size={14} aria-hidden="true" /> Os indicadores e gráficos desta página são fictícios; nenhum desempenho real foi consultado.</p>
    </div>
  )
}
