import * as fs from 'fs';
import * as path from 'path';

const repoRoot = path.resolve(__dirname, '..', '..');
const colorLiteralPattern = /#[0-9A-Fa-f]{3,8}|rgba\(/g;

const migratedFileBudgets: Record<string, number> = {
  'app/settings.tsx': 0,
  'app/notification-settings.tsx': 0,
  'app/notifications.tsx': 0,
  'app/privacy-policy.tsx': 0,
  'app/(tabs)/_layout.tsx': 1,
  'screens/HomeScreen.tsx': 0,
  'screens/AnalyticsScreen.tsx': 10,
  'screens/AdminSocialModerationScreen.tsx': 0,
  'screens/SocialScreen.tsx': 2,
  'screens/SocialCommentsScreen.tsx': 0,
  'screens/SocialComposerScreen.tsx': 0,
  'screens/CoachScreen.tsx': 1,
  'screens/CoachHistoryScreen.tsx': 0,
  'screens/PremiumUpgradeScreen.tsx': 0,
  'screens/EntryOfferScreen.tsx': 0,
  'screens/ExercisesScreen.tsx': 0,
  'screens/RecipesScreen.tsx': 0,
  'screens/ScanResultScreen.tsx': 1,
  'screens/SuperScanResultScreen.tsx': 36,
  'screens/ScannerScreen.tsx': 3,
  'screens/ScanPreviewScreen.tsx': 1,
  'components/Button.tsx': 0,
  'components/CustomAlert.tsx': 1,
  'components/ContextualPaywall.tsx': 9,
  'components/LanguageSelector.tsx': 0,
  'components/AccountBadge.tsx': 0,
  'components/MetricCard.tsx': 0,
  'components/ResultQuickStatCard.tsx': 0,
  'components/TrajectoryPreviewCard.tsx': 12,
};

const strictPrimitiveFiles = [
  'components/AppScreen.tsx',
  'components/Surface.tsx',
  'components/ScreenHeader.tsx',
  'components/ScreenState.tsx',
  'components/SegmentedControl.tsx',
  'components/ScreenSection.tsx',
  'components/SettingRow.tsx',
];

describe('theme hardcoded color guard', () => {
  it('keeps new design-system primitives token-driven', () => {
    const allowedPrimitiveLiterals = new Set(['#000000']);

    strictPrimitiveFiles.forEach((file) => {
      const source = fs.readFileSync(path.join(repoRoot, file), 'utf8');
      const literals = source.match(colorLiteralPattern) ?? [];
      const disallowed = literals.filter((literal) => !allowedPrimitiveLiterals.has(literal));

      expect(disallowed).toEqual([]);
    });
  });

  it('does not increase hardcoded color usage in migrated UI files', () => {
    Object.entries(migratedFileBudgets).forEach(([file, budget]) => {
      const source = fs.readFileSync(path.join(repoRoot, file), 'utf8');
      const count = (source.match(colorLiteralPattern) ?? []).length;

      expect({ file, count, budget }).toEqual(
        expect.objectContaining({
          count: expect.any(Number),
          budget,
        }),
      );
      expect(count).toBeLessThanOrEqual(budget);
    });
  });
});
