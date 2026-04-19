'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ImageIcon, Loader2, Trash2, Upload } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { updateOrgaoLogoAction, removeOrgaoLogoAction } from './actions'
import { createClient } from '@/lib/supabase/client'

interface Props {
  currentLogoUrl: string | null
  canEdit: boolean
  orgaoId: string
}

const MAX_SIZE_MB = 2
const ACCEPTED = 'image/png,image/jpeg,image/webp,image/svg+xml'

export function OrgaoLogoUpload({ currentLogoUrl, canEdit, orgaoId }: Props) {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, startUpload] = useTransition()
  const [removing, startRemove] = useTransition()
  const [preview, setPreview] = useState<string | null>(currentLogoUrl)

  const onPick = () => inputRef.current?.click()

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > MAX_SIZE_MB * 1024 * 1024) {
      toast.error(`Arquivo maior que ${MAX_SIZE_MB}MB`)
      return
    }
    startUpload(async () => {
      const supabase = createClient()
      const ext = file.name.split('.').pop()?.toLowerCase() ?? 'png'
      const path = `${orgaoId}/logo-${Date.now()}.${ext}`
      const { error: uploadError } = await supabase.storage
        .from('orgao-logos')
        .upload(path, file, { upsert: true, contentType: file.type })
      if (uploadError) {
        toast.error(`Falha no upload: ${uploadError.message}`)
        return
      }
      const { data: pub } = supabase.storage.from('orgao-logos').getPublicUrl(path)
      const url = pub.publicUrl
      const res = await updateOrgaoLogoAction(url)
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      setPreview(url)
      toast.success('Logomarca atualizada')
      router.refresh()
    })
    e.target.value = ''
  }

  const removeLogo = () => {
    if (!window.confirm('Remover a logomarca do órgão? Ela deixa de aparecer nos PDFs.')) return
    startRemove(async () => {
      const res = await removeOrgaoLogoAction()
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      setPreview(null)
      toast.success('Logomarca removida')
      router.refresh()
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ImageIcon className="h-4 w-4 text-primary" /> Logomarca oficial
        </CardTitle>
        <CardDescription>
          A logomarca aparece no cabeçalho dos PDFs gerados (DFD, ETP, TR, Edital, Parecer).
          PNG, JPG, WEBP ou SVG até {MAX_SIZE_MB}MB. Proporção recomendada: horizontal 3:1 ou quadrada.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-6">
          <div className="flex h-24 w-40 items-center justify-center overflow-hidden rounded-lg border border-dashed border-border bg-card/60">
            {preview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={preview} alt="Logomarca atual" className="max-h-full max-w-full object-contain" />
            ) : (
              <span className="text-xs text-muted-foreground">Sem logomarca</span>
            )}
          </div>
          <div className="space-y-2">
            <input
              ref={inputRef}
              type="file"
              accept={ACCEPTED}
              onChange={onFile}
              className="hidden"
              aria-label="Selecionar logomarca"
            />
            {canEdit ? (
              <>
                <Button onClick={onPick} disabled={uploading} variant="gradient">
                  {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                  {uploading ? 'Enviando…' : preview ? 'Trocar logomarca' : 'Enviar logomarca'}
                </Button>
                {preview && (
                  <Button onClick={removeLogo} disabled={removing} variant="outline" size="sm">
                    {removing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                    Remover
                  </Button>
                )}
              </>
            ) : (
              <p className="text-xs text-muted-foreground">
                Apenas administrador/coordenador pode alterar a logomarca.
              </p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
