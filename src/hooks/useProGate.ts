import { useContext } from 'react';
import { ProContext } from '@/providers/ProProvider';

export function useProGate() {
  const context = useContext(ProContext);
  if (!context) {
    throw new Error('useProGate must be used within ProContextProvider.');
  }

  return {
    isPro: context.isPro,
    plan: context.plan,
    loading: context.loading,
    subscription: context.subscription,
  };
}
