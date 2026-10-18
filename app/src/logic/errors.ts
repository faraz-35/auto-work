/** One error-message formatter so failures read the same everywhere.
 *  Supabase rejects with plain objects ({ message, code, ... }) — unwrap. */
export function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === 'object' && e !== null) {
    const m = (e as { message?: unknown }).message;
    if (typeof m === 'string' && m !== '') return m;
  }
  return String(e);
}
