import * as XLSX from 'xlsx';
import { db } from '@/lib/db';
import { canonicalPlate } from '@/utils/validation';

export type ImportPreview = {
  format: 'json' | 'excel';
  totalRows: number;
  willImport: number;
  duplicates: number;
  missingPlate: number;
};

export async function previewImport(file: File): Promise<ImportPreview> {
  if (file.name.toLowerCase().endsWith('.json')) {
    return previewJson(file);
  }
  return previewExcel(file);
}

async function previewJson(file: File): Promise<ImportPreview> {
  const text = await file.text();
  const data = JSON.parse(text);
  const vehicles: any[] = Array.isArray(data.vehicles) ? data.vehicles : [];
  return summarizeRows('json', vehicles);
}

async function previewExcel(file: File): Promise<ImportPreview> {
  const ab = await file.arrayBuffer();
  const wb = XLSX.read(ab, { type: 'array', cellDates: true });
  const vehiclesSheet = wb.Sheets['Vehicles'] || wb.Sheets[wb.SheetNames[0]];
  const vehicles = vehiclesSheet ? (XLSX.utils.sheet_to_json(vehiclesSheet) as any[]) : [];
  return summarizeRows('excel', vehicles);
}

async function summarizeRows(format: 'json' | 'excel', rows: any[]): Promise<ImportPreview> {
  const existing = await db.vehicles.toArray();
  const existingCanonical = new Set(
    existing.filter((vehicle) => !vehicle.deletedAt).map((vehicle) => canonicalPlate(vehicle.plate))
  );

  let duplicates = 0;
  let missingPlate = 0;
  let willImport = 0;
  const seenInFile = new Set<string>();

  for (const row of rows) {
    const rawPlate = String(row.plate || '').trim();
    if (!rawPlate) {
      missingPlate += 1;
      continue;
    }

    const key = canonicalPlate(rawPlate);
    if (!key) {
      missingPlate += 1;
      continue;
    }

    if (existingCanonical.has(key) || seenInFile.has(key)) {
      duplicates += 1;
      continue;
    }

    seenInFile.add(key);
    willImport += 1;
  }

  return {
    format,
    totalRows: rows.length,
    willImport,
    duplicates,
    missingPlate,
  };
}

