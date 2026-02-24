import { db, type Check, type Settings, type Vehicle } from '@/lib/db';
import { getSettings, upsertSettings } from '@/lib/settings';
import { getSupabaseClient } from '@/lib/supabaseClient';
import { setSyncStatus } from '@/lib/syncStatus';

const CLOUD_TABLE = 'user_snapshots';
let syncSuppressed = false;

type CloudPayload = {
  vehicles: Vehicle[];
  checks: Check[];
  settings: Omit<Settings, 'id' | 'cloudUserId' | 'cloudUserEmail' | 'cloudLastSyncedAt'>;
};

export type CloudSnapshotRow = {
  user_id: string;
  payload: CloudPayload;
  updated_at: string;
};

type CheckWithVehicleKey = Omit<Check, 'vehicleId'> & {
  vehicleKey: string;
};

function withSyncSuppressed<T>(fn: () => Promise<T>): Promise<T> {
  syncSuppressed = true;
  return fn().finally(() => {
    syncSuppressed = false;
  });
}

export function isCloudSyncSuppressed(): boolean {
  return syncSuppressed;
}

async function resolveCurrentUserId(expectedUserId?: string): Promise<string> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.auth.getUser();
  if (error) {
    const message = error.message || '';
    if (message.toLowerCase().includes('sub claim in jwt')) {
      await supabase.auth.signOut();
      throw new Error('Session expired. Please sign in again.');
    }
    throw new Error(error.message);
  }
  const currentUserId = data.user?.id;
  if (!currentUserId) {
    throw new Error('No authenticated user session found.');
  }
  if (expectedUserId && expectedUserId !== currentUserId) {
    console.warn('Sync user mismatch detected. Using current authenticated user id.');
  }
  return currentUserId;
}

function sanitizeSettingsForCloud(settings: Settings): Omit<Settings, 'id' | 'cloudUserId' | 'cloudUserEmail' | 'cloudLastSyncedAt'> {
  const rest: Settings = { ...settings };
  delete rest.id;
  delete rest.cloudUserId;
  delete rest.cloudUserEmail;
  delete rest.cloudLastSyncedAt;
  return rest;
}

