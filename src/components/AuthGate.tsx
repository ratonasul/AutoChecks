'use client';

import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { GreetingScreen } from '@/components/GreetingScreen';
import { getSupabaseClient, isSupabaseConfigured } from '@/lib/supabaseClient';
import { smartSync } from '@/lib/cloudSync';
import { getSettings, upsertSettings } from '@/lib/settings';

type GatePhase = 'checking' | 'auth' | 'greeting' | 'syncing' | 'ready';

function fallbackNameFromEmail(email?: string | null): string {
  if (!email) return 'Welcome';
  const part = email.split('@')[0]?.trim();
  return part || 'Welcome';
}

function passwordChecks(password: string) {
  return {
    minLength: password.length >= 10,
    upper: /[A-Z]/.test(password),
    lower: /[a-z]/.test(password),
    number: /\d/.test(password),
    symbol: /[^A-Za-z0-9]/.test(password),
  };
}

function passwordStrength(password: string): 'weak' | 'medium' | 'strong' {
  const checks = passwordChecks(password);
  const score = Object.values(checks).filter(Boolean).length;
  if (score >= 5) return 'strong';
  if (score >= 3) return 'medium';
  return 'weak';
}

function normalizeAuthError(message: string): string {
  const value = message.toLowerCase();
  if (value.includes('leaked') || value.includes('breach') || value.includes('pwned') || value.includes('compromised')) {
    return 'This password appears in a known data breach. Choose a different password or use a longer passphrase.';
  }
  return message;
}

