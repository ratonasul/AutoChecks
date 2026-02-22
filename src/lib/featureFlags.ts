export type FeatureFlags = {
  reminderSnooze: boolean;
  vehicleQuickActions: boolean;
  dashboardFilters: boolean;
  strictValidation: boolean;
};

export const defaultFeatureFlags: FeatureFlags = {
  reminderSnooze: true,
  vehicleQuickActions: true,
  dashboardFilters: true,
  strictValidation: true,
};

