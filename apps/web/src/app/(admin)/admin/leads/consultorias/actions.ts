'use server'

import { requirePlatformAdmin } from '@/lib/auth-helpers'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'

const VALID_STATUS = new Set(['new', 'contacted', 'qualified', 'converted', 'rejected'])

export async function updateConsultancyLeadStatus(
  leadId: string,
  status: 'new' | 'contacted' | 'qualified' | 'converted' | 'rejected',
): Promise<{ ok: boolean; error?: string }> {
  await requirePlatformAdmin()

  if (!VALID_STATUS.has(status)) {
    return { ok: false, error: 'Status inválido' }
  }

  const supabase = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const { error } = await supabase
    .from('consultancy_leads')
    .update({ status })
    .eq('id', leadId)

  if (error) {
    return { ok: false, error: error.message }
  }

  revalidatePath('/admin/leads/consultorias')
  return { ok: true }
}
