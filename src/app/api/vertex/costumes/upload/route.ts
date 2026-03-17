import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const vertexUrl = process.env.NEXT_PUBLIC_VERTEX_SUPABASE_URL || '';
const vertexKey = process.env.VERTEX_SUPABASE_SERVICE_KEY || '';
const supabase = createClient(vertexUrl, vertexKey);

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File;
    const brand = formData.get('brand') as string;

    if (!file || !brand) {
      return NextResponse.json({ error: 'file and brand are required' }, { status: 400 });
    }

    const ext = file.name.split('.').pop() || 'jpg';
    const fileName = `${brand}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const { error: uploadError } = await supabase.storage
      .from('costume-photos')
      .upload(fileName, buffer, {
        contentType: file.type || 'image/jpeg',
        upsert: false,
      });

    if (uploadError) throw uploadError;

    const { data: urlData } = supabase.storage
      .from('costume-photos')
      .getPublicUrl(fileName);

    return NextResponse.json({ url: urlData.publicUrl });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
