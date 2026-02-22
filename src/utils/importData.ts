import { db } from '@/lib/db';
import { canonicalPlate, normalizePlate, normalizeVin } from '@/utils/validation';

export async function importData(file: File): Promise<{ success: boolean; message: string }> {
  try {
    const text = await file.text();
    const data = JSON.parse(text);

    if (!data.vehicles || !Array.isArray(data.vehicles)) {
      return { success: false, message: 'Invalid data format: missing vehicles array' };
    }

    // Validate schema
    for (const v of data.vehicles) {
      if (!v.plate || typeof v.plate !== 'string') {
        return { success: false, message: 'Invalid vehicle data: missing or invalid plate' };
      }
    }

    // Check for duplicate plates
    const existingPlates = new Set(
      (await db.vehicles.toArray()).map((v) => canonicalPlate(v.plate))
    );
    const seenInFile = new Set<string>();
    const newVehicles = data.vehicles
      .map((v: any) => ({
        ...v,
        plate: normalizePlate(String(v.plate || '')),
        vin: normalizeVin(String(v.vin || '')) || undefined,
        deletedAt: null,
        createdAt: v.createdAt || Date.now(),
      }))
      .filter((v: any) => {
        const key = canonicalPlate(v.plate);
        if (!key) return false;
        if (existingPlates.has(key) || seenInFile.has(key)) return false;
        seenInFile.add(key);
        return true;
      });

    if (newVehicles.length === 0) {
      return { success: false, message: 'No new vehicles to import (all plates already exist)' };
    }

    // Import vehicles
    await db.vehicles.bulkAdd(newVehicles);

    // Import checks if present
    if (data.checks && Array.isArray(data.checks)) {
      const validChecks = data.checks.filter((c: any) =>
        c.vehicleId && c.type && c.status && c.checkedAt
      );
      await db.checks.bulkAdd(validChecks);
    }

    return { success: true, message: `Imported ${newVehicles.length} vehicles and ${data.checks?.length || 0} checks` };
  } catch (error) {
    return { success: false, message: `Import failed: ${error instanceof Error ? error.message : 'Unknown error'}` };
  }
}
