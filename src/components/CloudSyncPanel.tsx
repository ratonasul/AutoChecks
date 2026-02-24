'use client';

import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { getSupabaseClient, isSupabaseConfigured } from '@/lib/supabaseClient';
import { resetLocalDataForAccount } from '@/lib/cloudSync';
import { getSettings, upsertSettings } from '@/lib/settings';

function formatSyncTime(value?: number) {
  if (!value) return 'Never';
  return new Date(value).toLocaleString();
}

export function CloudSyncPanel() {
  const configured = useMemo(() => isSupabaseConfigured(), []);
  const [cloudUserEmail, setCloudUserEmail] = useState<string | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<number | undefined>(undefined);
  const [busyAction, setBusyAction] = useState<string | null>(null);

  const runAction = async (id: string, action: () => Promise<void>) => {
    setBusyAction(id);
    try {
      await action();
      const settings = await getSettings();
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
      await resetLocalDataForAccount();
      const { error } = await supabase.auth.signOut();
      if (error) throw new Error(error.message);
      setCloudUserEmail(null);
      await upsertSettings({ cloudUserId: undefined, cloudUserEmail: undefined });
      toast.success('Signed out');
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
          <p className="text-xs text-muted-foreground">Data sync runs automatically after sign in.</p>
          <Button size="sm" variant="outline" className="w-full" onClick={handleSignOut} disabled={busyAction !== null}>
            Sign Out
          </Button>
        </div>
      )}
    </div>
  );
}
