'use client'

import { useState, useTransition } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { updateNotifPrefs } from '@/actions/conta/update-notif-prefs'
import { friendlyError } from '@/lib/error-messages'

export type NotifPrefs = {
  preset: 'alta_qualidade' | 'equilibrado' | 'tudo' | 'custom'
  min_score: number
  max_per_day: number
  quiet_start: string
  quiet_end: string
  channels: string[]
  engines: string[]
  excluded_terms: string[]
  daily_digest: boolean
}

export type ChannelStatus = { email: boolean; telegram: boolean; whatsapp: boolean }

const UFS = [
  'AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB',
  'PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO',
]

const PRESET_DEFAULTS: Record<NotifPrefs['preset'], { min_score: number; max_per_day: number; label: string; hint: string }> = {
  alta_qualidade: { min_score: 70, max_per_day: 10, label: 'Alta qualidade', hint: 'score ≥ 70, top 10/dia' },
  equilibrado:    { min_score: 55, max_per_day: 30, label: 'Equilibrado',    hint: 'score ≥ 55, top 30/dia' },
  tudo:           { min_score: 40, max_per_day: 200, label: 'Tudo',          hint: 'score ≥ 40, sem cap' },
  custom:         { min_score: 55, max_per_day: 30, label: 'Personalizado',  hint: 'controles avançados abaixo' },
}

// Narrativa cliente: tudo é IA. Engines internos descritos por benefício, não por nome técnico.
const ENGINE_LABELS: Record<string, string> = {
  pgvector_rules: 'IA semântica (entende o contexto do negócio)',
  keyword: 'IA por termos-chave (perfil + objeto da licitação)',
  semantic: 'IA legacy (modelo anterior)',
}

