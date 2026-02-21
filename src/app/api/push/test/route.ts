import { NextResponse } from 'next/server';
import webpush from 'web-push';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const subscription = body.subscription;

    const publicKey = process.env.VAPID_PUBLIC_KEY || process.env.NEXT_PUBLIC_VAPID_PUBLIC;
    const privateKey = process.env.VAPID_PRIVATE_KEY;
    const subject = process.env.VAPID_SUBJECT || 'mailto:you@example.com';

    if (!publicKey || !privateKey) {
      return NextResponse.json({ ok: false, error: 'VAPID keys not configured on server.' }, { status: 500 });
    }

    webpush.setVapidDetails(subject, publicKey, privateKey);

    const payload = JSON.stringify({ title: 'Test Notification', body: 'This is a test push.' });
    await webpush.sendNotification(subscription, payload);

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
