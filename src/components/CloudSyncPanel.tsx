'use client';

import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { getSupabaseClient, isSupabaseConfigured } from '@/lib/supabaseClient';
import { pullCloudToLocal, smartSync, uploadLocalSnapshot } from '@/lib/cloudSync';
import { getSettings, upsertSettings } from '@/lib/settings';

function formatSyncTime(value?: number) {
  if (!value) return 'Never';
  return new Date(value).toLocaleString();
}

export function CloudSyncPanel() {
  const configured = useMemo(() => isSupabaseConfigured(), []);
  const [cloudUserEmail, setCloudUserEmail] = useState<string | null>(null);
  const [cloudAutoSync, setCloudAutoSync] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<number | undefined>(undefined);
  const [busyAction, setBusyAction] = useState<string | null>(null);

  const runAction = async (id: string, action: () => Promise<void>) => {
    setBusyAction(id);
    try {
      await action();
      const settings = await getSettings();
      setCloudAutoSync(Boolean(settings.cloudAutoSync));
      setLastSyncedAt(settings.cloudLastSyncedAt);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Action failed');
    } finally {
      setBusyAction(null);
    }
  };

  useEffect(() => {
    if (!configured) return;
    const supabase = getSupabaseClient();

    const load = async () => {
      const settings = await getSettings();
      setCloudAutoSync(Boolean(settings.cloudAutoSync));
      setLastSyncedAt(settings.cloudLastSyncedAt);

      const { data } = await supabase.auth.getSession();
      const sessionEmail = data.session?.user?.email ?? null;
      setCloudUserEmail(sessionEmail);
      await upsertSettings({ cloudUserEmail: sessionEmail ?? undefined });
    };
    load().catch((error) => {
      console.error('Failed to initialize cloud sync state', error);
    });

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      const nextEmail = session?.user?.email ?? null;
      setCloudUserEmail(nextEmail);
      upsertSettings({ cloudUserEmail: nextEmail ?? undefined }).catch((error) => {
        console.error('Failed to persist cloud user email', error);
      });
    });

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, [configured]);

  if (!configured) {
    return (
      <div className="space-y-2 rounded border p-3 text-sm">
        <div className="font-medium">Cloud Sync</div>
        <p className="text-muted-foreground">
          Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` to enable login and cloud sync.
        </p>
      </div>
    );
  }

  const handleSignOut = async () => {
    await runAction('signout', async () => {
      const supabase = getSupabaseClient();
      const { error } = await supabase.auth.signOut();
      if (error) throw new Error(error.message);
      setCloudUserEmail(null);
      await upsertSettings({ cloudUserEmail: undefined });
      toast.success('Signed out');
    });
  };

  const handleUpload = async () => {
    await runAction('upload', async () => {
      const supabase = getSupabaseClient();
      const { data } = await supabase.auth.getUser();
      if (!data.user?.id) throw new Error('Not authenticated');
      await uploadLocalSnapshot(data.user.id);
      toast.success('Uploaded local data to cloud');
    });
  };

  const handleDownload = async () => {
    await runAction('download', async () => {
      const supabase = getSupabaseClient();
      const { data } = await supabase.auth.getUser();
      if (!data.user?.id) throw new Error('Not authenticated');
      const result = await pullCloudToLocal(data.user.id);
      if (result === 'empty') {
        toast.message('No cloud snapshot found for this account');
        return;
      }
      toast.success('Downloaded cloud data to local device');
    });
  };

  const handleSyncNow = async () => {
    await runAction('sync', async () => {
      const supabase = getSupabaseClient();
      const { data } = await supabase.auth.getUser();
      if (!data.user?.id) throw new Error('Not authenticated');
      const result = await smartSync(data.user.id);
      if (result === 'pulled') toast.success('Sync complete: downloaded newer cloud snapshot');
      if (result === 'pushed') toast.success('Sync complete: uploaded local snapshot');
      if (result === 'pushed-new') toast.success('Sync complete: created first cloud snapshot');
    });
  };

  const handleAutoSyncToggle = async (nextValue: boolean) => {
    await runAction('autosync', async () => {
      await upsertSettings({ cloudAutoSync: nextValue });
      setCloudAutoSync(nextValue);
      toast.success(nextValue ? 'Auto sync enabled' : 'Auto sync disabled');
    });
  };

  return (
    <div className="space-y-3 rounded border p-3">
      <div className="space-y-1">
        <h4 className="text-sm font-medium">Cloud Sync</h4>
        <p className="text-xs text-muted-foreground">Account: {cloudUserEmail ?? 'Not signed in'}</p>
        <p className="text-xs text-muted-foreground">Last sync: {formatSyncTime(lastSyncedAt)}</p>
      </div>

      {!cloudUserEmail ? (
        <p className="text-xs text-muted-foreground">Use the initial login screen to sign in.</p>
      ) : (
        <div className="space-y-2">
          <div className="flex gap-2">
            <Button size="sm" className="flex-1" onClick={handleSyncNow} disabled={busyAction !== null}>
              Sync Now
            </Button>
            <Button size="sm" variant="outline" className="flex-1" onClick={handleSignOut} disabled={busyAction !== null}>
              Sign Out
            </Button>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" className="flex-1" onClick={handleUpload} disabled={busyAction !== null}>
              Upload Local
            </Button>
            <Button size="sm" variant="outline" className="flex-1" onClick={handleDownload} disabled={busyAction !== null}>
              Download Cloud
            </Button>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={cloudAutoSync}
              onChange={(event) => handleAutoSyncToggle(event.target.checked)}
              disabled={busyAction !== null}
            />
            Auto sync on app load
          </label>
        </div>
      )}
    </div>
  );
}
