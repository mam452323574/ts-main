import { ScreenState } from '@/components/ScreenState';

export function LoadingSpinner() {
  return <ScreenState tone="loading" layout="full" testID="loading-spinner-state" />;
}
