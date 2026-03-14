export interface Company {
  id: string
  cnpj: string
  razao_social: string
  nome_fantasia: string | null
  cnae_principal: string | null
  cnaes_secundarios: string[]
  descricao_servicos: string | null
  porte: 'MEI' | 'ME' | 'EPP' | 'MEDIO' | 'GRANDE' | null
  uf: string | null
  municipio: string | null
  capacidade_tecnica: string[]
  certificacoes: string[]
  palavras_chave: string[]
  faturamento_anual: number | null
  num_funcionarios: number | null
  created_at: string
  updated_at: string
}

export type TenantRole = 'admin' | 'user' | 'viewer'

export type AdminPermissions = Record<string, boolean>

export interface User {
  id: string
  company_id: string | null
  full_name: string | null
  role: TenantRole
  telegram_chat_id: number | null
  notification_preferences: {
    email: boolean
    telegram: boolean
    min_score: number
  }
  min_score: number
  /** Global platform admin flag (orthogonal to tenant role) */
  is_platform_admin: boolean
  /** Granular admin permissions (e.g. { dashboard: true, clients: true }) */
  admin_permissions: AdminPermissions | null
  /** Whether this user account is active */
  is_active: boolean
  stripe_customer_id: string | null
  created_at: string
  updated_at: string | null
}
