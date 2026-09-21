import * as React from 'react';

/**
 * Returns a debounced version of `value` that only updates
 * after `delay` ms have elapsed since the last change.
 */
export function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = React.useState<T>(value);

  React.useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}
