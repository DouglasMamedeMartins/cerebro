import { ChevronRight, Menu } from 'lucide-react'
import type { DashboardSection } from '../data/dashboard'

interface DashboardHeaderProps {
  section: DashboardSection
  onOpenMenu: () => void
}

export function DashboardHeader({ section, onOpenMenu }: DashboardHeaderProps) {
  return (
    <header className="topbar flex items-center">
      <button className="icon-button mobile-menu-button" onClick={onOpenMenu} aria-label="Abrir menu de navegação"><Menu size={19} aria-hidden="true" /></button>
      <div className="breadcrumb flex items-center"><span>Área do candidato</span><ChevronRight size={14} aria-hidden="true" /><strong>{section}</strong></div>
      <div className="profile-chip flex items-center" aria-label="Perfil demonstrativo, candidato"><div className="avatar">CF</div><div className="profile-copy"><strong>Candidato</strong><span>Perfil demonstrativo</span></div><span className="profile-chevron"><ChevronRight size={15} aria-hidden="true" /></span></div>
    </header>
  )
}
