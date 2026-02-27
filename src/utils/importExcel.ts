import { db } from '@/lib/db';
import * as XLSX from 'xlsx';
import { canonicalPlate, normalizePlate, normalizeVin } from '@/utils/validation';

function getField(row: Record<string, unknown>, keys: string[]): unknown {
  for (const key of keys) {
    if (typeof row[key] !== 'undefined') return row[key];
  }
  const keyMap = new Map(Object.keys(row).map((k) => [k.toLowerCase(), k]));
  for (const key of keys) {
    const found = keyMap.get(key.toLowerCase());
    if (found) return row[found];
  }
  return undefined;
}

function toMillis(value: unknown): number | null {
  if (value === null || typeof value === 'undefined' || value === '') return null;
  if (typeof value === 'number') {
    // Excel serial dates are typically in this range.
    if (value > 10000 && value < 80000) {
      const parsed = XLSX.SSF.parse_date_code(value);
      if (parsed) {
        return Date.UTC(parsed.y, parsed.m - 1, parsed.d);
      }
    }
    if (Number.isFinite(value) && value > 0) return Math.trunc(value);
    return null;
  }
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'string') {
    const raw = value.trim();
    if (!raw) return null;
    const direct = Date.parse(raw);
    if (Number.isFinite(direct)) return direct;

    const match = raw.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/);
    if (match) {
      const day = Number(match[1]);
      const month = Number(match[2]);
      const year = Number(match[3]);
      return Date.UTC(year, month - 1, day);
    }
  }
  return null;
}

function normalizeCheckType(value: unknown): 'ITP' | 'RCA' | 'VIGNETTE' | null {
  const raw = String(value || '').trim().toUpperCase();
  if (raw === 'ITP') return 'ITP';
  if (raw === 'RCA') return 'RCA';
  if (raw === 'VIGNETTE') return 'VIGNETTE';
  return null;
}

function normalizeCheckStatus(value: unknown): 'OK' | 'WARN' | 'FAIL' | null {
  const raw = String(value || '').trim().toUpperCase();
  if (raw === 'OK') return 'OK';
  if (raw === 'WARN') return 'WARN';
  if (raw === 'FAIL') return 'FAIL';
  return null;
}

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
    const existingPlates = new Set((await db.vehicles.toArray()).map(v => canonicalPlate(v.plate)));
    const seenInFile = new Set<string>();
    const newVehicles = (vehiclesJson as Record<string, unknown>[])
      .map((v) => {
        const plate = normalizePlate(String(getField(v, ['plate', 'Plate']) || ''));
        const vin = normalizeVin(String(getField(v, ['vin', 'VIN']) || '')) || undefined;
        const notes = (getField(v, ['notes', 'Notes']) as string | undefined) || undefined;
        const createdAt =
          toMillis(getField(v, ['createdAt', 'created_at', 'CreatedAt', 'Created At'])) || Date.now();

        const itpExpiryMillis = toMillis(
          getField(v, ['itpExpiryMillis', 'itpExpiry', 'ITP', 'itp'])
        );
        const rcaExpiryMillis = toMillis(
          getField(v, ['rcaExpiryMillis', 'rcaExpiry', 'RCA', 'rca'])
        );
        const vignetteExpiryMillis = toMillis(
          getField(v, ['vignetteExpiryMillis', 'vignetteExpiry', 'Vignette', 'VIGNETTE', 'vignette'])
        );

        return {
          plate,
          vin,
          notes,
          itpExpiryMillis,
          rcaExpiryMillis,
          vignetteExpiryMillis,
          createdAt,
          updatedAt: Date.now(),
          deletedAt: null,
        };
      })
      .filter((v) => {
      const key = canonicalPlate(v.plate);
      if (!key) return false;
      if (existingPlates.has(key) || seenInFile.has(key)) return false;
      seenInFile.add(key);
      return true;
    });

    if (newVehicles.length === 0) {
      return { success: false, message: 'No new vehicles to import (all plates already exist)' };
    }

    await db.vehicles.bulkAdd(newVehicles);

    // Import checks if present
    const checksSheet = wb.Sheets['Checks'] || wb.Sheets[wb.SheetNames[1]];
    if (checksSheet) {
      const checksJson = XLSX.utils.sheet_to_json(checksSheet) as Record<string, unknown>[];
      const validChecks: Array<{
        vehicleId: number;
        type: 'ITP' | 'RCA' | 'VIGNETTE';
        status: 'OK' | 'WARN' | 'FAIL';
        checkedAt: number;
        updatedAt: number;
        expiryMillis: number | null;
        note: string;
        sourceUrl: string | undefined;
      }> = [];
      for (const c of checksJson) {
        const vehicleId = Number(getField(c, ['vehicleId', 'vehicle_id']));
        const type = normalizeCheckType(getField(c, ['type', 'Type']));
        const status = normalizeCheckStatus(getField(c, ['status', 'Status']));
        const checkedAt = toMillis(getField(c, ['checkedAt', 'checked_at'])) || 0;
        if (!vehicleId || !type || !status || !checkedAt) continue;

        validChecks.push({
          vehicleId,
          type,
          status,
          checkedAt,
          updatedAt: Date.now(),
          expiryMillis: toMillis(getField(c, ['expiry', 'expiryMillis', 'expiryDate'])),
          note: String(getField(c, ['note', 'notes']) || ''),
          sourceUrl: (getField(c, ['sourceUrl', 'source_url']) as string | undefined) || undefined,
        });
      }
      if (validChecks.length) await db.checks.bulkAdd(validChecks);
    }

    return { success: true, message: `Imported ${newVehicles.length} vehicles` };
  } catch (error) {
    return { success: false, message: `Import failed: ${error instanceof Error ? error.message : 'Unknown error'}` };
  }
}
