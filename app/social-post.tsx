import { Redirect } from 'expo-router';

import SocialCommentsScreen from '@/screens/SocialCommentsScreen';
import { useFeatureFlags } from '@/hooks/queries/useFeatureFlags';
import {
  resolveSocialCommentsGate,
  shouldEnableSocialComments,
} from '@/services/appConfig';

export default function SocialPostRoute() {
  const featureFlagsQuery = useFeatureFlags();
  const featureFlagsResolved =
    typeof featureFlagsQuery.dataUpdatedAt === 'number'
      ? featureFlagsQuery.dataUpdatedAt > 0
      : true;
  const commentsGateState = resolveSocialCommentsGate(featureFlagsQuery.data, {
    resolved: featureFlagsResolved,
  });

  if (!shouldEnableSocialComments(commentsGateState)) {
    return <Redirect href={'/(tabs)/social' as any} />;
  }

  return <SocialCommentsScreen />;
}
