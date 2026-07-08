import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function getVtx() {
  return createClient(
    process.env.NEXT_PUBLIC_VERTEX_SUPABASE_URL || process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co',
    process.env.VERTEX_SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || 'fake-key'
  );
}
const supabase = getVtx();

// GET: fetch costumes filtered by brand_key
export async function GET(req: NextRequest) {
  try {
    const brand = req.nextUrl.searchParams.get('brand');
    const all = req.nextUrl.searchParams.get('all'); // include inactive
    if (!brand) return NextResponse.json({ error: 'brand is required' }, { status: 400 });

    let query = supabase.from('costumes').select('*').eq('brand_key', brand).order('sort_order', { ascending: true });
    if (!all) query = query.eq('active', true);

    const { data, error } = await query;
    if (error) throw error;
    return NextResponse.json({ costumes: data || [] });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

// POST: create a new costume
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { brand_key, name, description, photo_url, price } = body;
    if (!brand_key || !name) return NextResponse.json({ error: 'brand_key and name required' }, { status: 400 });

    const { data, error } = await supabase
      .from('costumes')
      .insert({ brand_key, name, description: description || '', photo_url: photo_url || '', price: price || 0 })
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ costume: data });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

// PUT: update a costume
export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, ...updates } = body;
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

    const { data, error } = await supabase
      .from('costumes')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ costume: data });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

// DELETE: remove a costume
export async function DELETE(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

    const { error } = await supabase.from('costumes').delete().eq('id', id);
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
