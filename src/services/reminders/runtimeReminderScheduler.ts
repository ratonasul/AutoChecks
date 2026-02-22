import { db, type Settings } from '@/lib/db';
import {
  defaultReminderSettings,
  scheduleExpiryReminders,
  type ReminderSettings,
} from '@/services/reminders/reminderEngine';
import { enqueueRequest } from '@/lib/networkQueue';

const MAX_TIMEOUT_MS = 2_147_483_647;
const scheduledTimeouts = new Map<string, ReturnType<typeof setTimeout>>();

function clearExistingTimeout(notificationId: string) {
  const existing = scheduledTimeouts.get(notificationId);
  if (existing) {
    clearTimeout(existing);
    scheduledTimeouts.delete(notificationId);
  }
}

function scheduleLongTimeout(notificationId: string, triggerAtMillis: number, task: () => void) {
  clearExistingTimeout(notificationId);

  const tick = () => {
    const remaining = triggerAtMillis - Date.now();
    if (remaining <= 0) {
      scheduledTimeouts.delete(notificationId);
      task();
      return;
    }

    const nextDelay = Math.min(remaining, MAX_TIMEOUT_MS);
    const timeoutId = setTimeout(tick, nextDelay);
    scheduledTimeouts.set(notificationId, timeoutId);
  };

  tick();
}

function coerceSettings(settings?: Settings | null): ReminderSettings {
  if (!settings) return defaultReminderSettings;

  const leadDays = Array.isArray(settings.reminderLeadDays)
    ? settings.reminderLeadDays.filter((day) => Number.isInteger(day) && day >= 0)
    : defaultReminderSettings.leadDays;

  const notifyHour = Number.isInteger(settings.reminderNotifyHour)
    ? Math.min(23, Math.max(0, settings.reminderNotifyHour!))
    : defaultReminderSettings.notifyHour;

  const notifyMinute = Number.isInteger(settings.reminderNotifyMinute)
    ? Math.min(59, Math.max(0, settings.reminderNotifyMinute!))
    : defaultReminderSettings.notifyMinute;

  return {
    leadDays: leadDays.length > 0 ? leadDays : defaultReminderSettings.leadDays,
    notifyHour,
    notifyMinute,
  };
}

export async function getReminderSettings(): Promise<ReminderSettings> {
  const settings = await db.settings.toArray();
  return coerceSettings(settings[0] ?? null);
}

async function sendScheduledPush(subscription: PushSubscription, notificationId: string, leadDays: number) {
  const payload = JSON.stringify({
    subscription,
    reminder: {
      notificationId,
      leadDays,
    },
  });

  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    enqueueRequest('/api/push/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payload,
    });
    return;
  }

  const response = await fetch('/api/push/test', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: payload,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Push test API failed (${response.status}): ${text}`);
  }
}

type ScheduleRuntimeReminderParams = {
  expiryMillis: number | null | undefined;
  notificationIdPrefix: string;
  settings?: ReminderSettings;
  onScheduled?: (notificationId: string, triggerAtMillis: number, leadDays: number) => void;
};

export async function scheduleRuntimeExpiryReminders({
  expiryMillis,
  notificationIdPrefix,
  settings,
  onScheduled,
}: ScheduleRuntimeReminderParams): Promise<string[]> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return [];

  const reg = await navigator.serviceWorker.getRegistration();
  const subscription = reg ? await reg.pushManager.getSubscription() : null;
  if (!subscription) {
    console.info('[reminders] No push subscription found; skipping runtime scheduling.');
    return [];
  }

  const resolvedSettings = settings ?? (await getReminderSettings());

  return scheduleExpiryReminders({
    expiryMillis,
    notificationIdPrefix,
    settings: resolvedSettings,
    scheduleAt: (notificationId, triggerAtMillis, leadDays) => {
      scheduleLongTimeout(notificationId, triggerAtMillis, async () => {
        try {
          await sendScheduledPush(subscription, notificationId, leadDays);
          console.info(`[reminders] Sent scheduled reminder ${notificationId}`);
        } catch (err) {
          console.error(`[reminders] Failed to send scheduled reminder ${notificationId}`, err);
        }
      });

      onScheduled?.(notificationId, triggerAtMillis, leadDays);
    },
  });
}
