'use client';

import { useEffect } from 'react';
import { db } from '@/lib/db';
import { getSupabaseClient, isSupabaseConfigured } from '@/lib/supabaseClient';
import { isCloudSyncSuppressed, uploadLocalSnapshot } from '@/lib/cloudSync';
import { setSyncStatus } from '@/lib/syncStatus';

const DEBOUNCE_MS = 900;

export function CloudMutationSync() {
  useEffect(() => {
    if (!isSupabaseConfigured()) return;

    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let hasPendingChanges = false;

    const pushNow = async () => {
      try {
        const supabase = getSupabaseClient();
        const { data } = await supabase.auth.getUser();
        const userId = data.user?.id;
        if (!userId) return;
        await uploadLocalSnapshot(userId);
        hasPendingChanges = false;
      } catch (error) {
        if (typeof navigator !== 'undefined' && !navigator.onLine) {
          setSyncStatus({ state: 'offline-pending', message: 'Offline. Changes are waiting to sync.' });
          return;
        }
        setSyncStatus({ state: 'error', message: error instanceof Error ? error.message : 'Sync failed.' });
        console.error('Auto cloud sync failed after mutation', error);
      }
    };

    const schedulePush = () => {
      if (isCloudSyncSuppressed()) return;
      hasPendingChanges = true;
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        setSyncStatus({ state: 'offline-pending', message: 'Offline. Changes are waiting to sync.' });
        return;
      }
      if (timeoutId) clearTimeout(timeoutId);
      timeoutId = setTimeout(async () => {
        await pushNow();
      }, DEBOUNCE_MS);
    };

    const creatingVehicle = () => schedulePush();
    const updatingVehicle = () => schedulePush();
    const deletingVehicle = () => schedulePush();
    const creatingCheck = () => schedulePush();
    const updatingCheck = () => schedulePush();
    const deletingCheck = () => schedulePush();
    const creatingSetting = () => schedulePush();
    const updatingSetting = () => schedulePush();
    const deletingSetting = () => schedulePush();

    db.vehicles.hook('creating', creatingVehicle);
    db.vehicles.hook('updating', updatingVehicle);
    db.vehicles.hook('deleting', deletingVehicle);
    db.checks.hook('creating', creatingCheck);
    db.checks.hook('updating', updatingCheck);
    db.checks.hook('deleting', deletingCheck);
    db.settings.hook('creating', creatingSetting);
    db.settings.hook('updating', updatingSetting);
    db.settings.hook('deleting', deletingSetting);

    const handleOnline = async () => {
      if (!hasPendingChanges) return;
      await pushNow();
    };

    window.addEventListener('online', handleOnline);

    return () => {
      if (timeoutId) clearTimeout(timeoutId);
      window.removeEventListener('online', handleOnline);
      db.vehicles.hook('creating').unsubscribe(creatingVehicle);
      db.vehicles.hook('updating').unsubscribe(updatingVehicle);
      db.vehicles.hook('deleting').unsubscribe(deletingVehicle);
      db.checks.hook('creating').unsubscribe(creatingCheck);
      db.checks.hook('updating').unsubscribe(updatingCheck);
      db.checks.hook('deleting').unsubscribe(deletingCheck);
      db.settings.hook('creating').unsubscribe(creatingSetting);
      db.settings.hook('updating').unsubscribe(updatingSetting);
      db.settings.hook('deleting').unsubscribe(deletingSetting);
    };
  }, []);

  return null;
}
