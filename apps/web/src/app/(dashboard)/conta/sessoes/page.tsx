import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { SessoesList } from './sessoes-list'
import type { ParsedSession } from './types'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Sessões · Licitagram' }

type SessionRow = {
  id: string
  user_agent: string | null
  ip: string | null
  created_at: string | null
  updated_at: string | null
  not_after: string | null
}

const BROWSER_RX: [RegExp, string][] = [
  [/Edg\//, 'Edge'],
  [/OPR\//, 'Opera'],
  [/Firefox\//, 'Firefox'],
  [/Chrome\//, 'Chrome'],
  [/Safari\//, 'Safari'],
]

const OS_RX: [RegExp, string][] = [
  [/iPhone|iOS/, 'iOS'],
  [/iPad/, 'iPadOS'],
  [/Android/, 'Android'],
  [/Mac OS X|Macintosh/, 'macOS'],
  [/Windows/, 'Windows'],
  [/Linux/, 'Linux'],
]

function parseUA(ua: string | null): { device: string; browser: string; os: string } {
  if (!ua) return { device: 'Desconhecido', browser: '—', os: '—' }
  let browser = '—'
  for (const [rx, name] of BROWSER_RX) if (rx.test(ua)) { browser = name; break }
  let os = '—'
  for (const [rx, name] of OS_RX) if (rx.test(ua)) { os = name; break }
  const device = /Mobile|iPhone|Android.*Mobile/.test(ua)
    ? 'Mobile'
    : /Tablet|iPad/.test(ua)
      ? 'Tablet'
      : 'Desktop'
  return { device, browser, os }
}

export default async function SessoesPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Identify the current session
  const {
    data: { session: currentSession },
  } = await supabase.auth.getSession()
  // session.user.session_id-style — supabase-js exposes the access-token claim `session_id`
  // by decoding the JWT. Fallback: undefined → no row will be marked current.
  let currentSessionId: string | null = null
  if (currentSession?.access_token) {
    try {
      const payload = JSON.parse(
        Buffer.from(currentSession.access_token.split('.')[1], 'base64').toString('utf8'),
      )
      currentSessionId = (payload.session_id as string) || null
    } catch {
      currentSessionId = null
    }
  }

  // Geo (best effort — only works on Vercel edge)
  const h = await headers()
  const country =
    h.get('x-vercel-ip-country') || h.get('cf-ipcountry') || h.get('x-country-code') || null

  let sessions: ParsedSession[] = []
  let migrationApplied = true
  let listError: string | null = null

  const rpcRes = await supabase.rpc('list_my_sessions')
  if (rpcRes.error) {
    migrationApplied = false
    listError = rpcRes.error.message
  } else {
    const rows = (rpcRes.data || []) as SessionRow[]
    sessions = rows.map((row) => {
      const ua = parseUA(row.user_agent)
      return {
        ...row,
        ...ua,
        country: country, // Same geo for all rows (no IP→geo lookup yet)
        is_current: row.id === currentSessionId,
      }
    })
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Sessões</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Dispositivos com login ativo na sua conta. Encerre os que você não reconhece.
        </p>
      </div>

      {!migrationApplied ? (
        <div className="rounded-md border border-yellow-500/30 bg-yellow-500/5 p-3 text-xs text-yellow-200">
          Listagem detalhada de sessões depende da migration Wave 2 (RPC{' '}
          <code className="px-1 bg-black/30 rounded">list_my_sessions</code>). Você ainda
          pode encerrar todas as outras sessões abaixo (fallback).
          {listError ? <span className="block mt-1 opacity-70">RPC error: {listError}</span> : null}
        </div>
      ) : null}

      <SessoesList
        sessions={sessions}
        currentSessionId={currentSessionId}
        canList={migrationApplied}
      />
    </div>
  )
}
