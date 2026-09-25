import { useEffect, useState } from 'react';

const animatedKeys = new Set<string>();

export function useSessionAnimation(key: string): boolean {
  const [shouldAnimate] = useState(() => !animatedKeys.has(key));

  useEffect(() => {
    if (shouldAnimate) {
      animatedKeys.add(key);
    }
  }, [key, shouldAnimate]);

  return shouldAnimate;
}
