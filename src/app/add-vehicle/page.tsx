'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { db } from '@/lib/db';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeft, Car } from 'lucide-react';
import { theme } from '@/lib/theme';
import { toast } from 'sonner';
import PushManager from '@/components/PushManager';
import { canonicalPlate, normalizePlate, normalizeVin, validatePlate, validateVin } from '@/utils/validation';
import { hapticSuccess, hapticTap } from '@/utils/haptics';
import { getSupabaseClient, isSupabaseConfigured } from '@/lib/supabaseClient';
import { isOwnerEmail } from '@/lib/adminAccess';

export default function AddVehicle() {
  const [plate, setPlate] = useState('');
  const [vin, setVin] = useState('');
  const [notes, setNotes] = useState('');
  const [fromFab, setFromFab] = useState(false);
  const [animateIn, setAnimateIn] = useState(false);
  const [animationReady, setAnimationReady] = useState(false);
  const [canAccessNotificationTesting, setCanAccessNotificationTesting] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const shouldAnimateFromFab = sessionStorage.getItem('animateAddVehicleFromFab') === '1';
    if (shouldAnimateFromFab) {
      sessionStorage.removeItem('animateAddVehicleFromFab');
      setFromFab(true);
    }

    setAnimationReady(true);
    const id = requestAnimationFrame(() => setAnimateIn(true));
    return () => cancelAnimationFrame(id);
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured()) {
      setCanAccessNotificationTesting(false);
      return;
    }
    const supabase = getSupabaseClient();
    const load = async () => {
      const { data } = await supabase.auth.getSession();
      setCanAccessNotificationTesting(isOwnerEmail(data.session?.user?.email));
    };
    load().catch((error) => {
      console.error('Failed to resolve owner access for push testing', error);
      setCanAccessNotificationTesting(false);
    });
    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      setCanAccessNotificationTesting(isOwnerEmail(session?.user?.email));
    });
    return () => {
      authListener.subscription.unsubscribe();
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const normalizedPlate = normalizePlate(plate);
    const normalizedVin = normalizeVin(vin);

    const plateError = validatePlate(normalizedPlate);
    if (plateError) {
      toast.error(plateError);
      return;
    }

    const vinError = validateVin(normalizedVin);
    if (vinError) {
      toast.error(vinError);
      return;
    }

    const existingVehicles = await db.vehicles.toArray();
    const plateCollision = existingVehicles.some(
      (vehicle) => canonicalPlate(vehicle.plate) === canonicalPlate(normalizedPlate)
    );
    if (plateCollision) {
      toast.error('A vehicle with this license plate already exists.');
      return;
    }

    if (normalizedVin) {
      const vinCollision = existingVehicles.some(
        (vehicle) => normalizeVin(vehicle.vin || '') === normalizedVin
      );
      if (vinCollision) {
        toast.error('A vehicle with this VIN already exists.');
        return;
      }
    }

    await db.vehicles.add({
      plate: normalizedPlate,
      vin: normalizedVin || undefined,
      notes: notes.trim() || undefined,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      deletedAt: null,
    });

    toast('Vehicle added successfully');
    hapticSuccess();
    router.push('/');
  };

  return (
    <div className="min-h-screen bg-background">
      <div
        className={`transition-all duration-200 ease-out ${
          !animationReady
            ? 'opacity-0'
            : fromFab && !animateIn
              ? 'translate-x-14 opacity-0'
              : 'translate-x-0 opacity-100'
        }`}
      >
        <main className="container max-w-2xl mx-auto px-4 py-6 pb-24">
        <div className="flex items-center gap-4 mb-6">
          <Button variant="ghost" size="sm" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-2xl font-bold">Add Vehicle</h1>
        </div>

        <Card className={`${theme.borderRadius.card} ${theme.shadows.card}`}>
          <CardHeader className="text-center pb-6">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
              <Car className="h-8 w-8 text-primary" />
            </div>
            <CardTitle className="text-xl">Vehicle Details</CardTitle>
            <p className={`text-sm ${theme.colors.textMuted} mt-2`}>
              Enter your vehicle information to start tracking expiries
            </p>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-2">
                <label className="text-sm font-medium">License Plate *</label>
                <Input
                  value={plate}
                  onChange={(e) => setPlate(e.target.value)}
                  placeholder="e.g. AB-12-XYZ"
                  className={`${theme.borderRadius.input}`}
                  required
                />
                <p className={`text-xs ${theme.colors.textMuted}`}>
                  Required field for vehicle identification
                </p>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">VIN (Vehicle Identification Number)</label>
                <Input
                  value={vin}
                  onChange={(e) => setVin(e.target.value)}
                  placeholder="17-character VIN (optional)"
                  className={`${theme.borderRadius.input}`}
                />
                <p className={`text-xs ${theme.colors.textMuted}`}>
                  Helps with more accurate checks
                </p>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Notes</label>
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Additional notes about the vehicle..."
                  className={`${theme.borderRadius.input} min-h-[80px]`}
                />
                <p className={`text-xs ${theme.colors.textMuted}`}>
                  Optional notes for reference
                </p>
              </div>

              <div className="flex gap-3 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    hapticTap();
                    router.back();
                  }}
                  className="flex-1 min-h-[44px]"
                >
                  Cancel
                </Button>
                <Button type="submit" className="flex-1 min-h-[44px]" disabled={!plate.trim()}>
                  Add Vehicle
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        {canAccessNotificationTesting && (
          <Card className={`${theme.borderRadius.card} ${theme.shadows.card} mt-6`}>
            <CardHeader>
              <CardTitle className="text-lg">Push Notification Test</CardTitle>
              <p className={`text-sm ${theme.colors.textMuted}`}>
                Schedule a test push in 5 seconds so you can lock the phone and verify delivery.
              </p>
            </CardHeader>
            <CardContent>
              <PushManager />
            </CardContent>
          </Card>
        )}
        </main>
      </div>
    </div>
  );
}
