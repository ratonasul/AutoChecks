import { db } from '@/lib/db';
import * as XLSX from 'xlsx';

export async function importExcel(file: File): Promise<{ success: boolean; message: string }> {
  try {
      const ab = await file.arrayBuffer();
      const wb = XLSX.read(ab, { type: 'array', cellDates: true });

    const vehiclesSheet = wb.Sheets['Vehicles'] || wb.Sheets[wb.SheetNames[0]];
    const vehiclesJson = vehiclesSheet ? XLSX.utils.sheet_to_json(vehiclesSheet) : [];

    if (!Array.isArray(vehiclesJson) || vehiclesJson.length === 0) {
      return { success: false, message: 'No vehicles sheet found or sheet is empty' };
    }

    // Validate and prepare
    const existingPlates = new Set((await db.vehicles.toArray()).map(v => v.plate));
    const newVehicles = (vehiclesJson as any[]).map(v => ({
      plate: v.plate,
      vin: v.vin || undefined,
      notes: v.notes || undefined,
      itpExpiryMillis: v.itpExpiryMillis || null,
      rcaExpiryMillis: v.rcaExpiryMillis || null,
      vignetteExpiryMillis: v.vignetteExpiryMillis || null,
      createdAt: v.createdAt || Date.now(),
    })).filter(v => v.plate && !existingPlates.has(v.plate));

    if (newVehicles.length === 0) {
      return { success: false, message: 'No new vehicles to import (all plates already exist)' };
    }

    await db.vehicles.bulkAdd(newVehicles);

    // Import checks if present
    const checksSheet = wb.Sheets['Checks'] || wb.Sheets[wb.SheetNames[1]];
    if (checksSheet) {
      const checksJson = XLSX.utils.sheet_to_json(checksSheet) as any[];
      const validChecks = checksJson.filter(c => c.vehicleId && c.type && c.status && c.checkedAt);
      if (validChecks.length) await db.checks.bulkAdd(validChecks);
    }

    return { success: true, message: `Imported ${newVehicles.length} vehicles` };
  } catch (error) {
    return { success: false, message: `Import failed: ${error instanceof Error ? error.message : 'Unknown error'}` };
  }
}
