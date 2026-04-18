'use server'

import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { mfaChallengeSchema } from '@/lib/validations/auth'

interface EnrollResult {
  ok: true
  factorId: string
  qrSvg: string
  secret: string
}

interface EnrollError {
  ok: false
  error: string
}

/**
 * Starts a TOTP enrollment. Returns the QR code (SVG, ready to render) and the
 * shared secret (for users who can't scan). The factor is "unverified" until
 * the user submits a valid code via verifyEnrollmentAction.
 */
export async function startEnrollmentAction(): Promise<EnrollResult | EnrollError> {
  try {
    const supabase = createClient()
    const { data, error } = await supabase.auth.mfa.enroll({
      factorType: 'totp',
      friendlyName: `LicitaGov · ${new Date().toISOString().slice(0, 10)}`,
    })
    if (error) return { ok: false, error: error.message }
    return {
      ok: true,
      factorId: data.id,
      qrSvg: data.totp.qr_code,
      secret: data.totp.secret,
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erro desconhecido' }
  }
}

const verifySchema = z.object({
  factorId: z.string().uuid(),
  code: mfaChallengeSchema.shape.code,
})

export async function verifyEnrollmentAction(
  input: z.infer<typeof verifySchema>,
): Promise<{ ok: true } | EnrollError> {
  try {
    const { factorId, code } = verifySchema.parse(input)
    const supabase = createClient()
    const { data: ch, error: chErr } = await supabase.auth.mfa.challenge({ factorId })
    if (chErr) return { ok: false, error: chErr.message }
    const { error } = await supabase.auth.mfa.verify({ factorId, challengeId: ch.id, code })
    if (error) return { ok: false, error: error.message }
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erro desconhecido' }
  }
}

export async function unenrollAction(factorId: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const supabase = createClient()
    const { error } = await supabase.auth.mfa.unenroll({ factorId })
    if (error) return { ok: false, error: error.message }
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erro desconhecido' }
  }
}
