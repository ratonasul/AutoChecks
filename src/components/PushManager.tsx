"use client";

import React, { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { scheduleRuntimeExpiryReminders } from "@/services/reminders/runtimeReminderScheduler";
import { getSupabaseClient, isSupabaseConfigured } from "@/lib/supabaseClient";

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
  const [subscription, setSubscription] = useState<PushSubscription | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [isPushAvailable, setIsPushAvailable] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  async function getAuthHeaders(): Promise<Record<string, string>> {
    if (!isSupabaseConfigured()) return {};
    const supabase = getSupabaseClient();
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return {};
    return { Authorization: `Bearer ${token}` };
  }

  function clearTimers() {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setCountdown(null);
  }

  useEffect(() => {
    (async () => {
      const pushSupported =
        typeof window !== "undefined" &&
        window.isSecureContext &&
        "serviceWorker" in navigator &&
        "PushManager" in window;

      setIsPushAvailable(pushSupported);

      if (!pushSupported) {
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

    return () => {
      clearTimers();
    };
  }, []);

  async function subscribe() {
    if (!isPushAvailable || !navigator.serviceWorker) {
      setStatus("unsupported");
      toast("Push notifications are not supported in this browser/context.");
      return;
    }

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
        headers: { 'Content-Type': 'application/json', ...(await getAuthHeaders()) },
        body: JSON.stringify({ subscription: sub }),
      });

      setStatus('subscribed');
    } catch (err) {
      console.error(err);
      setStatus('error');
    }
  }

  async function unsubscribe() {
    if (!isPushAvailable || !navigator.serviceWorker) {
      setStatus("unsupported");
      return;
    }

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
        headers: { 'Content-Type': 'application/json', ...(await getAuthHeaders()) },
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
    if (!isPushAvailable || !navigator.serviceWorker) {
      setStatus("unsupported");
      return;
    }

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
        headers: { 'Content-Type': 'application/json', ...(await getAuthHeaders()) },
        body: JSON.stringify({ subscription: sub }),
      });

      setStatus('test-sent');
      toast('Test push sent');
    } catch (err) {
      console.error(err);
      setStatus('error');
    }
  }

  async function scheduleLogicTest() {
    if (!isPushAvailable || !navigator.serviceWorker) {
      setStatus("unsupported");
      return;
    }

    try {
      setStatus("scheduling-test");
      const fireAt = new Date(Date.now() + 60_000);
      const ids = await scheduleRuntimeExpiryReminders({
        // leadDays 0 means trigger on the same calendar day at notifyHour:notifyMinute.
        expiryMillis: fireAt.getTime(),
        notificationIdPrefix: "manual-reminder-test",
        settings: {
          leadDays: [0],
          notifyHour: fireAt.getHours(),
          notifyMinute: fireAt.getMinutes(),
        },
        onScheduled: (_id, triggerAtMillis) => {
          const triggerAt = new Date(triggerAtMillis).toLocaleTimeString();
          toast(`Reminder logic test scheduled for ${triggerAt}`);
        },
      });

      if (ids.length === 0) {
        setStatus("no-future-reminders");
        toast("No future trigger time found; try again at the start of the next minute.");
        return;
      }

      setStatus("test-scheduled");
    } catch (err) {
      console.error(err);
      setStatus("error");
    }
  }

  function sendTestWithDelay() {
    if (countdown !== null) return;

    setStatus('test-scheduled');
    setCountdown(5);

    let remaining = 5;
    intervalRef.current = setInterval(() => {
      remaining -= 1;
      if (remaining > 0) {
        setCountdown(remaining);
      }
    }, 1000);

    timeoutRef.current = setTimeout(async () => {
      clearTimers();
      await sendTest();
    }, 5000);
  }

  return (
    <div className="push-manager space-y-3">
      <div className="text-sm">Push status: <strong>{status}</strong></div>
      {subscription ? (
        <div>
          <div className="text-sm">Subscribed</div>
          <div className="max-w-full break-all whitespace-normal text-xs leading-tight">
            {(subscription.endpoint || subscription.toJSON?.().endpoint)?.slice(0, 180)}
          </div>
        </div>
      ) : (
        <div className="text-sm">Not subscribed</div>
      )}

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        {!subscription && (
          <Button type="button" onClick={subscribe} disabled={!isPushAvailable} className="w-full sm:w-auto">
            Subscribe
          </Button>
        )}
        {subscription && (
          <Button
            type="button"
            variant="outline"
            onClick={unsubscribe}
            disabled={!isPushAvailable}
            className="w-full sm:w-auto"
          >
            Unsubscribe
          </Button>
        )}
        <Button
          type="button"
          variant="secondary"
          onClick={sendTestWithDelay}
          disabled={!isPushAvailable || !subscription || countdown !== null}
          className="w-full sm:w-auto"
        >
          {countdown !== null ? `Sending in ${countdown}s...` : 'Notification Test (5s)'}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={scheduleLogicTest}
          disabled={!isPushAvailable || !subscription}
          className="w-full sm:w-auto"
        >
          Reminder Logic Test (~1m)
        </Button>
      </div>
      {!isPushAvailable && (
        <p className="text-xs text-destructive">
          Push requires HTTPS (or localhost) and a browser with Service Worker support.
        </p>
      )}
      <p className="text-xs text-muted-foreground">
        Tap test, lock your phone within 5 seconds, and wait for the notification.
      </p>
    </div>
  );
}
