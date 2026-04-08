import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const path = req.nextUrl.searchParams.get('path')
    if (!path) return NextResponse.json({ error: 'No file path' }, { status: 400 })

    // Generate signed URL (valid for 1 hour)
    const { data: urlData, error } = await supabase.storage
      .from('drive')
      .createSignedUrl(path, 3600)

    if (error || !urlData) {
      return NextResponse.json({ error: 'Could not generate download URL' }, { status: 500 })
    }

    return NextResponse.redirect(urlData.signedUrl)
  } catch (error) {
    console.error('[GET /api/drive/proxy]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
