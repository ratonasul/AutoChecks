import Dexie, { type Table } from 'dexie';
import type { FeatureFlags } from '@/lib/featureFlags';

export interface Vehicle {
  id?: number;
  plate: string;
  vin?: string;
  notes?: string;
  itpExpiryMillis?: number | null;
  rcaExpiryMillis?: number | null;
  vignetteExpiryMillis?: number | null;
  createdAt: number;
  deletedAt?: number | null;
}

export interface Check {
  id?: number;
  vehicleId: number;
  type: 'ITP' | 'RCA' | 'VIGNETTE';
  status: 'OK' | 'WARN' | 'FAIL';
  expiryMillis?: number | null;
  checkedAt: number;
  note: string;
  sourceUrl?: string | null;
}

export interface Settings {
  id?: number;
  username?: string;
  appName?: string;
  companyName?: string;
  companyContact?: string;
  companyTimezone?: string;
  companyLogoDataUrl?: string;
  lastExportAt?: number;
  reminderLeadDays?: number[];
  reminderNotifyHour?: number;
  reminderNotifyMinute?: number;
  featureFlags?: Partial<FeatureFlags>;
}

export class AutoChecksDB extends Dexie {
  vehicles!: Table<Vehicle>;
  checks!: Table<Check>;
  settings!: Table<Settings>;

  constructor() {
    super('AutoChecksDB');
    this.version(1).stores({
      vehicles: '++id, plate, vin, itpExpiryMillis, rcaExpiryMillis, vignetteExpiryMillis, createdAt',
      checks: '++id, vehicleId, type, status, expiryMillis, checkedAt, note, sourceUrl',
      settings: '++id',
    });
    this.version(2)
      .stores({
        vehicles: '++id, plate, vin, itpExpiryMillis, rcaExpiryMillis, vignetteExpiryMillis, createdAt',
        checks: '++id, vehicleId, type, status, expiryMillis, checkedAt, note, sourceUrl',
        settings: '++id',
      })
      .upgrade(async (tx) => {
        const settingsTable = tx.table<Settings>('settings');
        const current = await settingsTable.toArray();
        if (current.length === 0) {
          await settingsTable.add({});
        }
      });
    this.version(3)
      .stores({
        vehicles: '++id, plate, vin, deletedAt, itpExpiryMillis, rcaExpiryMillis, vignetteExpiryMillis, createdAt',
        checks: '++id, vehicleId, type, status, expiryMillis, checkedAt, note, sourceUrl',
        settings: '++id',
      })
      .upgrade(async (tx) => {
        const vehiclesTable = tx.table<Vehicle>('vehicles');
        await vehiclesTable.toCollection().modify((vehicle) => {
          if (typeof vehicle.deletedAt === 'undefined') {
            vehicle.deletedAt = null;
          }
        });
      });
  }
}

export const db = new AutoChecksDB();
