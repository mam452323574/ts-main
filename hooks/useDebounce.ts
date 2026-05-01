import { useState, useEffect } from 'react';

/**
 * Hook pour debouncer une valeur
 * Utile pour eviter les appels API excessifs lors de la saisie
 * 
 * @param value - La valeur a debouncer
 * @param delay - Le delai en millisecondes (default: 300ms)
 * @returns La valeur debouncee
 */
export function useDebounce<T>(value: T, delay: number = 300): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(timer);
    };
  }, [value, delay]);

  return debouncedValue;
}
