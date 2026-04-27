'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

const MAX_BYTES = 2 * 1024 * 1024 // 2 MB
const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp'])

export async function uploadAvatar(formData: FormData): Promise<{ success: boolean; url?: string; error?: string }> {
  const file = formData.get('file')
  if (!(file instanceof File)) return { success: false, error: 'no_file' }
  if (file.size > MAX_BYTES) return { success: false, error: 'file_too_large' }
  if (!ALLOWED.has(file.type)) return { success: false, error: 'unsupported_type' }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'not_authenticated' }

  const ext =
    file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg'
  const path = `${user.id}/avatar.${ext}`

  const arrBuf = await file.arrayBuffer()
  const { error: upErr } = await supabase.storage.from('avatars').upload(path, arrBuf, {
    upsert: true,
    contentType: file.type,
    cacheControl: '3600',
  })
  if (upErr) return { success: false, error: upErr.message }

  const { data: pub } = supabase.storage.from('avatars').getPublicUrl(path)
  const publicUrl = `${pub.publicUrl}?v=${Date.now()}` // bust CDN cache after re-upload

  const { error: updErr } = await supabase
    .from('users')
    .update({ avatar_url: publicUrl })
    .eq('id', user.id)
  if (updErr) {
    // column may not exist yet (migration pending) — return the URL anyway so
    // the client can still display it from session state.
    return { success: true, url: publicUrl, error: updErr.message }
  }

  revalidatePath('/conta/perfil')
  revalidatePath('/conta')
  return { success: true, url: publicUrl }
}
