'use client'

import { useState, useEffect } from 'react'
import { createBrowserClient } from '@supabase/ssr'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { WhatsAppConnect } from '@/components/settings/WhatsAppConnect'

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
)

export default function SettingsPage() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [settings, setSettings] = useState({
    min_score: 80,
    telegram_chat_id: null as number | null,
    email: '',
    ufs_interesse: [] as string[],
    palavras_chave_filtro: [] as string[],
    notification_preferences: { telegram: true, email: false, whatsapp: true } as { telegram: boolean; email: boolean; whatsapp: boolean },
  })
  const [newUf, setNewUf] = useState('')
  const [newKeyword, setNewKeyword] = useState('')
  const [essentialKeywords, setEssentialKeywords] = useState<Set<string>>(new Set())

  useEffect(() => {
    loadSettings()
  }, [])

  async function loadSettings() {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return

    const { data } = await supabase
      .from('users')
      .select('min_score, telegram_chat_id, email, ufs_interesse, palavras_chave_filtro, notification_preferences')
      .eq('id', user.id)
      .single()

    if (data) {
      const prefs = (data.notification_preferences as { telegram?: boolean; email?: boolean; whatsapp?: boolean }) || {}
      setSettings({
        min_score: data.min_score ?? 10,
        telegram_chat_id: data.telegram_chat_id,
        email: data.email || user.email || '',
        ufs_interesse: data.ufs_interesse || [],
        palavras_chave_filtro: data.palavras_chave_filtro || [],
        notification_preferences: {
          telegram: prefs.telegram !== false,
          email: prefs.email === true,
          whatsapp: prefs.whatsapp !== false,
        },
      })
    }
    setLoading(false)
  }

  async function handleSave() {
    setSaving(true)
    setMessage('')

    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return

    const { error } = await supabase
      .from('users')
      .update({
        min_score: settings.min_score,
        ufs_interesse: settings.ufs_interesse,
        palavras_chave_filtro: settings.palavras_chave_filtro,
        notification_preferences: settings.notification_preferences,
      })
      .eq('id', user.id)

    if (error) {
      setMessage('Erro ao salvar: ' + error.message)
    } else {
      setMessage('Configurações salvas com sucesso!')
    }
    setSaving(false)
  }

  function addTag(field: 'ufs_interesse' | 'palavras_chave_filtro', value: string) {
    if (!value.trim()) return
    setSettings((prev) => ({
      ...prev,
      [field]: [...prev[field], value.trim().toUpperCase()],
    }))
  }

  function removeTag(field: 'ufs_interesse' | 'palavras_chave_filtro', index: number) {
    setSettings((prev) => ({
      ...prev,
      [field]: prev[field].filter((_, i) => i !== index),
    }))
  }

  if (loading) return <div className="text-gray-400">Carregando...</div>

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Configurações</h1>

      {message && (
        <div className="mb-4 p-3 rounded-md bg-brand/5 text-brand text-sm">{message}</div>
      )}

      <div className="space-y-6 max-w-2xl">
        {/* Notification settings */}
        <Card>
          <CardHeader>
            <CardTitle>Notificações</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Score Mínimo para Alertas</Label>
              <div className="flex items-center gap-4 mt-2">
                <input
                  type="range"
                  min="40"
                  max="100"
                  step="5"
                  value={settings.min_score}
                  onChange={(e) =>
                    setSettings({ ...settings, min_score: parseInt(e.target.value) })
                  }
                  className="flex-1 accent-brand"
                />
                <span className={`text-lg font-bold w-12 text-center ${
                  settings.min_score >= 80 ? 'text-emerald-600' : settings.min_score >= 70 ? 'text-sky-600' : settings.min_score >= 60 ? 'text-amber-600' : 'text-red-500'
                }`}>{settings.min_score}%</span>
              </div>
              <div className="flex justify-between text-[10px] text-gray-400 mt-0.5 px-1">
                <span>+ Volume</span>
                <span>+ Precisão</span>
              </div>
              <p className={`text-xs mt-2 px-2 py-1.5 rounded ${
                settings.min_score >= 80
                  ? 'bg-emerald-50 text-emerald-700'
                  : settings.min_score >= 70
                  ? 'bg-sky-50 text-sky-700'
                  : settings.min_score >= 60
                  ? 'bg-amber-50 text-amber-700'
                  : 'bg-red-50 text-red-700'
              }`}>
                {settings.min_score >= 80
                  ? '✅ Recomendado — só oportunidades com alta compatibilidade'
                  : settings.min_score >= 70
                  ? '🔍 Volume moderado — bom equilíbrio entre volume e precisão'
                  : settings.min_score >= 60
                  ? '⚠️ Volume alto — inclui oportunidades que precisam avaliação'
                  : '🔴 Volume muito alto — muitas oportunidades de baixa relevância'}
              </p>
            </div>

            <Separator />

            <div>
              <Label>Telegram</Label>
              {settings.telegram_chat_id ? (
                <div className="flex items-center gap-2 mt-2">
                  <Badge variant="secondary" className="bg-emerald-100 text-emerald-800">
                    Conectado
                  </Badge>
                  <span className="text-sm text-gray-400">
                    Chat ID: {settings.telegram_chat_id}
                  </span>
                </div>
              ) : (
                <div className="mt-2 p-3 bg-gray-100 rounded-md">
                  <p className="text-sm text-gray-500 mb-2">
                    Para receber alertas no Telegram:
                  </p>
                  <ol className="text-sm text-gray-500 list-decimal list-inside space-y-1">
                    <li>
                      Abra o Telegram e busque por <strong>@LicitagramBot</strong>
                    </li>
                    <li>
                      Envie: <code className="bg-gray-200 px-1 rounded">/start {settings.email}</code>
                    </li>
                    <li>Pronto! Você receberá alertas automaticamente.</li>
                  </ol>
                </div>
              )}
            </div>

            <Separator />

            <div>
              <Label>Canais de Notificação</Label>
              <div className="space-y-3 mt-2">
                <label className="flex items-center justify-between p-3 border rounded-md cursor-pointer hover:bg-gray-100">
                  <div className="flex items-center gap-3">
                    <div>
                      <p className="text-sm font-medium">Telegram</p>
                      <p className="text-xs text-gray-400">Receber alertas via Telegram Bot</p>
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={settings.notification_preferences.telegram}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        notification_preferences: {
                          ...settings.notification_preferences,
                          telegram: e.target.checked,
                        },
                      })
                    }
                    className="h-5 w-5 rounded border-gray-200 text-brand focus:ring-brand"
                  />
                </label>

                <label className="flex items-center justify-between p-3 border rounded-md cursor-pointer hover:bg-gray-100">
                  <div className="flex items-center gap-3">
                    <div>
                      <p className="text-sm font-medium">WhatsApp</p>
                      <p className="text-xs text-gray-400">Receber alertas via WhatsApp</p>
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={settings.notification_preferences.whatsapp ?? false}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        notification_preferences: {
                          ...settings.notification_preferences,
                          whatsapp: e.target.checked,
                        },
                      })
                    }
                    className="h-5 w-5 rounded border-gray-200 text-brand focus:ring-brand"
                  />
                </label>

                <label className="flex items-center justify-between p-3 border rounded-md cursor-not-allowed opacity-60">
                  <div className="flex items-center gap-3">
                    <div>
                      <p className="text-sm font-medium">Email</p>
                      <p className="text-xs text-gray-400">Em breve — receber alertas por email</p>
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={false}
                    disabled
                    className="h-5 w-5 rounded border-gray-200"
                  />
                </label>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* WhatsApp */}
        <WhatsAppConnect />

        {/* Filters */}
        <Card>
          <CardHeader>
            <CardTitle>Filtros de Interesse</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>UFs de Interesse</Label>
              <div className="flex gap-2 mt-1">
                <select
                  value={newUf}
                  onChange={(e) => setNewUf(e.target.value)}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="">Selecione uma UF</option>
                  {['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'].map(
                    (uf) => (
                      <option key={uf} value={uf}>{uf}</option>
                    ),
                  )}
                </select>
                <Button
                  variant="outline"
                  onClick={() => {
                    addTag('ufs_interesse', newUf)
                    setNewUf('')
                  }}
                >
                  +
                </Button>
              </div>
              {settings.ufs_interesse.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {settings.ufs_interesse.map((uf, i) => (
                    <Badge
                      key={i}
                      variant="secondary"
                      className="cursor-pointer"
                      onClick={() => removeTag('ufs_interesse', i)}
                    >
                      {uf} ×
                    </Badge>
                  ))}
                </div>
              )}
              <p className="text-xs text-gray-400 mt-1">
                Deixe vazio para receber de todos os estados
              </p>
            </div>

            <div>
              <Label>Palavras-chave</Label>
              <p className="text-xs text-gray-400 mb-1">Clique na tag para alternar entre <strong className="text-brand">essencial</strong> e desejável</p>
              <div className="flex gap-2 mt-1">
                <Input
                  value={newKeyword}
                  onChange={(e) => setNewKeyword(e.target.value)}
                  placeholder="Ex: tecnologia, consultoria"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      addTag('palavras_chave_filtro', newKeyword)
                      setEssentialKeywords(prev => new Set([...prev, newKeyword.trim().toUpperCase()]))
                      setNewKeyword('')
                    }
                  }}
                />
                <Button
                  variant="outline"
                  onClick={() => {
                    addTag('palavras_chave_filtro', newKeyword)
                    setEssentialKeywords(prev => new Set([...prev, newKeyword.trim().toUpperCase()]))
                    setNewKeyword('')
                  }}
                >
                  +
                </Button>
              </div>
              {settings.palavras_chave_filtro.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {settings.palavras_chave_filtro.map((kw, i) => {
                    const isEssential = essentialKeywords.has(kw)
                    return (
                      <div key={i} className="flex items-center gap-0.5">
                        <Badge
                          variant="secondary"
                          className={`cursor-pointer transition-all ${
                            isEssential
                              ? 'bg-brand/10 text-brand border border-brand/30 font-semibold'
                              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                          }`}
                          onClick={() => {
                            setEssentialKeywords(prev => {
                              const next = new Set(prev)
                              if (next.has(kw)) next.delete(kw)
                              else next.add(kw)
                              return next
                            })
                          }}
                        >
                          {isEssential ? '⭐ ' : ''}{kw}
                        </Badge>
                        <button
                          onClick={() => {
                            removeTag('palavras_chave_filtro', i)
                            setEssentialKeywords(prev => { const n = new Set(prev); n.delete(kw); return n })
                          }}
                          className="text-gray-400 hover:text-red-500 text-xs ml-0.5"
                        >
                          ×
                        </button>
                      </div>
                    )
                  })}
                </div>
              )}
              <div className="flex items-center gap-4 mt-2 text-[10px] text-gray-400">
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-brand inline-block" /> Essencial — peso maior no score</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-gray-300 inline-block" /> Desejável — peso normal</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Button onClick={handleSave} disabled={saving}>
          {saving ? 'Salvando...' : 'Salvar Configurações'}
        </Button>
      </div>
    </div>
  )
}
