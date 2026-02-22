const SNOOZE_STORAGE_KEY = 'autochecks-reminder-snooze-v1';

type SnoozeMap = Record<string, number>;

function readMap(): SnoozeMap {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(SNOOZE_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as SnoozeMap;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeMap(map: SnoozeMap) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(SNOOZE_STORAGE_KEY, JSON.stringify(map));
}

export function getReminderSnoozeKey(vehicleId: number, docType: string, expiryMillis: number): string {
  return `${vehicleId}-${docType}-${expiryMillis}`;
}

export function snoozeReminder(key: string, durationMillis: number) {
  const map = readMap();
  map[key] = Date.now() + durationMillis;
  writeMap(map);
}

export function clearReminderSnooze(key: string) {
  const map = readMap();
  if (map[key]) {
    delete map[key];
    writeMap(map);
  }
}

export function isReminderSnoozed(key: string): boolean {
  const map = readMap();
  const until = map[key];
  if (!until) return false;
  if (until <= Date.now()) {
    delete map[key];
    writeMap(map);
    return false;
  }
  return true;
}

