"use client";

import React, { useEffect, useState } from "react";

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export default function PushManager() {
  const [status, setStatus] = useState<string>("idle");
  const [subscription, setSubscription] = useState<any | null>(null);

  useEffect(() => {
    (async () => {
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        setStatus('unsupported');
        return;
      }

      try {
        const reg = await navigator.serviceWorker.getRegistration();
        if (!reg) return;
        const sub = await reg.pushManager.getSubscription();
        if (sub) {
          setSubscription(sub);
          setStatus('subscribed');
        }
      } catch (err) {
        console.error(err);
      }
    })();
  }, []);

  async function subscribe() {
    try {
      setStatus('registering-sw');
      const reg = await navigator.serviceWorker.register('/sw.js');

      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setStatus('permission-denied');
        return;
      }

      setStatus('subscribing');
      const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC || '';
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey),
      });

      setSubscription(sub);
      setStatus('sending-subscription');
      await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscription: sub }),
      });

      setStatus('subscribed');
    } catch (err) {
      console.error(err);
      setStatus('error');
    }
  }

  async function unsubscribe() {
    try {
      setStatus('unsubscribing');
      const reg = await navigator.serviceWorker.getRegistration();
      if (!reg) {
        setStatus('no-registration');
        return;
      }
      const sub = await reg.pushManager.getSubscription();
      if (!sub) {
        setStatus('no-subscription');
        return;
      }

      await sub.unsubscribe();
      await fetch('/api/push/unsubscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscription: sub }),
      });

      setSubscription(null);
      setStatus('unsubscribed');
    } catch (err) {
      console.error(err);
      setStatus('error');
    }
  }

  async function sendTest() {
    try {
      setStatus('sending-test');
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = subscription || (reg && (await reg.pushManager.getSubscription()));
      if (!sub) {
        setStatus('no-subscription');
        return;
      }

      await fetch('/api/push/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscription: sub }),
      });

      setStatus('test-sent');
    } catch (err) {
      console.error(err);
      setStatus('error');
    }
  }

  return (
    <div className="push-manager">
      <div className="mb-2">Push status: <strong>{status}</strong></div>
      {subscription ? (
        <div className="mb-2">
          <div className="text-sm">Subscribed</div>
          <div className="truncate text-xs">{(subscription.endpoint || subscription.toJSON?.().endpoint)?.slice(0, 80)}</div>
        </div>
      ) : (
        <div className="mb-2 text-sm">Not subscribed</div>
      )}

      <div className="flex gap-2">
        {!subscription && (
          <button onClick={subscribe} className="btn btn-primary">Subscribe</button>
        )}
        {subscription && (
          <button onClick={unsubscribe} className="btn">Unsubscribe</button>
        )}
        <button onClick={sendTest} className="btn">Send Test</button>
      </div>
    </div>
  );
}
