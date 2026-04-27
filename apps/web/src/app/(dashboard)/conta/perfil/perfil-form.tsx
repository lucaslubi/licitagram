'use client'

import { useState, useTransition, useRef, useMemo } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { updateProfile } from '@/actions/conta/update-profile'
import { uploadAvatar } from '@/actions/conta/upload-avatar'

type Initial = {
  full_name: string
  email: string
  phone: string
  timezone: string | null
  language: string
  avatar_url: string | null
  company_name: string | null
}

const COMMON_TIMEZONES = [
  'America/Sao_Paulo',
  'America/Manaus',
  'America/Belem',
  'America/Recife',
  'America/Fortaleza',
  'America/Cuiaba',
  'America/Rio_Branco',
  'America/Noronha',
  'UTC',
]

function formatPhoneBR(digits: string): string {
  const d = digits.replace(/\D/g, '').slice(0, 13) // up to +55 + 11 digits
  if (!d) return ''
  // Strip optional leading 55
  let rest = d
  let prefix = ''
  if (d.startsWith('55') && d.length > 11) {
    rest = d.slice(2)
    prefix = '+55 '
  }
  if (rest.length <= 2) return `${prefix}(${rest}`
  if (rest.length <= 7) return `${prefix}(${rest.slice(0, 2)}) ${rest.slice(2)}`
  if (rest.length <= 10)
    return `${prefix}(${rest.slice(0, 2)}) ${rest.slice(2, 6)}-${rest.slice(6)}`
  return `${prefix}(${rest.slice(0, 2)}) ${rest.slice(2, 7)}-${rest.slice(7, 11)}`
}

function detectBrowserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Sao_Paulo'
  } catch {
    return 'America/Sao_Paulo'
  }
}

