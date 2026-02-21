import { differenceInDays } from 'date-fns';

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