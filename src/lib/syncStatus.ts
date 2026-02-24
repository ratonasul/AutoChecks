export type SyncStatusState = 'idle' | 'syncing' | 'synced' | 'offline-pending' | 'error';

export type SyncStatusSnapshot = {
  state: SyncStatusState;
  lastSyncedAt?: number;
  message?: string;
};

let snapshot: SyncStatusSnapshot = { state: 'idle' };
const listeners = new Set<(value: SyncStatusSnapshot) => void>();

export function getSyncStatus(): SyncStatusSnapshot {
  return snapshot;
}

export function setSyncStatus(next: SyncStatusSnapshot): void {
  snapshot = next;
  for (const listener of listeners) {
    listener(snapshot);
  }
}

export function subscribeSyncStatus(listener: (value: SyncStatusSnapshot) => void): () => void {
  listeners.add(listener);
  listener(snapshot);
  return () => listeners.delete(listener);
}
