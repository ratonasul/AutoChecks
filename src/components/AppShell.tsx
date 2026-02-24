'use client';

import type { ReactNode } from 'react';
import { Header } from '@/components/Header';
import { AuthGate } from '@/components/AuthGate';
import { CloudMutationSync } from '@/components/CloudMutationSync';

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <AuthGate>
      <CloudMutationSync />
      <Header />
      {children}
    </AuthGate>
  );
}
