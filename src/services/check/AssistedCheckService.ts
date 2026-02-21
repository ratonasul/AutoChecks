import { db } from '@/lib/db';

export interface CheckResult {
  vehicleId: number;
  type: 'ITP' | 'RCA' | 'VIGNETTE';
  status: 'OK' | 'FAIL';
  expiryDateISO: string;
  expiryMillis: number;
  sourceUrl: string;
  checkedAt: number;
  note: string;
}

export class AssistedCheckService {
  async saveCheckResult(result: CheckResult): Promise<void> {
    // Update vehicle expiry
    const update: any = {};
    if (result.type === 'ITP') update.itpExpiryMillis = result.expiryMillis;
    else if (result.type === 'RCA') update.rcaExpiryMillis = result.expiryMillis;
    else if (result.type === 'VIGNETTE') update.vignetteExpiryMillis = result.expiryMillis;

    await db.vehicles.update(result.vehicleId, update);

    // Add check record
    await db.checks.add({
      vehicleId: result.vehicleId,
      type: result.type,
      status: result.status,
      expiryMillis: result.expiryMillis,
      checkedAt: result.checkedAt,
      note: result.note,
      sourceUrl: result.sourceUrl,
    });
  }
}