export function AuthGate({ children }: { children: ReactNode }) {
  const configured = useMemo(() => isSupabaseConfigured(), []);
  const [phase, setPhase] = useState<GatePhase>('checking');
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [syncBusy, setSyncBusy] = useState(false);
  const [userIdForSync, setUserIdForSync] = useState<string | null>(null);
  const [greetingName, setGreetingName] = useState('Welcome');
  const checks = passwordChecks(password);
  const strength = passwordStrength(password);
  const signupPolicyPassed = checks.minLength && checks.upper && checks.lower && checks.number && checks.symbol;

  useEffect(() => {
    if (!configured) {
      setPhase('ready');
      return;
    }

    const supabase = getSupabaseClient();

    const bootstrap = async () => {
      const { data, error } = await supabase.auth.getUser();
      if (error || !data.user) {
        await supabase.auth.signOut();
        setPhase('auth');
        return;
      }
      const user = data.user;
      if (!user) {
        setPhase('auth');
        return;
      }

      await upsertSettings({ cloudUserEmail: user.email ?? undefined });

      // Existing sessions skip greeting and continue directly to app.
      setPhase('ready');
      smartSync(user.id).catch((error) => {
        const message = error instanceof Error ? error.message : 'Background sync failed';
        if (message.toLowerCase().includes('sub claim in jwt')) {
          supabase.auth.signOut().finally(() => setPhase('auth'));
          toast.error('Session expired. Please sign in again.');
          return;
        }
        toast.error(message);
      });
    };

    bootstrap().catch((error) => {
      console.error('Failed to initialize auth gate', error);
      setPhase('auth');
    });

    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      const run = async () => {
        const user = session?.user;
        if (!user) {
          setPhase('auth');
          return;
        }

        await upsertSettings({ cloudUserEmail: user.email ?? undefined });

        if (event === 'SIGNED_IN') {
          const settings = await getSettings();
          setGreetingName(settings.username?.trim() || fallbackNameFromEmail(user.email));
          setUserIdForSync(user.id);
          sessionStorage.setItem('greetingShown', 'true');
          setPhase('greeting');
          return;
        }

        setPhase('ready');
      };

      run().catch((error) => {
        console.error('Auth state change failed', error);
        supabase.auth.signOut().finally(() => setPhase('auth'));
        setPhase('auth');
      });
    });

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, [configured]);

  const handleAuthSubmit = async () => {
    const trimmedEmail = email.trim();
    if (!trimmedEmail || !password) {
      toast.error('Email and password are required');
      return;
    }

    const supabase = getSupabaseClient();
    setBusy(true);
    try {
      if (mode === 'signin') {
        const { error } = await supabase.auth.signInWithPassword({
          email: trimmedEmail,
          password,
        });
        if (error) throw new Error(error.message);
        return;
      }

      if (!signupPolicyPassed) {
        toast.error('Password does not meet the required policy.');
        return;
      }

      const { data, error } = await supabase.auth.signUp({
        email: trimmedEmail,
        password,
      });
      if (error) throw new Error(error.message);
      if (!data.session) {
        toast.success('Account created. Check your email to confirm, then sign in.');
      }
    } catch (error) {
      const message = error instanceof Error ? normalizeAuthError(error.message) : 'Authentication failed';
      toast.error(message);
    } finally {
      setBusy(false);
    }
  };

  const handleGreetingDismiss = async () => {
    if (!userIdForSync) {
      setPhase('ready');
      return;
    }
    setPhase('syncing');
    setSyncBusy(true);
    try {
      const result = await smartSync(userIdForSync);
      if (result === 'pulled') toast.success('Sync complete: downloaded cloud data');
      if (result === 'pushed') toast.success('Sync complete: uploaded local data');
      if (result === 'pushed-new') toast.success('Sync complete: created cloud backup');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Sync failed');
    } finally {
      setSyncBusy(false);
      setUserIdForSync(null);
      setPhase('ready');
    }
  };

  if (phase === 'checking') {
    return <div className="min-h-screen bg-background" />;
  }

  if (phase === 'auth') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="w-full max-w-md space-y-4 rounded-lg border bg-card p-5">
          <div className="space-y-1">
            <h1 className="text-xl font-semibold">AutoChecks Account</h1>
            <p className="text-sm text-muted-foreground">Sign in to access and sync your account data.</p>
          </div>
          <Input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
          <Input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          {mode === 'signup' && (
            <div className="space-y-2 rounded border p-3">
              <div className="flex items-center justify-between text-xs">
                <span>Password strength</span>
                <span
                  className={
                    strength === 'strong'
                      ? 'text-emerald-500'
                      : strength === 'medium'
                        ? 'text-amber-500'
                        : 'text-rose-500'
                  }
                >
                  {strength}
                </span>
              </div>
              <ul className="space-y-1 text-xs text-muted-foreground">
                <li>{checks.minLength ? 'OK' : 'Missing'} at least 10 characters</li>
                <li>{checks.upper ? 'OK' : 'Missing'} an uppercase letter</li>
                <li>{checks.lower ? 'OK' : 'Missing'} a lowercase letter</li>
                <li>{checks.number ? 'OK' : 'Missing'} a number</li>
                <li>{checks.symbol ? 'OK' : 'Missing'} a symbol</li>
              </ul>
              <p className="text-xs text-muted-foreground">
                Breached-password checks should also be enabled in Supabase Auth settings.
              </p>
            </div>
          )}
          <div className="flex gap-2">
            <Button className="flex-1" onClick={handleAuthSubmit} disabled={busy || (mode === 'signup' && !signupPolicyPassed)}>
              {mode === 'signin' ? 'Sign In' : 'Sign Up'}
            </Button>
            <Button
              className="flex-1"
              variant="outline"
              onClick={() => setMode((value) => (value === 'signin' ? 'signup' : 'signin'))}
              disabled={busy}
            >
              {mode === 'signin' ? 'Need account?' : 'Have account?'}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      {children}
      {phase === 'greeting' && <GreetingScreen username={greetingName} onDismiss={handleGreetingDismiss} />}
      {phase === 'syncing' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/95">
          <div className="space-y-2 text-center">
            <p className="text-lg font-medium">Syncing your data...</p>
            <p className="text-sm text-muted-foreground">{syncBusy ? 'Please wait.' : ''}</p>
          </div>
        </div>
      )}
    </>
  );
}
