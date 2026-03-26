import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// GET - List files with filters
export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Get user's company via users table
  const { data: profile } = await supabase
    .from('users')
    .select('company_id')
    .eq('id', user.id)
    .single()
  if (!profile?.company_id) return NextResponse.json({ error: 'No company' }, { status: 400 })
  const company = { id: profile.company_id }

  const url = new URL(req.url)
  const folder = url.searchParams.get('folder') || '/'
  const category = url.searchParams.get('category')
  const search = url.searchParams.get('search')
  const tenderId = url.searchParams.get('tenderId')
  const starred = url.searchParams.get('starred')
  const sortBy = url.searchParams.get('sortBy') || 'created_at'
  const sortOrder = url.searchParams.get('sortOrder') || 'desc'
  const page = parseInt(url.searchParams.get('page') || '1')
  const limit = parseInt(url.searchParams.get('limit') || '50')

  try {
    let query = supabase
      .from('drive_files')
      .select('*', { count: 'exact' })
      .eq('company_id', company.id)

    if (folder !== 'all') query = query.eq('folder', folder)
    if (category && category !== 'all') query = query.eq('category', category)
    if (tenderId) query = query.eq('tender_id', tenderId)
    if (starred === 'true') query = query.eq('is_starred', true)
    if (search) query = query.or(`file_name.ilike.%${search}%,description.ilike.%${search}%`)

    const ascending = sortOrder === 'asc'
    query = query.order(sortBy === 'created_at' ? 'created_at' : sortBy, { ascending })
      .range((page - 1) * limit, page * limit - 1)

    const { data: files, count, error } = await query
    if (error) {
      console.error('Drive query error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Get usage stats (may not exist if no files yet)
    let usage = { total_files: 0, total_bytes: 0, total_folders: 0 }
    try {
      const { data: usageRows } = await supabase
        .from('drive_usage')
        .select('*')
        .eq('company_id', company.id)
      if (usageRows && usageRows.length > 0) {
        usage = usageRows.reduce((acc: any, row: any) => ({
          total_files: acc.total_files + (row.total_files || 0),
          total_bytes: acc.total_bytes + (row.total_bytes || 0),
          total_folders: acc.total_folders + (row.total_folders || 0),
        }), { total_files: 0, total_bytes: 0, total_folders: 0 })
      }
    } catch { /* no files yet, use defaults */ }

    // Get distinct folders
    const { data: folderData } = await supabase
      .from('drive_files')
      .select('folder')
      .eq('company_id', company.id)
      .order('folder')

    const uniqueFolders = [...new Set((folderData || []).map((f: any) => f.folder))]

    return NextResponse.json({
      files: files || [],
      total: count || 0,
      usage,
      folders: uniqueFolders,
      page,
      limit,
    })
  } catch (e: any) {
    console.error('Drive GET error:', e)
    return NextResponse.json({ error: e.message || 'Internal error' }, { status: 500 })
  }
}

// POST - Upload file
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('users')
    .select('company_id')
    .eq('id', user.id)
    .single()
  if (!profile?.company_id) return NextResponse.json({ error: 'No company' }, { status: 400 })
  const company = { id: profile.company_id }

  const formData = await req.formData()
  const file = formData.get('file') as File
  if (!file) return NextResponse.json({ error: 'No file' }, { status: 400 })

  const folder = (formData.get('folder') as string) || '/'
  const category = (formData.get('category') as string) || 'geral'
  const description = formData.get('description') as string
  const tenderId = formData.get('tenderId') as string
  const tags = formData.get('tags') as string

  // Check file size (50MB)
  if (file.size > 52428800) {
    return NextResponse.json({ error: 'File too large (max 50MB)' }, { status: 400 })
  }

  // Determine file type
  const ext = file.name.split('.').pop()?.toLowerCase() || ''
  let fileType = 'other'
  if (['pdf'].includes(ext)) fileType = 'pdf'
  else if (['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(ext)) fileType = 'image'
  else if (['doc', 'docx'].includes(ext)) fileType = 'doc'
  else if (['xls', 'xlsx', 'csv'].includes(ext)) fileType = 'spreadsheet'

  // Upload to Supabase Storage
  const timestamp = Date.now()
  const sanitizedName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
  const storagePath = `${company.id}${folder === '/' ? '' : folder}/${timestamp}_${sanitizedName}`

  const { error: uploadError } = await supabase.storage
    .from('drive')
    .upload(storagePath, file, {
      contentType: file.type,
      upsert: false,
    })

  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 })
  }

  // Create metadata record
  const { data: driveFile, error: dbError } = await supabase
    .from('drive_files')
    .insert({
      company_id: company.id,
      user_id: user.id,
      file_name: file.name,
      file_type: fileType,
      mime_type: file.type,
      file_size: file.size,
      storage_path: storagePath,
      folder,
      category,
      description: description || null,
      tender_id: tenderId || null,
      tags: tags ? tags.split(',').map(t => t.trim()) : [],
      source: 'upload',
    })
    .select()
    .single()

  if (dbError) {
    // Cleanup uploaded file on DB error
    await supabase.storage.from('drive').remove([storagePath])
    return NextResponse.json({ error: dbError.message }, { status: 500 })
  }

  return NextResponse.json({ file: driveFile })
}

// DELETE - Delete file
export async function DELETE(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await req.json()
  if (!id) return NextResponse.json({ error: 'No file ID' }, { status: 400 })

  // Get file info (RLS ensures company ownership)
  const { data: file } = await supabase
    .from('drive_files')
    .select('storage_path')
    .eq('id', id)
    .single()

  if (!file) return NextResponse.json({ error: 'File not found' }, { status: 404 })

  // Delete from storage
  await supabase.storage.from('drive').remove([file.storage_path])

  // Delete metadata
  const { error } = await supabase
    .from('drive_files')
    .delete()
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}

// PATCH - Update file metadata (star, rename, move)
export async function PATCH(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id, ...updates } = await req.json()
  if (!id) return NextResponse.json({ error: 'No file ID' }, { status: 400 })

  // Only allow specific fields to be updated
  const allowed: Record<string, unknown> = {}
  if ('is_starred' in updates) allowed.is_starred = updates.is_starred
  if ('file_name' in updates) allowed.file_name = updates.file_name
  if ('folder' in updates) allowed.folder = updates.folder
  if ('category' in updates) allowed.category = updates.category
  if ('description' in updates) allowed.description = updates.description
  if ('tags' in updates) allowed.tags = updates.tags
  allowed.updated_at = new Date().toISOString()

  const { data, error } = await supabase
    .from('drive_files')
    .update(allowed)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ file: data })
}
