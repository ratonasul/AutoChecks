import { parse, isValid, format } from 'date-fns';

export function parseExpiryDate(input: string): { expiryDateISO: string; expiryMillis: number } | null {
  const parsed = parse(input, 'dd/MM/yyyy', new Date());
  if (!isValid(parsed)) return null;
  return {
    expiryDateISO: format(parsed, 'yyyy-MM-dd'),
    expiryMillis: parsed.getTime(),
  };
}