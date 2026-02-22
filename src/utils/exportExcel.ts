import { db } from '@/lib/db';
import * as XLSX from 'xlsx';
import { getCompanyDisplayName, getSettings, upsertSettings } from '@/lib/settings';

// Helper: convert JS Date to Excel serial number
function datenum(v: Date) {
  const epoch = Date.UTC(1899, 11, 30);
  return (v.getTime() - epoch) / (24 * 60 * 60 * 1000);
}

export async function exportExcel(): Promise<void> {
  const vehicles = (await db.vehicles.toArray()).filter((vehicle) => !vehicle.deletedAt);
  const checks = await db.checks.toArray();
  const settings = await getSettings();
  const companyName = getCompanyDisplayName(settings);

  const wb = XLSX.utils.book_new();

  const metaRows = [
    { key: 'Company Name', value: companyName },
    { key: 'Contact', value: settings.companyContact || '' },
    { key: 'Timezone', value: settings.companyTimezone || Intl.DateTimeFormat().resolvedOptions().timeZone },
    { key: 'Exported At', value: new Date().toISOString() },
  ];
  const wsMeta = XLSX.utils.json_to_sheet(metaRows);
  wsMeta['!cols'] = [{ wpx: 140 }, { wpx: 260 }];
  XLSX.utils.book_append_sheet(wb, wsMeta, 'Company');

  // Prepare vehicle rows with proper date serials
  const vehiclesRows = vehicles.map(v => ({
    id: v.id,
    plate: v.plate,
    vin: v.vin || '',
    notes: v.notes || '',
    itpExpiry: v.itpExpiryMillis ? new Date(v.itpExpiryMillis) : null,
    rcaExpiry: v.rcaExpiryMillis ? new Date(v.rcaExpiryMillis) : null,
    vignetteExpiry: v.vignetteExpiryMillis ? new Date(v.vignetteExpiryMillis) : null,
    createdAt: v.createdAt ? new Date(v.createdAt) : null,
  }));

  const wsVehicles = XLSX.utils.json_to_sheet(vehiclesRows, { dateNF: 'yyyy-mm-dd' });

  // Convert date objects to Excel serials and set format
  Object.keys(wsVehicles).forEach(k => {
    if (k.startsWith('!')) return;
    const cell = wsVehicles[k];
    if (cell && cell.v instanceof Date) {
      cell.t = 'n';
      cell.v = datenum(cell.v);
      cell.z = 'yyyy-mm-dd';
    }
  });

  // Set reasonable column widths
  wsVehicles['!cols'] = [
    { wpx: 50 }, // id
    { wpx: 120 }, // plate
    { wpx: 180 }, // vin
    { wpx: 200 }, // notes
    { wpx: 110 }, // itpExpiry
    { wpx: 110 }, // rcaExpiry
    { wpx: 110 }, // vignetteExpiry
    { wpx: 110 }, // createdAt
  ];

  XLSX.utils.book_append_sheet(wb, wsVehicles, 'Vehicles');

  const checksRows = checks.map(c => ({
    id: c.id,
    vehicleId: c.vehicleId,
    type: c.type,
    status: c.status,
    expiry: c.expiryMillis ? new Date(c.expiryMillis) : null,
    checkedAt: c.checkedAt ? new Date(c.checkedAt) : null,
  }));

  const wsChecks = XLSX.utils.json_to_sheet(checksRows, { dateNF: 'yyyy-mm-dd' });
  Object.keys(wsChecks).forEach(k => {
    if (k.startsWith('!')) return;
    const cell = wsChecks[k];
    if (cell && cell.v instanceof Date) {
      cell.t = 'n';
      cell.v = datenum(cell.v);
      cell.z = 'yyyy-mm-dd';
    }
  });

  wsChecks['!cols'] = [ { wpx: 50 }, { wpx: 80 }, { wpx: 80 }, { wpx: 80 }, { wpx: 110 }, { wpx: 110 } ];
  XLSX.utils.book_append_sheet(wb, wsChecks, 'Checks');

  const fileName = `${companyName.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'autochecks'}-data-${new Date().toISOString().split('T')[0]}.xlsx`;
  XLSX.writeFile(wb, fileName);
  await upsertSettings({ lastExportAt: Date.now() });
}
