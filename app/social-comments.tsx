import { Redirect, useLocalSearchParams } from 'expo-router';

import { useFeatureFlags } from '@/hooks/queries/useFeatureFlags';
import {
  resolveSocialCommentsGate,
  shouldEnableSocialComments,
} from '@/services/appConfig';

export default function SocialCommentsRoute() {
  const params = useLocalSearchParams();
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

  return (
    <Redirect
      href={{
        pathname: '/social-post' as any,
        params,
      }}
    />
  );
}
