import { supabase } from './supabase'
import { logger } from './logger'

const log = logger.child({ module: 'drive-util' })

/**
 * Downloads a file from an external URL and mirrors it to the Licitagram Drive (Supabase Storage).
 * 
 * @param url External URL of the PDF
 * @param companyId Target company ID
 * @param fileName Desired filename (e.g. "certidao_federal.pdf")
 * @param userId The ID of the user who triggered the action (optional, for metadata)
 * @returns The storage path in the 'drive' bucket
 */
export async function mirrorExternalFileToDrive(
  url: string,
  companyId: string,
  fileName: string,
  userId?: string
): Promise<string | null> {
  if (!url || !url.startsWith('http')) {
    log.warn({ url }, 'Invalid URL provided for mirroring')
    return null
  }

  try {
    log.info({ url, companyId }, 'Mirroring external file to Licitagram Drive')

    // 1. Fetch the file
    const response = await fetch(url)
    if (!response.ok) {
      throw new Error(`Failed to download file from gov portal: ${response.statusText}`)
    }

    const buffer = await response.arrayBuffer()
    const fileSize = buffer.byteLength
    const rawContentType = response.headers.get('content-type') || 'application/pdf'
    // Sanitize content type (remove parameters like ; qs=0.001)
    const contentType = rawContentType.split(';')[0].trim()

    // 2. Prepare Storage Path
    const timestamp = Date.now()
    const folder = '/Certidoes'
    const sanitizedName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_')
    // Path structure: {companyId}/Certidões/{timestamp}_{filename}
    const storagePath = `${companyId}${folder}/${timestamp}_${sanitizedName}`

    // 3. Upload to Supabase Storage
    const { error: uploadError } = await supabase.storage
      .from('drive')
      .upload(storagePath, buffer, {
        contentType,
        upsert: true,
      })

    if (uploadError) {
      throw uploadError
    }

    log.info({ storagePath }, 'File uploaded to Supabase Storage')

    // 4. Register in drive_files table
    const { error: dbError } = await supabase
      .from('drive_files')
      .insert({
        company_id: companyId,
        user_id: userId || null, // Might be null for automated workers
        file_name: fileName,
        file_type: 'pdf',
        mime_type: contentType,
        file_size: fileSize,
        storage_path: storagePath,
        folder,
        category: 'certidao',
        source: userId ? 'upload' : 'certidao_auto',
        description: `Certidão espelhada automaticamente do portal do governo.`,
      })

    if (dbError) {
      log.error({ dbError }, 'Error inserting drive_files metadata')
      // Note: we don't treat DB error as fatal for the main flow, 
      // but the file won't show in the Drive UI.
    }

    return storagePath
  } catch (err: any) {
    log.error({ err: err.message, url }, 'Failed to mirror file to drive')
    return null
  }
}
