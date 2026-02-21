"use client";

import React, { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { theme } from '@/lib/theme';
import type { Vehicle } from '@/lib/db';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { calculateReminderState } from '@/services/reminders/reminderEngine';

interface UpcomingRemindersProps {
  upcoming: Vehicle[];
}

export default function UpcomingReminders({ upcoming }: UpcomingRemindersProps) {
  const [open, setOpen] = useState(true);

  const nextExpiry = (v: Vehicle) => Math.min(
    v.itpExpiryMillis || Infinity,
    v.rcaExpiryMillis || Infinity,
    v.vignetteExpiryMillis || Infinity
  );

  const getNextExpiryInfo = (v: Vehicle) => {
    const itp = { type: 'ITP', millis: v.itpExpiryMillis || Infinity };
    const rca = { type: 'RCA', millis: v.rcaExpiryMillis || Infinity };
    const vignette = { type: 'Vignette', millis: v.vignetteExpiryMillis || Infinity };

    const checks = [itp, rca, vignette].filter(c => c.millis !== Infinity);
    if (checks.length === 0) return null;

    const next = checks.reduce((a, b) => (a.millis < b.millis ? a : b));
    const state = calculateReminderState(next.millis);

    let status = 'Safe';
    if (state.daysLeft < 0) status = 'Expired';
    else if (state.urgency === 'critical') status = 'Urgent';
    else if (state.urgency === 'warning') status = 'Soon';

    return { type: next.type, status };
  };

  return (
    <Card className="mb-6 border-yellow-500/20 bg-yellow-500/5">
      <CardContent className="p-3 sm:p-4">
        <button
          onClick={() => setOpen(!open)}
          className="w-full text-left flex items-center justify-between gap-2 hover:opacity-80 transition"
        >
          <div className="flex-1 min-w-0">
            <div className="text-lg font-semibold truncate text-yellow-700 dark:text-yellow-400">Upcoming Reminders</div>
          </div>
          <div className="inline-flex items-center px-3 py-1 text-sm font-medium text-yellow-700 dark:text-yellow-400 flex-shrink-0">
            {upcoming.length} {upcoming.length === 1 ? 'item' : 'items'}
          </div>
          {open ? <ChevronUp className="h-5 w-5 flex-shrink-0 text-yellow-700 dark:text-yellow-400" /> : <ChevronDown className="h-5 w-5 flex-shrink-0 text-yellow-700 dark:text-yellow-400" />}
        </button>

        <AnimatePresence>
          {open && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ type: 'spring', stiffness: 260, damping: 22 }}
              style={{ overflow: 'hidden' }}
            >
              <div className="mt-4 space-y-2 border-t border-yellow-500/20 pt-4">
                {upcoming.length === 0 ? (
                  <div className="text-sm text-slate-500 text-center py-2">No upcoming reminders</div>
                ) : (
                  upcoming.map((v, idx) => {
                    const info = getNextExpiryInfo(v);
                    return (
                      <motion.div
                        key={v.id}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -10 }}
                        transition={{ delay: idx * 0.05 }}
                      >
                        <div className="flex items-center justify-between gap-2 p-2 rounded text-white">
                          <span className="font-medium text-sm flex-1 truncate">{v.plate}</span>
                          {info && (
                            <span className="text-xs flex-shrink-0">
                              {info.type} ({info.status})
                            </span>
                          )}
                          {nextExpiry(v) !== Infinity && (
                            <span className="text-xs flex-shrink-0">
                              {new Date(nextExpiry(v)).toLocaleDateString()}
                            </span>
                          )}
                        </div>
                      </motion.div>
                    );
                  })
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </CardContent>
    </Card>
  );
}
