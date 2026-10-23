import { BookOpenCheck, CalendarDays, ChartNoAxesColumnIncreasing, ClipboardList, LayoutDashboard, RotateCcw, Sparkles, X } from 'lucide-react'
import { navigationItems, type DashboardSection } from '../data/dashboard'

const icons = {
  overview: LayoutDashboard,
  plan: CalendarDays,
  questions: ClipboardList,
  reviews: RotateCcw,
  performance: ChartNoAxesColumnIncreasing,
}

interface SidebarProps {
  activeSection: DashboardSection
  mobileOpen: boolean
  onSelect: (section: DashboardSection) => void
  onClose: () => void
}

export function Sidebar({ activeSection, mobileOpen, onSelect, onClose }: SidebarProps) {
  return (
    <aside className={`sidebar flex min-h-screen flex-col ${mobileOpen ? 'sidebar-open' : ''}`} aria-label="Navegação principal">
      <div className="brand-lockup flex items-center">
        <div className="brand-mark" aria-hidden="true"><span /><span /><span /><span /></div>
        <div className="brand-name">PMDF <span>CÉREBRO</span></div>
        <button className="icon-button sidebar-close" onClick={onClose} aria-label="Fechar menu"><X size={19} aria-hidden="true" /></button>
      </div>
      <div className="sidebar-caption">ÁREA DO CANDIDATO</div>
      <nav className="main-nav flex flex-col" aria-label="Seções">
        {navigationItems.map((item) => {
          const ItemIcon = icons[item.icon]
          const selected = activeSection === item.label
          return (
            <button key={item.label} className={`nav-item flex items-center ${selected ? 'nav-item-active' : ''}`} onClick={() => onSelect(item.label)} aria-current={selected ? 'page' : undefined}>
              <ItemIcon size={19} strokeWidth={1.8} aria-hidden="true" />
              <span>{item.label}</span>
              {!selected && <span className="nav-demo-dot" aria-label="demonstrativo" />}
            </button>
          )
        })}
      </nav>
      <div className="sidebar-bottom">
        <div className="sidebar-note-icon"><BookOpenCheck size={17} aria-hidden="true" /></div>
        <p>Seu próximo passo começa com constância.</p>
        <span>Continue no seu ritmo.</span>
        <Sparkles className="sidebar-sparkle" size={15} aria-hidden="true" />
      </div>
      <div className="sidebar-footer">PMDF CÉREBRO <span>•</span> DEMONSTRAÇÃO</div>
    </aside>
  )
}
