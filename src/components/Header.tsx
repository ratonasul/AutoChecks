'use client';

import { Download, Upload, Settings, Moon, Sun, Monitor, Trash2, Info, Bell, UserCircle2, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { exportData } from '@/utils/exportData';
import { importData } from '@/utils/importData';
import { exportExcel } from '@/utils/exportExcel';
import { importExcel } from '@/utils/importExcel';
import { previewImport, type ImportPreview } from '@/utils/importPreview';
import { toast } from 'sonner';
import { useRef, useState, useEffect } from 'react';
import { useTheme } from 'next-themes';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { db } from '@/lib/db';
import { UsernameModal } from '@/components/UsernameModal';
import { calculateReminderState, calculateTriggerDate, defaultReminderSettings } from '@/services/reminders/reminderEngine';
import { getReminderSnoozeKey, isReminderSnoozed, snoozeReminder } from '@/services/reminders/reminderSnooze';
import { defaultFeatureFlags } from '@/lib/featureFlags';
import { getCompanyDisplayName, getSettings, upsertSettings } from '@/lib/settings';
import { flushQueuedRequests, getQueuedRequestCount } from '@/lib/networkQueue';
import { hapticSuccess, hapticTap } from '@/utils/haptics';
import { CloudSyncPanel } from '@/components/CloudSyncPanel';
import { isOwnerEmail } from '@/lib/adminAccess';
import { getSupabaseClient, isSupabaseConfigured } from '@/lib/supabaseClient';
import { getSyncStatus, type SyncStatusSnapshot, subscribeSyncStatus } from '@/lib/syncStatus';
import { retryCloudSyncNow } from '@/lib/cloudSync';
import { resetLocalDataForAccount } from '@/lib/cloudSync';
import PushManager from '@/components/PushManager';

function formatDateDDMMYYYY(millis: number) {
  const date = new Date(millis);
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
}

export function Header() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [usernameModalOpen, setUsernameModalOpen] = useState(false);
  const [appNameModalOpen, setAppNameModalOpen] = useState(false);
  const [companyProfileOpen, setCompanyProfileOpen] = useState(false);
  const [restoreOpen, setRestoreOpen] = useState(false);
  const [importPreviewOpen, setImportPreviewOpen] = useState(false);
  const [debugOpen, setDebugOpen] = useState(false);
  const [debugPushToolsOpen, setDebugPushToolsOpen] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [appNameInput, setAppNameInput] = useState('AutoChecks');
  const [companyContactInput, setCompanyContactInput] = useState('');
  const [companyTimezoneInput, setCompanyTimezoneInput] = useState('');
  const [lastExportAt, setLastExportAt] = useState<number | null>(null);
  const [pendingImportFile, setPendingImportFile] = useState<File | null>(null);
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null);
  const [debugTimeShiftDays, setDebugTimeShiftDays] = useState(0);
  const [, setSnoozeRefresh] = useState(0);
  const [username, setUsername] = useState('Guest');
  const [appName, setAppName] = useState('AutoChecks');
  const [isOnline, setIsOnline] = useState(true);
  const [queuedCount, setQueuedCount] = useState(0);
  const [canAccessOwnerTools, setCanAccessOwnerTools] = useState(false);
  const [accountEmail, setAccountEmail] = useState<string | null>(null);
  const [syncStatus, setSyncStatusState] = useState<SyncStatusSnapshot>(getSyncStatus());
  const { theme, setTheme } = useTheme();
  const vehicles = useLiveQuery(
    () => db.vehicles.toArray().then((items) => items.filter((vehicle) => !vehicle.deletedAt)),
    []
  );
  const deletedVehicles = useLiveQuery(
    () => db.vehicles.toArray().then((items) => items.filter((vehicle) => !!vehicle.deletedAt)),
    []
  );

  const reminderEntries = (vehicles || [])
    .map((vehicle) => {
      const docs = [
        { label: 'ITP', value: vehicle.itpExpiryMillis, key: 'ITP' },
        { label: 'RCA', value: vehicle.rcaExpiryMillis, key: 'RCA' },
        { label: 'Vignette', value: vehicle.vignetteExpiryMillis, key: 'VIGNETTE' },
      ]
        .filter((item) => {
          if (!item.value) return false;
          const key = getReminderSnoozeKey(vehicle.id || 0, item.key, item.value);
          if (defaultFeatureFlags.reminderSnooze && isReminderSnoozed(key)) return false;
          return calculateReminderState(item.value).showReminderBanner;
        })
        .map((item) => ({
          ...item,
          daysLeft: calculateReminderState(item.value!).daysLeft,
        }))
        .sort((a, b) => a.value! - b.value!);

      return {
        vehicleId: vehicle.id || 0,
        plate: vehicle.plate,
        docs,
      };
    })
    .filter((entry) => entry.docs.length > 0);

  const reminderDocCount = reminderEntries.reduce((count, entry) => count + entry.docs.length, 0);
  const reminderTypeCount = reminderEntries.reduce(
    (acc, entry) => {
      for (const doc of entry.docs) {
        if (doc.key === 'ITP') acc.itp += 1;
        if (doc.key === 'RCA') acc.rca += 1;
        if (doc.key === 'VIGNETTE') acc.vignette += 1;
      }
      return acc;
    },
    { itp: 0, rca: 0, vignette: 0 }
  );

  const handleSnooze = (vehicleId: number, docType: string, expiryMillis: number, durationMs: number, label: string) => {
    const key = getReminderSnoozeKey(vehicleId, docType, expiryMillis);
    snoozeReminder(key, durationMs);
    setSnoozeRefresh((value) => value + 1);
    hapticTap();
    toast.success(label);
  };

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const settings = await getSettings();
        if (settings.username) {
          setUsername(settings.username);
        }
        const displayName = getCompanyDisplayName(settings);
        setAppName(displayName);
        setAppNameInput(displayName);
        setCompanyContactInput(settings.companyContact || '');
        setCompanyTimezoneInput(settings.companyTimezone || Intl.DateTimeFormat().resolvedOptions().timeZone);
        setLastExportAt(settings.lastExportAt || null);
        if (settings.cloudLastSyncedAt) {
          setSyncStatusState({ state: 'synced', lastSyncedAt: settings.cloudLastSyncedAt });
        }
      } catch (error) {
        console.error('Failed to load settings:', error);
      }
    };
    loadSettings();
  }, []);

  useEffect(() => subscribeSyncStatus(setSyncStatusState), []);

  useEffect(() => {
    if (!isSupabaseConfigured()) {
      setCanAccessOwnerTools(false);
      return;
    }

    const supabase = getSupabaseClient();
    const load = async () => {
      const { data } = await supabase.auth.getSession();
      setAccountEmail(data.session?.user?.email ?? null);
      setCanAccessOwnerTools(isOwnerEmail(data.session?.user?.email));
    };
    load().catch((error) => {
      console.error('Failed to resolve owner access', error);
      setCanAccessOwnerTools(false);
    });

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      setAccountEmail(session?.user?.email ?? null);
      setCanAccessOwnerTools(isOwnerEmail(session?.user?.email));
    });

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    setIsOnline(typeof navigator !== 'undefined' ? navigator.onLine : true);
    setQueuedCount(getQueuedRequestCount());

    const handleOnline = async () => {
      setIsOnline(true);
      const result = await flushQueuedRequests();
      setQueuedCount(getQueuedRequestCount());
      if (result.sent > 0) {
        toast.success(`Sent ${result.sent} queued request(s)`);
      }
    };
    const handleOffline = () => {
      setIsOnline(false);
      setQueuedCount(getQueuedRequestCount());
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const handleSaveUsername = async (newUsername: string) => {
    try {
      await upsertSettings({ username: newUsername, appName });
      setUsername(newUsername);
      toast.success('Name updated');
    } catch (error) {
      toast.error('Failed to save name');
    }
  };

  const handleSaveAppName = async () => {
    const nextName = appNameInput.trim();
    if (!nextName) return;

    try {
      await upsertSettings({ appName: nextName, companyName: nextName, username });
      setAppName(nextName);
      setAppNameModalOpen(false);
      toast.success('App name updated');
    } catch (error) {
      toast.error('Failed to save app name');
    }
  };

  const handleSaveCompanyProfile = async () => {
    const name = appNameInput.trim();
    if (!name) return;
    try {
      await upsertSettings({
        appName: name,
        companyName: name,
        companyContact: companyContactInput.trim() || undefined,
        companyTimezone: companyTimezoneInput.trim() || undefined,
      });
      setAppName(name);
      setCompanyProfileOpen(false);
      toast.success('Company profile updated');
    } catch (error) {
      toast.error('Failed to save company profile');
    }
  };

  const handleExport = async () => {
    try {
      // export both Excel and JSON fallback
      await exportExcel();
      await exportData();
      setLastExportAt(Date.now());
      toast.success('Data exported successfully');
    } catch (error) {
      toast.error('Export failed');
    }
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const preview = await previewImport(file);
      setPendingImportFile(file);
      setImportPreview(preview);
      setImportPreviewOpen(true);
    } catch (error) {
      toast.error('Could not preview import file');
    }

    // Reset the input
    event.target.value = '';
  };

  const handleConfirmImport = async () => {
    if (!pendingImportFile) return;
    let result = await importExcel(pendingImportFile);
    if (!result.success) {
      result = await importData(pendingImportFile);
    }
    if (result.success) {
      toast.success(result.message);
    } else {
      toast.error(result.message);
    }
    setImportPreviewOpen(false);
    setPendingImportFile(null);
    setImportPreview(null);
  };

  const handleClearData = async () => {
    if (confirm('Are you sure you want to clear all data? This action cannot be undone.')) {
      try {
        const [vehiclesSnapshot, checksSnapshot, settingsSnapshot] = await Promise.all([
          db.vehicles.toArray(),
          db.checks.toArray(),
          db.settings.toArray(),
        ]);
        await db.vehicles.clear();
        await db.checks.clear();
        hapticTap();
        toast('All data cleared', {
          duration: 5000,
          action: {
            label: 'Undo',
            onClick: async () => {
              await db.transaction('rw', db.vehicles, db.checks, db.settings, async () => {
                await db.vehicles.clear();
                await db.checks.clear();
                await db.settings.clear();
                if (vehiclesSnapshot.length > 0) await db.vehicles.bulkAdd(vehiclesSnapshot);
                if (checksSnapshot.length > 0) await db.checks.bulkAdd(checksSnapshot);
                if (settingsSnapshot.length > 0) await db.settings.bulkAdd(settingsSnapshot);
              });
              hapticSuccess();
              toast.success('Data restored');
            },
          },
        });
      } catch (error) {
        toast.error('Failed to clear data');
      }
    }
  };

  const handleRestoreVehicle = async (vehicleId?: number) => {
    if (!vehicleId) return;
    await db.vehicles.update(vehicleId, { deletedAt: null, updatedAt: Date.now() });
    hapticSuccess();
    toast.success('Vehicle restored');
  };

  const handlePermanentDeleteVehicle = async (vehicleId?: number) => {
    if (!vehicleId) return;
    if (!confirm('Permanently delete this vehicle?')) return;
    await db.vehicles.delete(vehicleId);
    await db.checks.where('vehicleId').equals(vehicleId).delete();
    hapticTap();
    toast.success('Vehicle permanently deleted');
  };

  const getThemeIcon = () => {
    switch (theme) {
      case 'light':
        return <Sun className="h-4 w-4" />;
      case 'dark':
        return <Moon className="h-4 w-4" />;
      default:
        return <Monitor className="h-4 w-4" />;
    }
  };

  const debugSchedulePreview = (() => {
    const rows: Array<{ plate: string; doc: string; lead: number; trigger: number }> = [];
    const referenceNow = Date.now() + debugTimeShiftDays * 24 * 60 * 60 * 1000;
    for (const vehicle of vehicles || []) {
      const docs = [
        { name: 'ITP', expiry: vehicle.itpExpiryMillis },
        { name: 'RCA', expiry: vehicle.rcaExpiryMillis },
        { name: 'Vignette', expiry: vehicle.vignetteExpiryMillis },
      ];
      for (const doc of docs) {
        if (!doc.expiry) continue;
        for (const lead of defaultReminderSettings.leadDays) {
          const trigger = calculateTriggerDate(
            doc.expiry,
            lead,
            defaultReminderSettings.notifyHour,
            defaultReminderSettings.notifyMinute
          ).getTime();
          if (trigger > referenceNow) {
            rows.push({
              plate: vehicle.plate,
              doc: doc.name,
              lead,
              trigger,
            });
          }
        }
      }
    }
    return rows.sort((a, b) => a.trigger - b.trigger).slice(0, 12);
  })();

  const triggerShiftedDebugNotifications = async () => {
    const simulatedNow = Date.now() + debugTimeShiftDays * 24 * 60 * 60 * 1000;
    const dueRows: Array<{ plate: string; doc: string; expiry: number; lead: number }> = [];

    for (const vehicle of vehicles || []) {
      const docs = [
        { name: 'ITP', expiry: vehicle.itpExpiryMillis },
        { name: 'RCA', expiry: vehicle.rcaExpiryMillis },
        { name: 'Vignette', expiry: vehicle.vignetteExpiryMillis },
      ];
      for (const doc of docs) {
        if (!doc.expiry) continue;
        for (const lead of defaultReminderSettings.leadDays) {
          const trigger = calculateTriggerDate(
            doc.expiry,
            lead,
            defaultReminderSettings.notifyHour,
            defaultReminderSettings.notifyMinute
          ).getTime();
          const recentlyDue = trigger <= simulatedNow && trigger >= simulatedNow - 24 * 60 * 60 * 1000;
          if (!recentlyDue) continue;
          dueRows.push({ plate: vehicle.plate, doc: doc.name, expiry: doc.expiry, lead });
        }
      }
    }

    if (dueRows.length === 0) {
      toast.message('No reminders are due in the simulated window.');
      return;
    }

    if (typeof Notification === 'undefined') {
      toast.error('Notifications are not supported in this browser.');
      return;
    }

    if (Notification.permission !== 'granted') {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        toast.error('Notification permission was not granted.');
        return;
      }
    }

    const rowsToSend = dueRows.slice(0, 5);
    const reg = typeof navigator !== 'undefined' && 'serviceWorker' in navigator
      ? await navigator.serviceWorker.getRegistration()
      : null;

    for (const row of rowsToSend) {
      const title = `Debug Reminder: ${row.doc}`;
      const body = `${row.plate} expires on ${new Date(row.expiry).toLocaleDateString()} (${row.lead}d lead)`;
      if (reg) {
        await reg.showNotification(title, { body, icon: '/favicon.ico' });
      } else {
        new Notification(title, { body });
      }
    }

    toast.success(`Sent ${rowsToSend.length} debug notification(s).`);
  };

  const syncChip =
    syncStatus.state === 'syncing'
      ? { label: 'Syncing', dotClass: 'bg-blue-500' }
      : syncStatus.state === 'synced'
        ? { label: 'Synced', dotClass: 'bg-emerald-500' }
        : syncStatus.state === 'offline-pending'
          ? { label: 'Pending', dotClass: 'bg-amber-500' }
          : syncStatus.state === 'error'
            ? { label: 'Sync error', dotClass: 'bg-rose-500' }
            : { label: 'Idle', dotClass: 'bg-muted-foreground' };

  const formatLastSync = (value?: number) => {
    if (!value) return 'Never';
    return new Date(value).toLocaleString();
  };

  const ownerExportReminder =
    canAccessOwnerTools && (!lastExportAt || Date.now() - lastExportAt > 30 * 24 * 60 * 60 * 1000)
      ? 'Owner reminder: export a backup at least monthly.'
      : null;

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      {(!isOnline || queuedCount > 0 || syncStatus.state === 'offline-pending' || syncStatus.state === 'error' || !!ownerExportReminder) && (
        <div className="border-b px-4 py-1 text-xs sm:px-6 lg:px-8">
          {!isOnline && <span className="mr-3 text-amber-500">Offline mode active.</span>}
          {queuedCount > 0 && <span className="mr-3 text-blue-500">Queued requests: {queuedCount}</span>}
          <span className="mr-3 text-muted-foreground">Last sync: {formatLastSync(syncStatus.lastSyncedAt)}</span>
          {ownerExportReminder && <span className="mr-3 text-muted-foreground">{ownerExportReminder}</span>}
          {(syncStatus.state === 'offline-pending' || syncStatus.state === 'error') && (
            <Button
              variant="outline"
              size="sm"
              className="h-6 px-2 text-xs"
              onClick={async () => {
                try {
                  await retryCloudSyncNow();
                  toast.success('Cloud sync retry succeeded');
                } catch (error) {
                  const message = error instanceof Error ? error.message : 'Retry failed';
                  if (message !== 'Offline') {
                    toast.error(message);
                  }
                }
              }}
            >
              Retry sync
            </Button>
          )}
        </div>
      )}
      <div className="mx-auto flex min-h-14 w-full max-w-screen-2xl items-center justify-between px-4 py-2 sm:px-6 lg:px-8">
        <div className="flex min-w-0 items-center gap-2 pr-3">
          <h1 className="truncate text-lg font-semibold">{appName}</h1>
          <span
            className={`h-2.5 w-2.5 flex-shrink-0 rounded-full ${syncChip.dotClass}`}
            title={`Sync status: ${syncChip.label}`}
            aria-label={`Sync status: ${syncChip.label}`}
          >
            <span className="sr-only">Sync status: {syncChip.label}</span>
          </span>
        </div>
        <div className="flex items-center gap-1 sm:gap-2">
          <Dialog open={accountMenuOpen} onOpenChange={setAccountMenuOpen}>
            <DialogTrigger asChild>
              <Button variant="ghost" size="sm" title="Account">
                <UserCircle2 className="h-4 w-4" />
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-sm">
              <DialogHeader>
                <DialogTitle>Account</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">{accountEmail || 'Not signed in'}</p>
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={async () => {
                    try {
                      const supabase = getSupabaseClient();
                      await resetLocalDataForAccount();
                      const { error } = await supabase.auth.signOut();
                      if (error) throw new Error(error.message);
                      hapticTap();
                      toast.success('Signed out');
                      setAccountMenuOpen(false);
                    } catch (error) {
                      toast.error(error instanceof Error ? error.message : 'Failed to sign out');
                    }
                  }}
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  Sign Out
                </Button>
              </div>
            </DialogContent>
          </Dialog>
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="ghost" size="sm" title="Reminders" className="relative">
                <Bell className="h-4 w-4" />
                {reminderDocCount > 0 && (
                  <span className="absolute -right-1 -top-1 min-w-[1rem] rounded-full bg-destructive px-1 text-[10px] font-semibold text-destructive-foreground">
                    {reminderDocCount}
                  </span>
                )}
              </Button>
            </DialogTrigger>
              <DialogContent className="sm:max-w-lg">
              <DialogHeader>
                <DialogTitle>Notifications</DialogTitle>
                <DialogDescription>
                  All near-expiry documents are listed here.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-2 max-h-[50vh] overflow-auto">
                <div className="flex flex-wrap gap-2 pb-1">
                  <span className="text-xs rounded border px-2 py-1">ITP: {reminderTypeCount.itp}</span>
                  <span className="text-xs rounded border px-2 py-1">RCA: {reminderTypeCount.rca}</span>
                  <span className="text-xs rounded border px-2 py-1">Vignette: {reminderTypeCount.vignette}</span>
                </div>
                {reminderEntries.length === 0 ? (
                  <div className="text-sm text-muted-foreground py-2">No upcoming reminders</div>
                ) : (
                  reminderEntries.map((entry) => {
                    return (
                      <div key={entry.vehicleId} className="rounded border p-3">
                        <div className="font-medium text-sm">{entry.plate}</div>
                        {entry.docs.length > 0 ? (
                          <div className="mt-1 space-y-1">
                            {entry.docs.map((item) => (
                              <div key={`${entry.vehicleId}-${item.key}`} className="rounded border px-2 py-2">
                                <div className="text-xs text-muted-foreground">
                                  {item.label}: {formatDateDDMMYYYY(item.value!)} ({item.daysLeft}d)
                                </div>
                                <div className="mt-2 flex flex-wrap gap-2">
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => handleSnooze(entry.vehicleId, item.key, item.value!, 24 * 60 * 60 * 1000, `${item.label} snoozed for 1 day`)}
                                  >
                                    Snooze 1d
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => handleSnooze(entry.vehicleId, item.key, item.value!, 7 * 24 * 60 * 60 * 1000, `${item.label} snoozed for 1 week`)}
                                  >
                                    Snooze 1w
                                  </Button>
                                  <Button
                                    size="sm"
                                    onClick={() => handleSnooze(entry.vehicleId, item.key, item.value!, 90 * 24 * 60 * 60 * 1000, `${item.label} marked renewed`)}
                                  >
                                    Mark renewed
                                  </Button>
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="text-xs text-muted-foreground mt-1">No expiry set</div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </DialogContent>
          </Dialog>
          <Button variant="ghost" size="sm" onClick={handleExport} title="Export Data">
            <Download className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={handleImportClick} title="Import Data">
            <Upload className="h-4 w-4" />
          </Button>
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="ghost" size="sm" title="Excel format help">
                <Info className="h-4 w-4" />
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-lg">
              <DialogHeader>
                <DialogTitle>Excel Import / Export Format</DialogTitle>
                <DialogDescription>
                  The Excel file should contain a <strong>Vehicles</strong> sheet and an optional <strong>Checks</strong> sheet.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <div>
                  <h4 className="font-medium">Vehicles sheet</h4>
                  <p className="text-sm text-muted-foreground">Columns: <em>id, plate, vin, notes, itpExpiry, rcaExpiry, vignetteExpiry, createdAt</em>. Date columns may be Excel dates or ISO strings (yyyy-mm-dd).</p>
                </div>
                <div>
                  <h4 className="font-medium">Checks sheet (optional)</h4>
                  <p className="text-sm text-muted-foreground">Columns: <em>id, vehicleId, type, status, expiry, checkedAt</em>. Dates are accepted as Excel dates.</p>
                </div>
                <div>
                  <h4 className="font-medium">Notes</h4>
                  <p className="text-sm text-muted-foreground">Export will also produce a JSON file as fallback. VINs are treated as strings to avoid scientific notation.</p>
                </div>
              </div>
            </DialogContent>
          </Dialog>
          <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
            <DialogTrigger asChild>
              <Button variant="ghost" size="sm" title="Settings">
                <Settings className="h-4 w-4" />
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Settings</DialogTitle>
                <DialogDescription>
                  Customize your experience
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-6">
                <div className="space-y-3">
                  <h4 className="text-sm font-medium">User</h4>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setUsernameModalOpen(true)}
                    className="w-full justify-start"
                  >
                    Name: {username}
                  </Button>
                </div>

                <div className="space-y-3">
                  <h4 className="text-sm font-medium">Branding</h4>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setAppNameModalOpen(true)}
                    className="w-full justify-start"
                  >
                    App name: {appName}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCompanyProfileOpen(true)}
                    className="w-full justify-start"
                  >
                    Company profile
                  </Button>
                </div>

                <div className="space-y-3">
                  <h4 className="text-sm font-medium">Theme</h4>
                  <div className="flex gap-2">
                    <Button
                      variant={theme === 'light' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setTheme('light')}
                      className="flex items-center gap-2"
                    >
                      <Sun className="h-4 w-4" />
                      Light
                    </Button>
                    <Button
                      variant={theme === 'dark' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setTheme('dark')}
                      className="flex items-center gap-2"
                    >
                      <Moon className="h-4 w-4" />
                      Dark
                    </Button>
                    <Button
                      variant={theme === 'system' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setTheme('system')}
                      className="flex items-center gap-2"
                    >
                      <Monitor className="h-4 w-4" />
                      System
                    </Button>
                  </div>
                </div>

                <div className="space-y-3">
                  <h4 className="text-sm font-medium">Data Management</h4>
                  <CloudSyncPanel />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setRestoreOpen(true)}
                    className="flex items-center gap-2"
                  >
                    Restore Deleted Vehicles ({deletedVehicles?.length || 0})
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={handleClearData}
                    className="flex items-center gap-2"
                  >
                    <Trash2 className="h-4 w-4" />
                    Clear All Data
                  </Button>
                </div>

                {canAccessOwnerTools && (
                  <div className="space-y-3">
                    <h4 className="text-sm font-medium">Owner Tools</h4>
                    <Button variant="outline" size="sm" onClick={() => setDebugOpen(true)}>
                      Debug Tools
                    </Button>
                  </div>
                )}
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept=".json,.xlsx,.xls"
        onChange={handleFileChange}
        className="hidden"
      />
      <UsernameModal
        open={usernameModalOpen}
        onOpenChange={setUsernameModalOpen}
        currentUsername={username}
        onSave={handleSaveUsername}
      />
      <Dialog open={appNameModalOpen} onOpenChange={setAppNameModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Set App Name</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <input
              value={appNameInput}
              onChange={(e) => setAppNameInput(e.target.value)}
              placeholder="Company name"
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            />
            <div className="flex gap-2">
              <Button onClick={handleSaveAppName} className="flex-1">
                Save
              </Button>
              <Button variant="outline" onClick={() => setAppNameModalOpen(false)} className="flex-1">
                Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={companyProfileOpen} onOpenChange={setCompanyProfileOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Company Profile</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium">Company Name</label>
              <Input value={appNameInput} onChange={(e) => setAppNameInput(e.target.value)} />
            </div>
            <div>
              <label className="text-sm font-medium">Contact</label>
              <Input value={companyContactInput} onChange={(e) => setCompanyContactInput(e.target.value)} />
            </div>
            <div>
              <label className="text-sm font-medium">Timezone</label>
              <Input value={companyTimezoneInput} onChange={(e) => setCompanyTimezoneInput(e.target.value)} />
            </div>
            <div className="flex gap-2">
              <Button className="flex-1" onClick={handleSaveCompanyProfile}>Save</Button>
              <Button className="flex-1" variant="outline" onClick={() => setCompanyProfileOpen(false)}>Cancel</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={restoreOpen} onOpenChange={setRestoreOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Restore Deleted Vehicles</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 max-h-[45vh] overflow-auto">
            {!deletedVehicles || deletedVehicles.length === 0 ? (
              <p className="text-sm text-muted-foreground">No deleted vehicles.</p>
            ) : (
              deletedVehicles.map((vehicle) => (
                <div key={vehicle.id} className="flex items-center justify-between rounded border p-2">
                  <div>
                    <div className="text-sm font-medium">{vehicle.plate}</div>
                    <div className="text-xs text-muted-foreground">
                      Deleted: {vehicle.deletedAt ? formatDateDDMMYYYY(vehicle.deletedAt) : '-'}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => handleRestoreVehicle(vehicle.id)}>
                      Restore
                    </Button>
                    <Button size="sm" variant="destructive" onClick={() => handlePermanentDeleteVehicle(vehicle.id)}>
                      Delete
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={importPreviewOpen} onOpenChange={setImportPreviewOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Import Preview</DialogTitle>
          </DialogHeader>
          {importPreview ? (
            <div className="space-y-2 text-sm">
              <div>Format: {importPreview.format.toUpperCase()}</div>
              <div>Total rows: {importPreview.totalRows}</div>
              <div>Will import: {importPreview.willImport}</div>
              <div>Duplicates skipped: {importPreview.duplicates}</div>
              <div>Missing plate skipped: {importPreview.missingPlate}</div>
              <div className="flex gap-2 pt-2">
                <Button className="flex-1" onClick={handleConfirmImport}>Import</Button>
                <Button className="flex-1" variant="outline" onClick={() => setImportPreviewOpen(false)}>Cancel</Button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No preview available.</p>
          )}
        </DialogContent>
      </Dialog>
      <Dialog open={debugOpen} onOpenChange={setDebugOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Debug Tools</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <div>Online: {isOnline ? 'yes' : 'no'}</div>
            <div>Queued requests: {queuedCount}</div>
            <div>
              Service worker: {typeof window !== 'undefined' && 'serviceWorker' in navigator ? 'available' : 'missing'}
            </div>
            <div>
              Push manager: {typeof window !== 'undefined' && 'PushManager' in window ? 'available' : 'missing'}
            </div>
            <div>
              Notification permission: {typeof Notification !== 'undefined' ? Notification.permission : 'unsupported'}
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Time shift (days)</label>
              <Input
                type="number"
                value={String(debugTimeShiftDays)}
                onChange={(e) => setDebugTimeShiftDays(Number(e.target.value) || 0)}
              />
              <p className="text-xs text-muted-foreground">
                Simulated now: {new Date(Date.now() + debugTimeShiftDays * 24 * 60 * 60 * 1000).toLocaleString()}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                onClick={async () => {
                  if (queuedCount === 0) {
                    toast.message('No queued requests. Queue is only used when you were offline and actions needed retry.');
                    return;
                  }
                  const result = await flushQueuedRequests();
                  setQueuedCount(getQueuedRequestCount());
                  toast(`Queue flush: ${result.sent} sent, ${result.failed} failed`);
                }}
                className="min-w-[160px] flex-1 sm:flex-none"
                disabled={queuedCount === 0}
              >
                Send Queued Requests
              </Button>
              <Button
                variant="outline"
                onClick={() => setDebugPushToolsOpen((value) => !value)}
                className="min-w-[160px] flex-1 sm:flex-none"
              >
                {debugPushToolsOpen ? 'Hide Notification Test' : 'Notification Test'}
              </Button>
              <Button
                variant="outline"
                onClick={triggerShiftedDebugNotifications}
                className="min-w-[160px] flex-1 sm:flex-none"
              >
                Run Shifted Notifications
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Send Queued Requests retries pending offline network calls. If you were always online, this stays at 0.
            </p>
            {debugPushToolsOpen && (
              <div className="rounded border p-2">
                <PushManager />
              </div>
            )}
            <div className="space-y-1">
              <p className="text-sm font-medium">Schedule Preview</p>
              <div className="max-h-40 overflow-auto rounded border">
                {debugSchedulePreview.length === 0 ? (
                  <p className="p-2 text-xs text-muted-foreground">No upcoming schedule rows.</p>
                ) : (
                  debugSchedulePreview.map((row, idx) => (
                    <div key={`${row.plate}-${row.doc}-${row.lead}-${idx}`} className="grid grid-cols-4 gap-2 border-b p-2 text-xs">
                      <span className="truncate">{row.plate}</span>
                      <span>{row.doc}</span>
                      <span>{row.lead}d</span>
                      <span>{new Date(row.trigger).toLocaleString()}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </header>
  );
}
