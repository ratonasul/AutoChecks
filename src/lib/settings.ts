import { db, type Settings } from '@/lib/db';
import { defaultFeatureFlags } from '@/lib/featureFlags';

export async function getSettings(): Promise<Settings> {
  const settings = await db.settings.toArray();
  return settings[0] ?? {};
}

export async function upsertSettings(patch: Partial<Settings>): Promise<void> {
  const settings = await db.settings.toArray();
  if (settings[0]?.id) {
    await db.settings.update(settings[0].id, patch);
    return;
  }
  await db.settings.add(patch);
}

export function resolveFeatureFlags(settings?: Settings | null) {
  return {
    ...defaultFeatureFlags,
    ...(settings?.featureFlags || {}),
  };
}

export function getCompanyDisplayName(settings?: Settings | null): string {
  return settings?.companyName?.trim() || settings?.appName?.trim() || 'AutoChecks';
}
