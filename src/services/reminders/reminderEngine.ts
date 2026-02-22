import { differenceInDays } from 'date-fns';

export type ReminderSettings = {
  leadDays: number[];
  notifyHour: number;
  notifyMinute: number;
};

export const defaultReminderSettings: ReminderSettings = {
  leadDays: [30, 7, 1],
  notifyHour: 9,
  notifyMinute: 0,
};

export function calculateTriggerDate(
  expiryMillis: number,
  leadDays: number,
  hour: number,
  minute: number
): Date {
  const expiryDate = new Date(expiryMillis);
  const triggerDate = new Date(expiryDate);
  triggerDate.setDate(triggerDate.getDate() - leadDays);
  triggerDate.setHours(hour, minute, 0, 0);
  return triggerDate;
}

export type ScheduleExpiryRemindersParams = {
  expiryMillis: number | null | undefined;
  notificationIdPrefix: string;
  settings?: ReminderSettings;
  scheduleAt: (notificationId: string, triggerAtMillis: number, leadDays: number) => void;
};

export function scheduleExpiryReminders({
  expiryMillis,
  notificationIdPrefix,
  settings = defaultReminderSettings,
  scheduleAt,
}: ScheduleExpiryRemindersParams): string[] {
  if (!expiryMillis) return [];

  const scheduledIds: string[] = [];
  const now = Date.now();

  const uniqueLeadDays = Array.from(
    new Set(settings.leadDays.filter((days) => Number.isInteger(days) && days >= 0))
  ).sort((a, b) => b - a);

  for (const leadDays of uniqueLeadDays) {
    const triggerDate = calculateTriggerDate(
      expiryMillis,
      leadDays,
      settings.notifyHour,
      settings.notifyMinute
    );

    if (triggerDate.getTime() <= now) {
      console.info(
        `[reminders] Skip scheduling ${notificationIdPrefix}-${leadDays}d; trigger is in the past: ${triggerDate.toISOString()}`
      );
      continue;
    }

    const notificationId = `${notificationIdPrefix}-${leadDays}d`;
    scheduleAt(notificationId, triggerDate.getTime(), leadDays);
    scheduledIds.push(notificationId);
  }

  return scheduledIds;
}

export function calculateReminderState(expiryMillis: number | null): {
  daysLeft: number;
  urgency: 'safe' | 'warning' | 'critical';
  showReminderBanner: boolean;
} {
  if (!expiryMillis) return { daysLeft: Infinity, urgency: 'safe', showReminderBanner: false };

  const daysLeft = differenceInDays(new Date(expiryMillis), new Date());
  let urgency: 'safe' | 'warning' | 'critical' = 'safe';
  if (daysLeft <= 7) urgency = 'critical';
  else if (daysLeft <= 30) urgency = 'warning';

  const showReminderBanner = daysLeft <= 30;
  return { daysLeft, urgency, showReminderBanner };
}
