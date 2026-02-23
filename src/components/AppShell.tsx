'use client';

import type { ReactNode } from 'react';
import { Header } from '@/components/Header';
import { AuthGate } from '@/components/AuthGate';

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <AuthGate>
      <Header />
      {children}
    </AuthGate>
  );
}
