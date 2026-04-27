export type ParsedSession = {
  id: string
  user_agent: string | null
  ip: string | null
  created_at: string | null
  updated_at: string | null
  not_after: string | null
  device: string
  browser: string
  os: string
  country: string | null
  is_current: boolean
}
