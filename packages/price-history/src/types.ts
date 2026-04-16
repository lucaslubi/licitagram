// ─── Price Record ─────────────────────────────────────────────
export interface PriceRecord {
  id: string
  licitacao_id: string
  licitacao_numero: string
  licitacao_modalidade: string
  orgao_nome: string
  orgao_uf: string
  orgao_municipio: string
  fonte: 'pncp' | 'pncp_item' | 'comprasnet' | 'bec' | 'licitanet' | 'dados_abertos' | 'manual'
  item_description: string
  item_catmat_catser?: string
  item_unit: string
  item_quantity: number
  unit_price: number
  total_price: number
  supplier_name: string
  supplier_cnpj: string
  supplier_uf: string
  supplier_porte: 'ME' | 'EPP' | 'MEDIO' | 'GRANDE' | 'N/A'
  date_homologation: Date
  date_opening: Date
  is_valid: boolean
  confidence_score: number
}

// ─── Search Query ─────────────────────────────────────────────
export interface PriceSearchQuery {
  query: string
  catmat_catser?: string
  uf?: string
  municipio?: string
  modalidade?: string
  fonte?: PriceRecord['fonte']
  date_from?: Date
  date_to?: Date
  unit?: string
  min_price?: number
  max_price?: number
  supplier_porte?: PriceRecord['supplier_porte']
  page?: number
  page_size?: number
  sort_by?: 'price_asc' | 'price_desc' | 'date_desc' | 'relevance'
}

// ─── Statistics ───────────────────────────────────────────────
export interface PriceStatistics {
  count: number
  mean: number
  median: number
  min: number
  max: number
  std_deviation: number
  cv_percent: number
  percentile_25: number
  percentile_75: number
  by_uf: { key: string; count: number; median: number }[]
  by_modalidade: { key: string; count: number; median: number }[]
  by_porte: { key: string; count: number; median: number }[]
  confidence: 'alta' | 'media' | 'baixa'
}

// ─── Trend ────────────────────────────────────────────────────
export interface PriceTrend {
  points: { month: string; count: number; median: number; min: number; max: number }[]
  direction: 'subindo' | 'descendo' | 'estavel'
  variation_12m_percent: number | undefined
  projected_price_next_month: number | undefined
}

// ─── Search Result ────────────────────────────────────────────
export interface PriceSearchResult {
  records: PriceRecord[]
  statistics: PriceStatistics
  trend: PriceTrend
  total_count: number
  page: number
  page_size: number
  query: PriceSearchQuery
}

// ─── Cache ────────────────────────────────────────────────────
export interface CacheConfig {
  ttl_search: number
  ttl_statistics: number
  ttl_trend: number
  prefix: string
}

export const DEFAULT_CACHE_CONFIG: CacheConfig = {
  ttl_search: 5 * 60,       // 5 minutes
  ttl_statistics: 30 * 60,  // 30 minutes
  ttl_trend: 60 * 60,       // 1 hour
  prefix: 'ph:',
}

export interface CacheAdapter {
  get<T>(key: string): Promise<T | null>
  set<T>(key: string, value: T, ttl: number): Promise<void>
  del(key: string): Promise<void>
}
