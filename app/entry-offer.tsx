import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { Redirect } from 'expo-router';

import EntryOfferScreen from '@/screens/EntryOfferScreen';
import { useTheme } from '@/contexts/ThemeContext';
import { useFeatureFlags } from '@/hooks/queries';

export default function EntryOfferRoute() {
  const { colors } = useTheme();
  const { data: featureFlags, isFetching } = useFeatureFlags();

  if (isFetching && !featureFlags.entry_offer_enabled) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  if (!featureFlags.entry_offer_enabled) {
    return <Redirect href="/(tabs)" />;
  }

  return <EntryOfferScreen />;
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