function normalizeToken(value?: string | null): string {
  return (value || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function vehicleIdentity(vehicle: Pick<Vehicle, 'id' | 'plate' | 'vin' | 'createdAt'>): string {
  const plate = normalizeToken(vehicle.plate);
  if (plate) return `PLATE:${plate}`;
  const vin = normalizeToken(vehicle.vin || '');
  if (vin) return `VIN:${vin}`;
  return `UNKNOWN:${vehicle.id ?? 'x'}:${vehicle.createdAt ?? 0}`;
}

function mergeOptionalText(a?: string, b?: string): string | undefined {
  const left = (a || '').trim();
  const right = (b || '').trim();
  if (!left && !right) return undefined;
  if (!left) return right;
  if (!right) return left;
  if (left === right) return left;
  return `${left}\n${right}`;
}

function mergeExpiry(a?: number | null, b?: number | null): number | null | undefined {
  const left = typeof a === 'number' ? a : null;
  const right = typeof b === 'number' ? b : null;
  if (left === null && right === null) return undefined;
  if (left === null) return right;
  if (right === null) return left;
  return Math.max(left, right);
}

function mergeVehicles(existing: Vehicle | undefined, incoming: Vehicle): Vehicle {
  if (!existing) {
    return {
      ...incoming,
      id: undefined,
      deletedAt: null,
    };
  }

  const mergedPlate = (existing.plate || '').trim() || (incoming.plate || '').trim();
  const mergedVin = (existing.vin || '').trim() || (incoming.vin || '').trim() || undefined;

  return {
    id: undefined,
    plate: mergedPlate,
    vin: mergedVin,
    notes: mergeOptionalText(existing.notes, incoming.notes),
    itpExpiryMillis: mergeExpiry(existing.itpExpiryMillis, incoming.itpExpiryMillis),
    rcaExpiryMillis: mergeExpiry(existing.rcaExpiryMillis, incoming.rcaExpiryMillis),
    vignetteExpiryMillis: mergeExpiry(existing.vignetteExpiryMillis, incoming.vignetteExpiryMillis),
    createdAt: Math.min(existing.createdAt || Date.now(), incoming.createdAt || Date.now()),
    deletedAt: null,
  };
}

function mergeSettingsPayload(
  local: CloudPayload['settings'],
  cloud: CloudPayload['settings']
): CloudPayload['settings'] {
  const localReminderLeadDays = Array.isArray(local.reminderLeadDays) ? local.reminderLeadDays : [];
  const cloudReminderLeadDays = Array.isArray(cloud.reminderLeadDays) ? cloud.reminderLeadDays : [];

  return {
    ...cloud,
    ...local,
    reminderLeadDays: Array.from(new Set([...cloudReminderLeadDays, ...localReminderLeadDays])).sort((a, b) => a - b),
    featureFlags: {
      ...(cloud.featureFlags || {}),
      ...(local.featureFlags || {}),
    },
    username: local.username?.trim() || cloud.username,
    appName: local.appName?.trim() || cloud.appName,
    companyName: local.companyName?.trim() || cloud.companyName,
    companyContact: local.companyContact?.trim() || cloud.companyContact,
    companyTimezone: local.companyTimezone?.trim() || cloud.companyTimezone,
  };
}

function materializeMergedSnapshot(local: CloudPayload, cloud: CloudPayload): CloudPayload {
  const localVehicleIdToKey = new Map<number, string>();
  const cloudVehicleIdToKey = new Map<number, string>();
  const mergedVehicleByKey = new Map<string, Vehicle>();

  for (const vehicle of cloud.vehicles) {
    const key = vehicleIdentity(vehicle);
    if (typeof vehicle.id === 'number') cloudVehicleIdToKey.set(vehicle.id, key);
    mergedVehicleByKey.set(key, mergeVehicles(mergedVehicleByKey.get(key), vehicle));
  }

  for (const vehicle of local.vehicles) {
    const key = vehicleIdentity(vehicle);
    if (typeof vehicle.id === 'number') localVehicleIdToKey.set(vehicle.id, key);
    mergedVehicleByKey.set(key, mergeVehicles(mergedVehicleByKey.get(key), vehicle));
  }

  const mergedChecksByKey = new Map<string, CheckWithVehicleKey>();

  const collectChecks = (checks: Check[], idMap: Map<number, string>) => {
    for (const check of checks) {
      const vehicleKey = idMap.get(check.vehicleId);
      if (!vehicleKey) continue;
      const dedupeKey = `${vehicleKey}|${check.type}|${check.checkedAt}|${check.expiryMillis ?? ''}`;
      const previous = mergedChecksByKey.get(dedupeKey);
      if (!previous) {
        mergedChecksByKey.set(dedupeKey, { ...check, id: undefined, vehicleKey });
        continue;
      }
      mergedChecksByKey.set(dedupeKey, {
        ...previous,
        note: mergeOptionalText(previous.note, check.note) || previous.note,
        sourceUrl: previous.sourceUrl || check.sourceUrl,
      });
    }
  };

  collectChecks(cloud.checks, cloudVehicleIdToKey);
  collectChecks(local.checks, localVehicleIdToKey);

  const sortedVehicleEntries = Array.from(mergedVehicleByKey.entries()).sort((a, b) =>
    a[1].plate.localeCompare(b[1].plate)
  );

  const keyToNewVehicleId = new Map<string, number>();
  const vehicles: Vehicle[] = sortedVehicleEntries.map(([key, vehicle], idx) => {
    const id = idx + 1;
    keyToNewVehicleId.set(key, id);
    return {
      ...vehicle,
      id,
      deletedAt: null,
    };
  });

  const checks: Check[] = [];
  for (const check of mergedChecksByKey.values()) {
    const vehicleId = keyToNewVehicleId.get(check.vehicleKey);
    if (!vehicleId) continue;
    checks.push({
      id: undefined,
      vehicleId,
      type: check.type,
      status: check.status,
      expiryMillis: check.expiryMillis,
      checkedAt: check.checkedAt,
      note: check.note,
      sourceUrl: check.sourceUrl ?? undefined,
    });
  }
  checks.sort((a, b) => a.checkedAt - b.checkedAt);

  return {
    vehicles,
    checks,
    settings: mergeSettingsPayload(local.settings, cloud.settings),
  };
}

function enforcePayloadConstraints(payload: CloudPayload): CloudPayload {
  const vehicleByKey = new Map<string, Vehicle>();
  const idToKey = new Map<number, string>();
  for (const vehicle of payload.vehicles) {
    const key = vehicleIdentity(vehicle);
    if (typeof vehicle.id === 'number') idToKey.set(vehicle.id, key);
    vehicleByKey.set(key, mergeVehicles(vehicleByKey.get(key), vehicle));
  }

  const sortedVehicles = Array.from(vehicleByKey.entries()).sort((a, b) => a[1].plate.localeCompare(b[1].plate));
  const keyToId = new Map<string, number>();
  const vehicles: Vehicle[] = sortedVehicles.map(([key, vehicle], idx) => {
    const id = idx + 1;
    keyToId.set(key, id);
    return { ...vehicle, id, deletedAt: null };
  });

  const checkByKey = new Map<string, Check>();
  for (const check of payload.checks) {
    const vehicleKey = idToKey.get(check.vehicleId);
    if (!vehicleKey) continue;
    const vehicleId = keyToId.get(vehicleKey);
    if (!vehicleId) continue;
    const key = `${vehicleKey}|${check.type}|${check.checkedAt}|${check.expiryMillis ?? ''}`;
    const existing = checkByKey.get(key);
    if (!existing) {
      checkByKey.set(key, { ...check, id: undefined, vehicleId });
      continue;
    }
    checkByKey.set(key, {
      ...existing,
      note: mergeOptionalText(existing.note, check.note) || existing.note,
      sourceUrl: existing.sourceUrl || check.sourceUrl,
    });
  }

  const checks = Array.from(checkByKey.values()).sort((a, b) => a.checkedAt - b.checkedAt);

  return {
    vehicles,
    checks,
    settings: payload.settings,
  };
}

export async function buildLocalSnapshot(): Promise<CloudPayload> {
  const [vehicles, checks, settings] = await Promise.all([
    db.vehicles.toArray(),
    db.checks.toArray(),
    getSettings(),
  ]);
  return {
    vehicles,
    checks,
    settings: sanitizeSettingsForCloud(settings),
  };
}

export async function uploadLocalSnapshot(userId: string): Promise<string> {
  const payload = await buildLocalSnapshot();
  return uploadSnapshot(userId, payload);
}

export async function downloadCloudSnapshot(userId: string): Promise<CloudSnapshotRow | null> {
  const supabase = getSupabaseClient();
  const resolvedUserId = await resolveCurrentUserId(userId);
  const { data, error } = await supabase
    .from(CLOUD_TABLE)
    .select('user_id,payload,updated_at')
    .eq('user_id', resolvedUserId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }
  if (!data) {
    return null;
  }
  return data as CloudSnapshotRow;
}

async function uploadSnapshot(userId: string, payload: CloudPayload): Promise<string> {
  setSyncStatus({ state: 'syncing' });
  const supabase = getSupabaseClient();
  const resolvedUserId = await resolveCurrentUserId(userId);
  const constrainedPayload = enforcePayloadConstraints(payload);
  const nowIso = new Date().toISOString();

  const { error } = await supabase.from(CLOUD_TABLE).upsert(
    {
      user_id: resolvedUserId,
      payload: constrainedPayload,
      updated_at: nowIso,
    },
    { onConflict: 'user_id' }
  );

  if (error) {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setSyncStatus({ state: 'offline-pending', message: 'Offline. Changes are waiting to sync.' });
    } else {
      setSyncStatus({ state: 'error', message: error.message });
    }
    throw new Error(error.message);
  }
  await withSyncSuppressed(async () => {
    await upsertSettings({ cloudLastSyncedAt: Date.now() });
  });
  setSyncStatus({ state: 'synced', lastSyncedAt: Date.now() });
  return nowIso;
}

export async function applyCloudSnapshot(snapshot: CloudPayload): Promise<void> {
  setSyncStatus({ state: 'syncing' });
  const current = await getSettings();
  const mergedSettings: Settings = {
    ...snapshot.settings,
    cloudUserId: current.cloudUserId,
    cloudUserEmail: current.cloudUserEmail,
    cloudAutoSync: current.cloudAutoSync ?? snapshot.settings.cloudAutoSync ?? false,
    cloudLastSyncedAt: Date.now(),
  };

  await withSyncSuppressed(async () => {
    await db.transaction('rw', db.vehicles, db.checks, db.settings, async () => {
      await db.vehicles.clear();
      await db.checks.clear();
      await db.settings.clear();

      if (snapshot.vehicles.length > 0) {
        await db.vehicles.bulkAdd(snapshot.vehicles);
      }
      if (snapshot.checks.length > 0) {
        await db.checks.bulkAdd(snapshot.checks);
      }
      await db.settings.add(mergedSettings);
    });
  });
  setSyncStatus({ state: 'synced', lastSyncedAt: Date.now() });
}

export async function pullCloudToLocal(userId: string): Promise<'applied' | 'empty'> {
  const resolvedUserId = await resolveCurrentUserId(userId);
  const snapshot = await downloadCloudSnapshot(resolvedUserId);
  if (!snapshot) return 'empty';
  await applyCloudSnapshot(snapshot.payload);
  return 'applied';
}

export async function smartSync(userId: string): Promise<'pushed' | 'pulled' | 'pushed-new'> {
  const resolvedUserId = await resolveCurrentUserId(userId);
  const [localSnapshot, cloudSnapshot] = await Promise.all([
    buildLocalSnapshot(),
    downloadCloudSnapshot(resolvedUserId),
  ]);

  if (!cloudSnapshot) {
    await uploadSnapshot(resolvedUserId, localSnapshot);
    await upsertSettings({ cloudLastSyncedAt: Date.now() });
    return 'pushed-new';
  }

  const mergedPayload = materializeMergedSnapshot(localSnapshot, cloudSnapshot.payload);
  await applyCloudSnapshot(mergedPayload);
  await uploadSnapshot(resolvedUserId, mergedPayload);
  return 'pulled';
}

export async function resetLocalDataForAccount(cloudUserId?: string, cloudUserEmail?: string): Promise<void> {
  await withSyncSuppressed(async () => {
    await db.transaction('rw', db.vehicles, db.checks, db.settings, async () => {
      await db.vehicles.clear();
      await db.checks.clear();
      await db.settings.clear();
      await db.settings.add({
        cloudUserId,
        cloudUserEmail,
        cloudAutoSync: false,
      });
    });
  });
}

export async function hydrateLocalFromCloud(userId: string, cloudUserEmail?: string): Promise<'hydrated' | 'empty'> {
  setSyncStatus({ state: 'syncing' });
  const resolvedUserId = await resolveCurrentUserId(userId);
  const snapshot = await downloadCloudSnapshot(resolvedUserId);
  if (!snapshot) {
    await resetLocalDataForAccount(resolvedUserId, cloudUserEmail);
    await upsertSettings({
      cloudUserId: resolvedUserId,
      cloudUserEmail,
      cloudLastSyncedAt: Date.now(),
    });
    setSyncStatus({ state: 'synced', lastSyncedAt: Date.now() });
    return 'empty';
  }

  await applyCloudSnapshot(snapshot.payload);
  await upsertSettings({
    cloudUserId: resolvedUserId,
    cloudUserEmail,
    cloudLastSyncedAt: Date.now(),
  });
  setSyncStatus({ state: 'synced', lastSyncedAt: Date.now() });
  return 'hydrated';
}

export async function retryCloudSyncNow(): Promise<void> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    setSyncStatus({ state: 'offline-pending', message: 'Still offline. Retry when back online.' });
    throw new Error('Offline');
  }
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.auth.getUser();
  if (error) {
    setSyncStatus({ state: 'error', message: error.message });
    throw new Error(error.message);
  }
  const userId = data.user?.id;
  if (!userId) {
    setSyncStatus({ state: 'error', message: 'Not authenticated.' });
    throw new Error('Not authenticated');
  }
  await uploadLocalSnapshot(userId);
}
