"use client";

import { db, type Vehicle } from '@/lib/db';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Plus, SlidersHorizontal } from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { VehicleCard } from '@/components/VehicleCard';
import { theme } from '@/lib/theme';
import { GreetingScreen } from '@/components/GreetingScreen';
import { useState, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { calculateReminderState } from '@/services/reminders/reminderEngine';
import { hapticTap } from '@/utils/haptics';

type FilterMode = 'all' | 'expired' | '7d' | '30d' | 'no-expiry';
type SortMode = 'nearest' | 'plate' | 'recent';

const HOME_VIEW_PREFS_KEY = 'autochecks-home-view-v1';

function getNearestExpiry(vehicle: Vehicle): number | null {
  const expiries = [vehicle.itpExpiryMillis, vehicle.rcaExpiryMillis, vehicle.vignetteExpiryMillis]
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  if (expiries.length === 0) return null;
  return Math.min(...expiries);
}

export default function Home() {
  const vehicles = useLiveQuery(
    () => db.vehicles.toArray().then((items) => items.filter((vehicle) => !vehicle.deletedAt)),
    []
  );
  const [showGreeting, setShowGreeting] = useState(false);
  const [username, setUsername] = useState('Guest');
  const [isFabNavigating, setIsFabNavigating] = useState(false);
  const [search, setSearch] = useState('');
  const [filterMode, setFilterMode] = useState<FilterMode>('all');
  const [sortMode, setSortMode] = useState<SortMode>('nearest');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const router = useRouter();

  useEffect(() => {
    try {
      const raw = localStorage.getItem(HOME_VIEW_PREFS_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as {
        search?: string;
        filterMode?: FilterMode;
        sortMode?: SortMode;
      };
      if (typeof parsed.search === 'string') setSearch(parsed.search);
      if (parsed.filterMode) setFilterMode(parsed.filterMode);
      if (parsed.sortMode) setSortMode(parsed.sortMode);
    } catch (error) {
      console.error('Failed to load home view prefs', error);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(
      HOME_VIEW_PREFS_KEY,
      JSON.stringify({
        search,
        filterMode,
        sortMode,
      })
    );
  }, [search, filterMode, sortMode]);

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

  const handleAddVehicleFromFab = () => {
    if (isFabNavigating) return;
    hapticTap();
    setIsFabNavigating(true);
    setTimeout(() => {
      sessionStorage.setItem('animateAddVehicleFromFab', '1');
      router.push('/add-vehicle');
    }, 180);
  };

  const hasVehicles = vehicles && vehicles.length > 0;
  const normalizedSearch = search.trim().toLowerCase();
  const filteredVehicles = (vehicles || [])
    .filter((vehicle) => {
      if (!normalizedSearch) return true;
      const haystack = [vehicle.plate, vehicle.vin || '', vehicle.notes || ''].join(' ').toLowerCase();
      return haystack.includes(normalizedSearch);
    })
    .filter((vehicle) => {
      const expiries = [vehicle.itpExpiryMillis, vehicle.rcaExpiryMillis, vehicle.vignetteExpiryMillis]
        .filter((value): value is number => typeof value === 'number');

      switch (filterMode) {
        case 'expired':
          return expiries.some((expiry) => calculateReminderState(expiry).daysLeft < 0);
        case '7d':
          return expiries.some((expiry) => {
            const state = calculateReminderState(expiry);
            return state.daysLeft >= 0 && state.daysLeft <= 7;
          });
        case '30d':
          return expiries.some((expiry) => {
            const state = calculateReminderState(expiry);
            return state.daysLeft >= 0 && state.daysLeft <= 30;
          });
        case 'no-expiry':
          return expiries.length === 0;
        case 'all':
        default:
          return true;
      }
    })
    .sort((a, b) => {
      if (sortMode === 'plate') return a.plate.localeCompare(b.plate);
      if (sortMode === 'recent') return b.createdAt - a.createdAt;

      const nearestA = getNearestExpiry(a);
      const nearestB = getNearestExpiry(b);
      if (nearestA === null && nearestB === null) return a.plate.localeCompare(b.plate);
      if (nearestA === null) return 1;
      if (nearestB === null) return -1;
      return nearestA - nearestB;
    });

  return (
    <div className="min-h-screen bg-background">
      {showGreeting && <GreetingScreen username={username} onDismiss={handleGreetingDismiss} />}
      <main className="container max-w-2xl mx-auto px-4 py-6 pb-24">
        <Card className={`mb-4 ${theme.borderRadius.card} ${theme.shadows.card}`}>
          <CardContent className="space-y-3 p-3">
            <div className="flex items-center gap-2">
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search by plate, VIN, notes..."
                className="flex-1"
              />
              <Button
                size="sm"
                variant={filtersOpen ? 'default' : 'outline'}
                onClick={() => setFiltersOpen((value) => !value)}
                aria-label="Toggle filters"
              >
                <SlidersHorizontal className="h-4 w-4" />
              </Button>
            </div>
            {filtersOpen && (
              <>
                <div className="flex flex-wrap gap-2">
                  {[
                    { id: 'all', label: 'All' },
                    { id: 'expired', label: 'Expired' },
                    { id: '7d', label: '7 days' },
                    { id: '30d', label: '30 days' },
                    { id: 'no-expiry', label: 'No expiry' },
                  ].map((chip) => (
                    <Button
                      key={chip.id}
                      size="sm"
                      variant={filterMode === chip.id ? 'default' : 'outline'}
                      onClick={() => setFilterMode(chip.id as FilterMode)}
                    >
                      {chip.label}
                    </Button>
                  ))}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant={sortMode === 'nearest' ? 'default' : 'outline'}
                    onClick={() => setSortMode('nearest')}
                  >
                    Sort: Nearest expiry
                  </Button>
                  <Button
                    size="sm"
                    variant={sortMode === 'plate' ? 'default' : 'outline'}
                    onClick={() => setSortMode('plate')}
                  >
                    Sort: Plate
                  </Button>
                  <Button
                    size="sm"
                    variant={sortMode === 'recent' ? 'default' : 'outline'}
                    onClick={() => setSortMode('recent')}
                  >
                    Sort: Recent
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>

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

        {hasVehicles && filteredVehicles.length > 0 && (
          <div className="space-y-4">
            {filteredVehicles.map(vehicle => (
              <VehicleCard key={vehicle.id} vehicle={vehicle} onCheckSave={() => {}} />
            ))}
          </div>
        )}
        {hasVehicles && filteredVehicles.length === 0 && (
          <Card className={`text-center py-8 ${theme.borderRadius.card} ${theme.shadows.card}`}>
            <CardContent>
              <p className="text-sm text-muted-foreground">No vehicles match your current filters.</p>
            </CardContent>
          </Card>
        )}

        <div
          className={`fixed bottom-6 right-6 transition-all duration-200 ease-out ${
            isFabNavigating ? 'scale-95 opacity-85' : 'scale-100 opacity-100'
          }`}
        >
          <Button
            onClick={handleAddVehicleFromFab}
            className={`${theme.borderRadius.button} h-14 w-14 shadow-lg`}
            aria-label="Add vehicle"
          >
            <Plus className="h-6 w-6" />
          </Button>
        </div>
      </main>
    </div>
  );
}
