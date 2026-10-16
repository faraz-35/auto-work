/** One error-message formatter so failures read the same everywhere. */
export function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
