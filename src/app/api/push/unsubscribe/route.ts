import { NextResponse } from 'next/server';
import { assertOwnerRequest } from '@/lib/serverOwnerGuard';

export async function POST(request: Request) {
  try {
    const denied = await assertOwnerRequest(request);
    if (denied) return denied;

    // Currently we don't persist subscriptions, but accept the body so frontend can call
    const body = await request.json();
    const subscription = body.subscription;
    console.log('unsubscribe', subscription?.endpoint || subscription);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
