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

export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`
}

export function formatDatePtBr(date: string | Date): string {
  const d = new Date(date)
  const months = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`
}
