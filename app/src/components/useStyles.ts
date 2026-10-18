import { createContext, useContext, useMemo } from 'react';

/** Value = theme epoch; flips when the color scheme changes, re-rendering
 *  the tree so useStyles() rebuilds style sheets with the live palette. */
export const ThemeEpoch = createContext(0);

/** Module-scope style sheets are frozen colors; this rebuilds them whenever
 *  the epoch moves. Inline C.* reads pick up the palette on their own. */
export function useStyles<T>(make: () => T): T {
  const epoch = useContext(ThemeEpoch);
  // `make` is a stable module-level function; only the epoch may change it
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(make, [epoch]);
}
