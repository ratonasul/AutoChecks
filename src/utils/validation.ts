export function canonicalPlate(input: string): string {
  return input.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
}

export function normalizePlate(input: string): string {
  return input.trim().toUpperCase();
}

export function normalizeVin(input: string): string {
  return input.trim().toUpperCase();
}

export function validatePlate(input: string): string | null {
  const normalized = normalizePlate(input);
  const canonical = canonicalPlate(normalized);
  if (!canonical) return 'License plate is required.';
  if (canonical.length < 4 || canonical.length > 10) {
    return 'License plate must contain 4 to 10 alphanumeric characters.';
  }
  return null;
}

export function validateVin(input: string): string | null {
  const normalized = normalizeVin(input);
  if (!normalized) return null;

  const vinRegex = /^[A-HJ-NPR-Z0-9]{17}$/;
  if (!vinRegex.test(normalized)) {
    return 'VIN must be 17 characters and cannot contain I, O, or Q.';
  }
  return null;
}

