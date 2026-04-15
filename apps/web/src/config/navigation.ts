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
  Radio,
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
      { id: 'mapa', label: 'Radar Geográfico', icon: MapPin, href: '/map' },
      { id: 'dashboard', label: 'Command Center', icon: LayoutDashboard, href: '/dashboard' },
      { id: 'oportunidades', label: 'Hunting de Editais', icon: FileText, href: '/opportunities' },
      { id: 'concorrentes', label: 'Espionagem Competitiva', icon: Building2, href: '/competitors', requiredFeature: 'competitive_intel' },
      { id: 'precos', label: 'Inteligência de Preços', icon: DollarSign, href: '/price-history' },
    ],
  },
  {
    label: 'Operações Técnicas',
    items: [
      { id: 'pipeline', label: 'Esteira de Disputas', icon: Kanban, href: '/pipeline' },
      { id: 'propostas', label: 'Fábrica de Propostas', icon: FileCheck, href: '/proposals', requiredFeature: 'proposal_generator' },
      { id: 'calculadora', label: 'Engenharia de Custos', icon: Calculator, href: '/pricing-calculator', requiredFeature: 'proposal_generator' },
      { id: 'agenda', label: 'Controle de Prazos', icon: CalendarDays, href: '/calendar' },
      { id: 'certidoes', label: 'Blindagem de Compliance', icon: ScrollText, href: '/documents', requiredFeature: 'compliance_checker' },
      { id: 'drive', label: 'Acervo Estratégico', icon: FolderOpen, href: '/drive' },
    ],
  },
  {
    label: 'Força Autônoma',
    items: [
      { id: 'robo', label: 'Agente IA de Lances', icon: Bot, href: '/bot', requiredFeature: 'bidding_bot' },
      { id: 'pregao-monitor', label: 'Monitor de Pregão', icon: Radio, href: '/pregoes', requiredFeature: 'pregao_chat_monitor' },
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
  '/pregoes': 'nav-pregao-monitor',
  '/documents': 'nav-certidoes',
  '/drive': 'nav-drive',
  '/proposals': 'nav-propostas',
  '/company': 'nav-empresa',
  '/settings': 'nav-settings',
}
