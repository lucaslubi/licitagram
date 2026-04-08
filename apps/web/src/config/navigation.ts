import {
  MapPin,
  FileText,
  LayoutDashboard,
  Building2,
  DollarSign,
  Kanban,
  FileCheck,
  Calculator,
  CalendarDays,
  ScrollText,
  FolderOpen,
  Bot,
  Building,
  CreditCard,
  Settings,
  Shield,
} from 'lucide-react'
import type { PlanFeatureKey } from '@licitagram/shared'
import type { LucideIcon } from 'lucide-react'

export interface NavItemConfig {
  id: string
  label: string
  href: string
  icon: LucideIcon
  requiredFeature?: PlanFeatureKey
}

export interface NavGroup {
  label: string
  items: NavItemConfig[]
}

export const navigationGroups: NavGroup[] = [
  {
    label: 'Inteligência',
    items: [
      { id: 'mapa', label: 'Mapa', icon: MapPin, href: '/map' },
      { id: 'oportunidades', label: 'Oportunidades', icon: FileText, href: '/opportunities' },
      { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, href: '/dashboard' },
      { id: 'concorrentes', label: 'Concorrentes', icon: Building2, href: '/competitors', requiredFeature: 'competitive_intel' },
      { id: 'precos', label: 'Preços de Mercado', icon: DollarSign, href: '/price-history' },
    ],
  },
  {
    label: 'Gestão',
    items: [
      { id: 'pipeline', label: 'Pipeline', icon: Kanban, href: '/pipeline' },
      { id: 'propostas', label: 'Propostas', icon: FileCheck, href: '/proposals', requiredFeature: 'proposal_generator' },
      { id: 'calculadora', label: 'Calculadora', icon: Calculator, href: '/pricing-calculator', requiredFeature: 'proposal_generator' },
      { id: 'agenda', label: 'Agenda', icon: CalendarDays, href: '/calendar' },
      { id: 'certidoes', label: 'Certidões', icon: ScrollText, href: '/documents', requiredFeature: 'compliance_checker' },
      { id: 'drive', label: 'Drive', icon: FolderOpen, href: '/drive' },
    ],
  },
  {
    label: 'Automação',
    items: [
      { id: 'robo', label: 'Agente IA de Lances', icon: Bot, href: '/bot', requiredFeature: 'bidding_bot' },
    ],
  },
]

export const accountItems: NavItemConfig[] = [
  { id: 'empresa', label: 'Empresa', icon: Building, href: '/company' },
  { id: 'plano', label: 'Plano', icon: CreditCard, href: '/billing' },
  { id: 'configuracoes', label: 'Configurações', icon: Settings, href: '/settings' },
]

export const adminItem: NavItemConfig = {
  id: 'admin',
  label: 'Admin',
  icon: Shield,
  href: '/admin',
}

/** Map nav hrefs to element IDs used by the onboarding tour */
export const NAV_TOUR_IDS: Record<string, string> = {
  '/map': 'nav-map',
  '/opportunities': 'nav-opportunities',
  '/pipeline': 'nav-pipeline',
  '/dashboard': 'nav-dashboard',
  '/competitors': 'nav-competitors',
  '/price-history': 'nav-precos',
  '/bot': 'nav-bot',
  '/documents': 'nav-certidoes',
  '/drive': 'nav-drive',
  '/proposals': 'nav-propostas',
  '/company': 'nav-empresa',
  '/settings': 'nav-settings',
}
