import { db } from '@/lib/db';
import { getCompanyDisplayName, getSettings, upsertSettings } from '@/lib/settings';

export async function exportData(): Promise<void> {
  const vehicles = (await db.vehicles.toArray()).filter((vehicle) => !vehicle.deletedAt);
  const checks = await db.checks.toArray();
  const settings = await getSettings();
  const companyName = getCompanyDisplayName(settings);
  const data = {
    metadata: {
      companyName,
      companyContact: settings.companyContact || '',
      companyTimezone: settings.companyTimezone || Intl.DateTimeFormat().resolvedOptions().timeZone,
      exportedAt: new Date().toISOString(),
    },
    vehicles,
    checks,
  };

  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${companyName.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'autochecks'}-data-${new Date().toISOString().split('T')[0]}.json`;
  a.click();
  URL.revokeObjectURL(url);

  await upsertSettings({ lastExportAt: Date.now() });
}
