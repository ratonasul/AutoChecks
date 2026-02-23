import { db, type Check, type Settings, type Vehicle } from '@/lib/db';
import { getSettings, upsertSettings } from '@/lib/settings';
import { getSupabaseClient } from '@/lib/supabaseClient';

const CLOUD_TABLE = 'user_snapshots';

type CloudPayload = {
  vehicles: Vehicle[];
  checks: Check[];
  settings: Omit<Settings, 'id' | 'cloudUserEmail' | 'cloudLastSyncedAt'>;
};

export type CloudSnapshotRow = {
  user_id: string;
  payload: CloudPayload;
  updated_at: string;
};

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

function sanitizeSettingsForCloud(settings: Settings): Omit<Settings, 'id' | 'cloudUserEmail' | 'cloudLastSyncedAt'> {
  const rest: Settings = { ...settings };
  delete rest.id;
  delete rest.cloudUserEmail;
  delete rest.cloudLastSyncedAt;
  return rest;
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
  const supabase = getSupabaseClient();
  const resolvedUserId = await resolveCurrentUserId(userId);
  const payload = await buildLocalSnapshot();
  const nowIso = new Date().toISOString();

  const { error } = await supabase.from(CLOUD_TABLE).upsert(
    {
      user_id: resolvedUserId,
      payload,
      updated_at: nowIso,
    },
    { onConflict: 'user_id' }
  );

  if (error) {
    throw new Error(error.message);
  }

  await upsertSettings({ cloudLastSyncedAt: Date.now() });
  return nowIso;
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

export async function applyCloudSnapshot(snapshot: CloudPayload): Promise<void> {
  const current = await getSettings();
  const mergedSettings: Settings = {
    ...snapshot.settings,
    cloudUserEmail: current.cloudUserEmail,
    cloudAutoSync: current.cloudAutoSync ?? snapshot.settings.cloudAutoSync ?? false,
    cloudLastSyncedAt: Date.now(),
  };

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
  const [cloudSnapshot, settings] = await Promise.all([
    downloadCloudSnapshot(resolvedUserId),
    getSettings(),
  ]);

  if (!cloudSnapshot) {
    await uploadLocalSnapshot(resolvedUserId);
    return 'pushed-new';
  }

  const cloudUpdatedAt = Date.parse(cloudSnapshot.updated_at);
  const lastSyncedAt = settings.cloudLastSyncedAt ?? 0;

  if (Number.isFinite(cloudUpdatedAt) && cloudUpdatedAt > lastSyncedAt) {
    await applyCloudSnapshot(cloudSnapshot.payload);
    return 'pulled';
  }

  await uploadLocalSnapshot(resolvedUserId);
  return 'pushed';
}
