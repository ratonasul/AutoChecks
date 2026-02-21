import Dexie, { type Table } from 'dexie';

export interface Vehicle {
  id?: number;
  plate: string;
  vin?: string;
  notes?: string;
  itpExpiryMillis?: number | null;
  rcaExpiryMillis?: number | null;
  vignetteExpiryMillis?: number | null;
  createdAt: number;
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
  }
}

export const db = new AutoChecksDB();