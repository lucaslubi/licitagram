import { createClient } from '@/lib/supabase/server'

/**
 * Downloads a file from an external URL and mirrors it to the Licitagram Drive (Supabase Storage).
 * Server-side version for Next.js routes.
 * 
 * @param url External URL of the PDF
 * @param companyId Target company ID
 * @param fileName Desired filename
 * @returns The storage path in the 'drive' bucket
 */
export async function mirrorExternalFileToDrive(
  url: string,
  companyId: string,
  fileName: string
): Promise<string | null> {
  if (!url || !url.startsWith('http')) return null

  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null

    // 1. Fetch file
    const response = await fetch(url)
    if (!response.ok) throw new Error('Download failed')

    const buffer = await response.arrayBuffer()
    const fileSize = buffer.byteLength
    const contentType = response.headers.get('content-type') || 'application/pdf'

    // 2. Prepare Path
    const timestamp = Date.now()
    const folder = '/Certidões'
    const sanitizedName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_')
    const storagePath = `${companyId}${folder}/${timestamp}_${sanitizedName}`

    // 3. Upload
    const { error: uploadError } = await supabase.storage
      .from('drive')
      .upload(storagePath, buffer, {
        contentType,
        upsert: true,
      })

    if (uploadError) throw uploadError

    // 4. Metadata
    await supabase
      .from('drive_files')
      .insert({
        company_id: companyId,
        user_id: user.id,
        file_name: fileName,
        file_type: 'pdf',
        mime_type: contentType,
        file_size: fileSize,
        storage_path: storagePath,
        folder,
        category: 'certidao',
        source: 'upload',
        description: 'Certidão espelhada automaticamente.',
      })

    return storagePath
  } catch (err) {
    console.error('[mirrorExternalFileToDrive] error:', err)
    return null
  }
}
