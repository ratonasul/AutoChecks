import { NextResponse } from 'next/server';
import { OWNER_EMAIL } from '@/lib/adminAccess';

export async function assertOwnerRequest(request: Request): Promise<NextResponse | null> {
  const authHeader = request.headers.get('authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  if (!token) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) {
    return NextResponse.json({ ok: false, error: 'Supabase env not configured' }, { status: 500 });
  }

  const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${token}`,
    },
    cache: 'no-store',
  });

  if (!response.ok) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const user = (await response.json()) as { email?: string };
  if ((user.email || '').trim().toLowerCase() !== OWNER_EMAIL) {
    return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 });
  }

  return null;
}
