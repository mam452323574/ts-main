import { SPACING } from '@/constants/theme';
import {
  MAIN_TAB_BAR_CONTENT_HEIGHT,
  MAIN_TAB_BAR_MIN_BOTTOM_OFFSET,
  getMainTabBarMetrics,
} from '@/utils/mainTabBarMetrics';

describe('getMainTabBarMetrics', () => {
  it('uses the minimum bottom offset when there is no device inset', () => {
    expect(getMainTabBarMetrics(0)).toEqual({
      contentHeight: MAIN_TAB_BAR_CONTENT_HEIGHT,
      bottomOffset: MAIN_TAB_BAR_MIN_BOTTOM_OFFSET,
      topOffsetFromBottom:
        MAIN_TAB_BAR_MIN_BOTTOM_OFFSET + MAIN_TAB_BAR_CONTENT_HEIGHT,
      controlBottomOffset:
        MAIN_TAB_BAR_MIN_BOTTOM_OFFSET +
        MAIN_TAB_BAR_CONTENT_HEIGHT +
        SPACING.md,
      scrollPaddingBottom:
        MAIN_TAB_BAR_MIN_BOTTOM_OFFSET +
        MAIN_TAB_BAR_CONTENT_HEIGHT +
        SPACING.xl,
    });
  });

  it('preserves larger safe-area insets for home-indicator devices', () => {
    const bottomInset = 34;

    expect(getMainTabBarMetrics(bottomInset)).toEqual({
      contentHeight: MAIN_TAB_BAR_CONTENT_HEIGHT,
      bottomOffset: bottomInset,
      topOffsetFromBottom: bottomInset + MAIN_TAB_BAR_CONTENT_HEIGHT,
      controlBottomOffset:
        bottomInset + MAIN_TAB_BAR_CONTENT_HEIGHT + SPACING.md,
      scrollPaddingBottom:
        bottomInset + MAIN_TAB_BAR_CONTENT_HEIGHT + SPACING.xl,
    });
  });
});
