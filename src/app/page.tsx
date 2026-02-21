"use client";

import { db, type Vehicle } from '@/lib/db';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Plus, Download, Upload } from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import Link from 'next/link';
import { VehicleCard } from '@/components/VehicleCard';
import { calculateReminderState } from '@/services/reminders/reminderEngine';
import { exportData } from '@/utils/exportData';
import { importData } from '@/utils/importData';
import { StatusPill } from '@/components/StatusPill';
import { theme } from '@/lib/theme';
import { toast } from 'sonner';
import UpcomingReminders from '@/components/UpcomingReminders';
import { GreetingScreen } from '@/components/GreetingScreen';
import { useState, useEffect } from 'react';

export default function Home() {
  const vehicles = useLiveQuery(() => db.vehicles.toArray(), []);
  const [showGreeting, setShowGreeting] = useState(false);
  const [username, setUsername] = useState('Guest');

  useEffect(() => {
    const loadGreeting = async () => {
      try {
        const hasShownGreeting = sessionStorage.getItem('greetingShown');
        if (!hasShownGreeting) {
          const settings = await db.settings.toArray();
          if (settings.length > 0 && settings[0].username) {
            setUsername(settings[0].username);
          }
          setShowGreeting(true);
          sessionStorage.setItem('greetingShown', 'true');
        }
      } catch (error) {
        console.error('Failed to load greeting:', error);
      }
    };
    loadGreeting();
  }, []);

  const handleGreetingDismiss = () => {
    setShowGreeting(false);
  };

  const upcomingVehicles = vehicles?.filter(v => {
    const expiries = [v.itpExpiryMillis, v.rcaExpiryMillis, v.vignetteExpiryMillis].filter(Boolean);
    return expiries.some(e => calculateReminderState(e!).showReminderBanner);
  }) || [];

  const handleExport = () => {
    exportData();
    toast('Data exported');
  };

  const handleImport = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      importData(file).then(result => {
        toast(result.message);
      });
    }
  };

  const hasVehicles = vehicles && vehicles.length > 0;

  return (
    <div className="min-h-screen bg-background">
      {showGreeting && <GreetingScreen username={username} onDismiss={handleGreetingDismiss} />}
      <main className="container max-w-2xl mx-auto px-4 py-6 pb-24">
        {upcomingVehicles.length > 0 && (
          <UpcomingReminders upcoming={upcomingVehicles} />
        )}

        {!hasVehicles && (
          <Card className={`text-center py-12 ${theme.borderRadius.card} ${theme.shadows.card}`}>
            <CardContent>
              <div className="space-y-4">
                <div className="text-6xl">🚗</div>
                <h2 className="text-xl font-semibold">No vehicles yet</h2>
                <p className={`text-sm ${theme.colors.textMuted}`}>Add your first vehicle to start tracking expiries</p>
                <Link href="/add-vehicle">
                  <Button className="mt-4">
                    <Plus className="mr-2 h-4 w-4" />
                    Add Vehicle
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        )}

        {hasVehicles && (
          <div className="space-y-4">
            {vehicles.map(vehicle => (
              <VehicleCard key={vehicle.id} vehicle={vehicle} onCheckSave={() => {}} />
            ))}
          </div>
        )}

        <Link href="/add-vehicle">
          <Button className={`fixed bottom-6 right-6 ${theme.borderRadius.button} h-14 w-14 shadow-lg`}>
            <Plus className="h-6 w-6" />
          </Button>
        </Link>
      </main>
    </div>
  );
}
