import { ChevronRight, LogOut, Menu } from 'lucide-react'
import type { DashboardSection } from '../data/dashboard'
import type { Candidate } from '../services/api'

interface DashboardHeaderProps {
  section: DashboardSection
  candidate: Candidate
  onLogout: () => void
  loggingOut: boolean
  onOpenMenu: () => void
}

export function DashboardHeader({ section, candidate, onLogout, loggingOut, onOpenMenu }: DashboardHeaderProps) {
  return (
    <header className="topbar flex items-center">
      <button className="icon-button mobile-menu-button" onClick={onOpenMenu} aria-label="Abrir menu de navegação"><Menu size={19} aria-hidden="true" /></button>
      <div className="breadcrumb flex items-center"><span>Área do candidato</span><ChevronRight size={14} aria-hidden="true" /><strong>{section}</strong></div>
      <div className="profile-actions">
        <div className="profile-chip flex items-center" aria-label={`Candidato autenticado: ${candidate.name}`}>
          <div className="avatar" aria-hidden="true">{candidate.name.slice(0, 2).toUpperCase()}</div>
          <div className="profile-copy"><strong>{candidate.name}</strong><span>{candidate.email}</span></div>
        </div>
        <button className="logout-button" onClick={onLogout} disabled={loggingOut}>
          <LogOut size={15} aria-hidden="true" /><span>{loggingOut ? 'Saindo…' : 'Sair'}</span>
        </button>
      </div>
    </header>
  )
}
