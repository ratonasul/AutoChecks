import { db } from '@/lib/db';

export async function exportData(): Promise<void> {
  const vehicles = await db.vehicles.toArray();
  const checks = await db.checks.toArray();
  const data = { vehicles, checks, exportedAt: new Date().toISOString() };

  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `autochecks-data-${new Date().toISOString().split('T')[0]}.json`;
  a.click();
  URL.revokeObjectURL(url);
}