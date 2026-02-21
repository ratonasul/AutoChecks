import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
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
