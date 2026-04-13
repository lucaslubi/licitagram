/**
 * Save a file to the Drive Licitagram
 */
export async function saveToDrive(options: {
  file: File | Blob
  fileName: string
  category: string
  description?: string
  tenderId?: string
  tags?: string[]
}): Promise<{ success: boolean; fileId?: string; error?: string }> {
  const formData = new FormData()

  const file =
    options.file instanceof File
      ? options.file
      : new File([options.file], options.fileName, { type: options.file.type })

  formData.append('file', file)
  formData.append('category', options.category)
  if (options.description) formData.append('description', options.description)
  if (options.tenderId) formData.append('tenderId', options.tenderId)
  if (options.tags?.length) formData.append('tags', options.tags.join(','))

  try {
    const res = await fetch('/api/drive', { method: 'POST', body: formData })
    const data = await res.json()
    if (!res.ok) return { success: false, error: data.error }
    return { success: true, fileId: data.file?.id }
  } catch {
    return { success: false, error: 'Falha ao salvar no Drive' }
  }
}

/** @deprecated Import from '@/lib/format' instead */
export { formatFileSize, formatDatePtBr } from '@/lib/format'
