'use client';

import { Download, Upload, Settings, Moon, Sun, Monitor, Trash2, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { exportData } from '@/utils/exportData';
import { importData } from '@/utils/importData';
import { exportExcel } from '@/utils/exportExcel';
import { importExcel } from '@/utils/importExcel';
import { toast } from 'sonner';
import { useRef, useState, useEffect } from 'react';
import { useTheme } from 'next-themes';
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

export function Header() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [usernameModalOpen, setUsernameModalOpen] = useState(false);
  const [username, setUsername] = useState('Guest');
  const { theme, setTheme } = useTheme();

  useEffect(() => {
    const loadUsername = async () => {
      try {
        const settings = await db.settings.toArray();
        if (settings.length > 0 && settings[0].username) {
          setUsername(settings[0].username);
        }
      } catch (error) {
        console.error('Failed to load username:', error);
      }
    };
    loadUsername();
  }, []);

  const handleSaveUsername = async (newUsername: string) => {
    try {
      const settings = await db.settings.toArray();
      if (settings.length > 0) {
        await db.settings.update(settings[0].id!, { username: newUsername });
      } else {
        await db.settings.add({ username: newUsername });
      }
      setUsername(newUsername);
      toast.success('Name updated');
    } catch (error) {
      toast.error('Failed to save name');
    }
  };

  const handleExport = async () => {
    try {
      // export both Excel and JSON fallback
      await exportExcel();
      await exportData();
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

    // try Excel import first, fall back to JSON import
    let result = await importExcel(file);
    if (!result.success) {
      result = await importData(file);
    }
    if (result.success) {
      toast.success(result.message);
    } else {
      toast.error(result.message);
    }

    // Reset the input
    event.target.value = '';
  };

  const handleClearData = async () => {
    if (confirm('Are you sure you want to clear all data? This action cannot be undone.')) {
      try {
        await db.vehicles.clear();
        await db.checks.clear();
        toast.success('All data cleared successfully');
        // Refresh the page to update the UI
        window.location.reload();
      } catch (error) {
        toast.error('Failed to clear data');
      }
    }
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

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-14 max-w-2xl items-center justify-between px-4">
        <h1 className="text-lg font-semibold">AutoChecks</h1>
        <div className="flex items-center gap-2">
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
                  Customize your AutoChecks experience
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

                <div className="space-y-3">
                  <h4 className="text-sm font-medium">About</h4>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Info className="h-4 w-4" />
                    AutoChecks v1.0 - Vehicle expiry tracking PWA
                  </div>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept=".json"
        onChange={handleFileChange}
        className="hidden"
      />
      <UsernameModal
        open={usernameModalOpen}
        onOpenChange={setUsernameModalOpen}
        currentUsername={username}
        onSave={handleSaveUsername}
      />
    </header>
  );
}