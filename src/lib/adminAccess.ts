export const OWNER_EMAIL = 'mykultuhaus@gmail.com';

export function isOwnerEmail(email?: string | null): boolean {
  return (email || '').trim().toLowerCase() === OWNER_EMAIL;
}
