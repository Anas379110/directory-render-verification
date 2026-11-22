import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '../../../lib/supabase/server';

export async function GET() {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.from('categories').select('*');
  if (error) {
    return NextResponse.json({ error: 'تعذر تحميل التصنيفات' }, { status: 500 });
  }
  return NextResponse.json({ data });
}
