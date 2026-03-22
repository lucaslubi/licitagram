import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'No file ID' }, { status: 400 })

  // Get file info (RLS ensures company ownership)
  const { data: file } = await supabase
    .from('drive_files')
    .select('storage_path, file_name, mime_type')
    .eq('id', id)
    .single()

  if (!file) return NextResponse.json({ error: 'File not found' }, { status: 404 })

  // Generate signed URL (valid for 1 hour)
  const { data: urlData, error } = await supabase.storage
    .from('drive')
    .createSignedUrl(file.storage_path, 3600)

  if (error || !urlData) {
    return NextResponse.json({ error: 'Could not generate download URL' }, { status: 500 })
  }

  return NextResponse.json({
    url: urlData.signedUrl,
    fileName: file.file_name,
    mimeType: file.mime_type,
  })
}
