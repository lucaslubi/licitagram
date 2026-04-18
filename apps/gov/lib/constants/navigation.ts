import {
  LayoutDashboard,
  ClipboardList,
  GanttChartSquare,
  BookOpen,
  History,
  Settings,
  type LucideIcon,
} from 'lucide-react'

export interface NavItem {
  label: string
  href: string
  icon: LucideIcon
  /** Cmd+K shortcut chord, e.g. "G D" for "Go to Dashboard" */
  shortcut?: string
  /** When true, item is gated by feature/plan and may be hidden. */
  gated?: boolean
}

export const PRIMARY_NAV: NavItem[] = [
  { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard, shortcut: 'G D' },
  { label: 'PCA', href: '/pca', icon: ClipboardList, shortcut: 'G P' },
  { label: 'Processos', href: '/processos', icon: GanttChartSquare, shortcut: 'G X' },
  { label: 'Catálogo', href: '/catalogo', icon: BookOpen, shortcut: 'G C' },
  { label: 'Histórico', href: '/historico', icon: History, shortcut: 'G H' },
]

export const SECONDARY_NAV: NavItem[] = [
  { label: 'Configurações', href: '/configuracoes', icon: Settings, shortcut: 'G S' },
]
