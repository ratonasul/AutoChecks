import { calculateReminderState } from '@/services/reminders/reminderEngine';
import { theme } from '@/lib/theme';

interface StatusPillProps {
  expiryMillis: number | null;
  showExpiryDate?: boolean;
  compact?: boolean;
}
export function StatusPill({ expiryMillis, showExpiryDate = false, compact = false }: StatusPillProps) {
  if (!expiryMillis) return null;

  const state = calculateReminderState(expiryMillis);

  const getStatusText = () => {
    if (!expiryMillis) return 'Not set';
    if (state.daysLeft === Infinity) return 'Not set';
    if (state.daysLeft < 0) return 'Expired';
    if (state.urgency === 'critical') return 'Urgent';
    if (state.urgency === 'warning') return 'Soon';
    return 'Safe';
  };

  const getStatusClass = () => {
    if (!expiryMillis || state.daysLeft === Infinity) return theme.status.expired;
    if (state.daysLeft < 0) return theme.status.expired;
    if (state.urgency === 'critical') return theme.status.critical;
    if (state.urgency === 'warning') return theme.status.warning;
    return theme.status.safe;
  };

  if (compact) {
    return (
      <div className={`inline-flex items-center justify-center px-2 py-0.5 text-[10px] font-medium border ${theme.borderRadius.button} ${getStatusClass()}`}>
        <span className="truncate">{getStatusText()}</span>
      </div>
    );
  }

  return (
    <div className={`inline-flex items-center px-2 py-1 text-xs font-medium border ${theme.borderRadius.button} ${getStatusClass()}`}>
      {getStatusText()}
      {showExpiryDate && expiryMillis && (
        <span className="ml-2 text-muted-foreground">
          • {new Date(expiryMillis).toLocaleDateString()}
        </span>
      )}
    </div>
  );
}