export function PerfilForm({
  initial,
  migrationApplied,
}: {
  initial: Initial
  migrationApplied: boolean
}) {
  const [fullName, setFullName] = useState(initial.full_name)
  const [phone, setPhone] = useState(formatPhoneBR(initial.phone))
  const [language, setLanguage] = useState(initial.language || 'pt-BR')
  const [timezone, setTimezone] = useState<string>(initial.timezone || detectBrowserTimezone())
  const [avatarUrl, setAvatarUrl] = useState<string | null>(initial.avatar_url)

  const [pending, startTransition] = useTransition()
  const [uploading, setUploading] = useState(false)
  const [feedback, setFeedback] = useState<{ kind: 'ok' | 'err'; msg: string } | null>(null)

  const fileInput = useRef<HTMLInputElement>(null)

  const tzOptions = useMemo(() => {
    const set = new Set<string>(COMMON_TIMEZONES)
    if (timezone) set.add(timezone)
    return Array.from(set).sort()
  }, [timezone])

  function handlePhoneChange(e: React.ChangeEvent<HTMLInputElement>) {
    setPhone(formatPhoneBR(e.target.value))
  }

  async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setFeedback(null)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await uploadAvatar(fd)
      if (res.success && res.url) {
        setAvatarUrl(res.url)
        setFeedback({
          kind: res.error ? 'err' : 'ok',
          msg: res.error ? `Imagem enviada, mas não foi possível salvar URL (${res.error}).` : 'Avatar atualizado.',
        })
      } else {
        setFeedback({ kind: 'err', msg: res.error || 'Falha ao enviar avatar.' })
      }
    } finally {
      setUploading(false)
      if (fileInput.current) fileInput.current.value = ''
    }
  }

  function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setFeedback(null)
    startTransition(async () => {
      const payload = {
        full_name: fullName.trim() || null,
        ...(migrationApplied
          ? {
              phone: phone || null,
              timezone,
              language,
            }
          : {}),
      }
      const res = await updateProfile(payload)
      setFeedback(
        res.success
          ? { kind: 'ok', msg: 'Perfil atualizado.' }
          : { kind: 'err', msg: res.error || 'Falha ao salvar.' },
      )
    })
  }

  const initials = (fullName || initial.email || '?').trim().slice(0, 1).toUpperCase()

  return (
    <form onSubmit={handleSave} className="space-y-6">
      {/* Avatar */}
      <section className="flex items-start gap-4">
        <div className="w-16 h-16 rounded-full bg-secondary border border-border overflow-hidden flex items-center justify-center text-lg font-semibold">
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
          ) : (
            <span>{initials}</span>
          )}
        </div>
        <div className="space-y-2">
          <input
            ref={fileInput}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={handleAvatarChange}
          />
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={uploading}
            onClick={() => fileInput.current?.click()}
          >
            {uploading ? 'Enviando…' : avatarUrl ? 'Trocar avatar' : 'Enviar avatar'}
          </Button>
          <p className="text-xs text-muted-foreground">JPG, PNG ou WEBP. Máx 2 MB.</p>
        </div>
      </section>

      {/* Full name */}
      <div className="space-y-2">
        <Label htmlFor="full_name">Nome completo</Label>
        <Input
          id="full_name"
          name="full_name"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          maxLength={120}
          placeholder="Como você quer ser chamado"
        />
      </div>

      {/* Email (read-only) */}
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <div className="flex gap-2">
          <Input id="email" value={initial.email} readOnly className="flex-1 opacity-70" />
          <Button type="button" variant="secondary" disabled title="Em breve">
            Alterar email
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">Mudança de email com confirmação — em breve.</p>
      </div>

      {/* Phone */}
      <div className="space-y-2">
        <Label htmlFor="phone">Telefone</Label>
        <Input
          id="phone"
          name="phone"
          value={phone}
          onChange={handlePhoneChange}
          placeholder="+55 (11) 91234-5678"
          inputMode="tel"
          disabled={!migrationApplied}
        />
      </div>

      {/* Company (read-only link) */}
      <div className="space-y-2">
        <Label>Empresa principal</Label>
        <div className="flex gap-2 items-center">
          <Input value={initial.company_name ?? '—'} readOnly className="flex-1 opacity-70" />
          <a href="/company">
            <Button type="button" variant="secondary" size="default">
              Editar empresa
            </Button>
          </a>
        </div>
      </div>

      {/* Language */}
      <div className="space-y-2">
        <Label htmlFor="language">Idioma</Label>
        <select
          id="language"
          value={language}
          onChange={(e) => setLanguage(e.target.value)}
          disabled={!migrationApplied}
          className="flex h-10 w-full rounded-lg border border-input bg-background px-3.5 py-2 text-sm"
        >
          <option value="pt-BR">Português (Brasil)</option>
          <option value="en" disabled>
            English (em breve)
          </option>
        </select>
        <Badge variant="secondary" className="text-[10px]">
          en em breve
        </Badge>
      </div>

      {/* Timezone */}
      <div className="space-y-2">
        <Label htmlFor="timezone">Fuso horário</Label>
        <select
          id="timezone"
          value={timezone}
          onChange={(e) => setTimezone(e.target.value)}
          disabled={!migrationApplied}
          className="flex h-10 w-full rounded-lg border border-input bg-background px-3.5 py-2 text-sm"
        >
          {tzOptions.map((tz) => (
            <option key={tz} value={tz}>
              {tz}
            </option>
          ))}
        </select>
        <p className="text-xs text-muted-foreground">
          Detectado automaticamente do navegador. Você pode trocar se preferir.
        </p>
      </div>

      <div className="flex items-center gap-3 pt-2">
        <Button type="submit" disabled={pending}>
          {pending ? 'Salvando…' : 'Salvar'}
        </Button>
        {feedback ? (
          <span className={feedback.kind === 'ok' ? 'text-xs text-green-400' : 'text-xs text-red-400'}>
            {feedback.msg}
          </span>
        ) : null}
      </div>
    </form>
  )
}