export function NotificacoesForm({
  initial,
  defaults,
  channelStatus,
}: {
  initial: NotifPrefs
  defaults: NotifPrefs
  channelStatus: ChannelStatus
}) {
  const [prefs, setPrefs] = useState<NotifPrefs>(initial)
  const [excludedRaw, setExcludedRaw] = useState(initial.excluded_terms.join('\n'))
  const [pending, startTransition] = useTransition()
  const [message, setMessage] = useState('')
  const [ufs, setUfs] = useState<string[]>([]) // local-only, not persisted yet (matches companies.ufs_interesse, settings page handles that)

  function applyPreset(p: NotifPrefs['preset']) {
    if (p === 'custom') {
      setPrefs((s) => ({ ...s, preset: 'custom' }))
      return
    }
    const d = PRESET_DEFAULTS[p]
    setPrefs((s) => ({ ...s, preset: p, min_score: d.min_score, max_per_day: d.max_per_day }))
  }

  function markCustom(patch: Partial<NotifPrefs>) {
    setPrefs((s) => ({ ...s, ...patch, preset: 'custom' }))
  }

  function toggleArr(arr: string[], v: string): string[] {
    return arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]
  }

  function restoreDefault() {
    setPrefs(defaults)
    setExcludedRaw(defaults.excluded_terms.join('\n'))
  }

  function save() {
    setMessage('')
    const excluded_terms = excludedRaw
      .split(/[\n,]+/)
      .map((t) => t.trim())
      .filter(Boolean)
    const payload = { ...prefs, excluded_terms }
    startTransition(async () => {
      const res = await updateNotifPrefs(payload)
      setMessage(
        res.success
          ? 'Preferências salvas.'
          : `Erro: ${res.error ? friendlyError(res.error) : 'Falha ao salvar.'}`,
      )
    })
  }

  return (
    <div className="space-y-6">
      {/* Presets */}
      <Card>
        <CardHeader>
          <CardTitle>Preset de qualidade</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {(Object.keys(PRESET_DEFAULTS) as NotifPrefs['preset'][]).map((p) => {
            const d = PRESET_DEFAULTS[p]
            const active = prefs.preset === p
            return (
              <label key={p} className={`flex items-start gap-3 p-3 rounded-md border cursor-pointer ${active ? 'border-primary bg-primary/5' : 'border-border'}`}>
                <input
                  type="radio"
                  name="preset"
                  className="mt-1"
                  checked={active}
                  onChange={() => applyPreset(p)}
                />
                <div>
                  <div className="font-medium">{d.label}</div>
                  <div className="text-sm text-muted-foreground">{d.hint}</div>
                </div>
              </label>
            )
          })}
        </CardContent>
      </Card>

      {/* Score mínimo */}
      <Card>
        <CardHeader>
          <CardTitle>Score mínimo de notificação</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <input
              type="range"
              min={40}
              max={100}
              value={prefs.min_score}
              onChange={(e) => markCustom({ min_score: Number(e.target.value) })}
              className="flex-1"
            />
            <span className="w-12 text-right tabular-nums font-medium">{prefs.min_score}</span>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Apenas oportunidades com score igual ou superior viram notificação.
          </p>
        </CardContent>
      </Card>

      {/* Engines */}
      <Card>
        <CardHeader>
          <CardTitle>Engines de matching aceitos</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {(['pgvector_rules', 'keyword', 'semantic'] as const).map((e) => (
            <label key={e} className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={prefs.engines.includes(e)}
                onChange={() => markCustom({ engines: toggleArr(prefs.engines, e) })}
              />
              <span>{ENGINE_LABELS[e]}</span>
            </label>
          ))}
        </CardContent>
      </Card>

      {/* UFs */}
      <Card>
        <CardHeader>
          <CardTitle>UFs de interesse</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground mb-3">
            Filtro adicional. Vazio = todas as UFs (o filtro principal continua em Configurações).
          </p>
          <div className="flex flex-wrap gap-2 mb-3">
            {ufs.map((u) => (
              <Badge key={u} variant="secondary" className="cursor-pointer" onClick={() => setUfs(ufs.filter((x) => x !== u))}>
                {u} ✕
              </Badge>
            ))}
            {ufs.length === 0 && <span className="text-sm text-muted-foreground">Nenhuma UF selecionada</span>}
          </div>
          <div className="flex flex-wrap gap-1">
            {UFS.filter((u) => !ufs.includes(u)).map((u) => (
              <button
                key={u}
                type="button"
                className="px-2 py-1 text-xs border rounded hover:bg-accent"
                onClick={() => setUfs([...ufs, u])}
              >
                {u}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Limite diário */}
      <Card>
        <CardHeader>
          <CardTitle>Limite diário de notificações</CardTitle>
        </CardHeader>
        <CardContent>
          <Input
            type="number"
            min={1}
            max={200}
            value={prefs.max_per_day}
            onChange={(e) => markCustom({ max_per_day: Math.max(1, Math.min(200, Number(e.target.value) || 1)) })}
            className="w-32"
          />
        </CardContent>
      </Card>

      {/* Canais */}
      <Card>
        <CardHeader>
          <CardTitle>Canais</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {(['email', 'whatsapp', 'telegram'] as const).map((c) => {
            const connected = channelStatus[c]
            return (
              <label key={c} className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={prefs.channels.includes(c)}
                    onChange={() => markCustom({ channels: toggleArr(prefs.channels, c) })}
                    disabled={!connected}
                  />
                  <span className="capitalize">{c}</span>
                </div>
                {connected ? (
                  <Badge variant="secondary">conectado</Badge>
                ) : (
                  <Badge variant="outline">não conectado</Badge>
                )}
              </label>
            )
          })}
        </CardContent>
      </Card>

      {/* Janela de silêncio */}
      <Card>
        <CardHeader>
          <CardTitle>Janela de silêncio</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Não enviar notificações nesse intervalo (horário do servidor, UTC).
          </p>
          <div className="flex items-center gap-3">
            <div>
              <Label htmlFor="quiet_start" className="text-xs">Início</Label>
              <Input
                id="quiet_start"
                type="time"
                value={prefs.quiet_start}
                onChange={(e) => markCustom({ quiet_start: e.target.value })}
                className="w-32"
              />
            </div>
            <div>
              <Label htmlFor="quiet_end" className="text-xs">Fim</Label>
              <Input
                id="quiet_end"
                type="time"
                value={prefs.quiet_end}
                onChange={(e) => markCustom({ quiet_end: e.target.value })}
                className="w-32"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Excluded terms */}
      <Card>
        <CardHeader>
          <CardTitle>Palavras de exclusão</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground mb-2">
            Uma por linha (ou separadas por vírgula). Oportunidades que contêm qualquer destas serão filtradas.
          </p>
          <textarea
            value={excludedRaw}
            onChange={(e) => {
              setExcludedRaw(e.target.value)
              setPrefs((s) => ({ ...s, preset: 'custom' }))
            }}
            rows={4}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            placeholder="ex.: medicamentos&#10;hospitalar&#10;cirúrgico"
          />
        </CardContent>
      </Card>

      {/* Daily digest */}
      <Card>
        <CardHeader>
          <CardTitle>Resumo diário</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-between">
          <div>
            <div className="font-medium">Receber digest diário</div>
            <div className="text-sm text-muted-foreground">Resumo das oportunidades do dia (manhã).</div>
          </div>
          <Switch
            checked={prefs.daily_digest}
            onCheckedChange={(v) => markCustom({ daily_digest: v })}
          />
        </CardContent>
      </Card>

      <div className="flex items-center gap-3 sticky bottom-0 bg-background py-4">
        <Button onClick={save} disabled={pending}>
          {pending ? 'Salvando...' : 'Salvar'}
        </Button>
        <Button variant="outline" onClick={restoreDefault} disabled={pending}>
          Restaurar default
        </Button>
        {message && (
          <span className={`text-sm ${message.startsWith('Erro') ? 'text-destructive' : 'text-green-600'}`}>
            {message}
          </span>
        )}
      </div>
    </div>
  )
}
