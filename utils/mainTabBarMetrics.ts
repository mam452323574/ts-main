import { SPACING } from '@/constants/theme';

export const MAIN_TAB_BAR_CONTENT_HEIGHT = 60;
export const MAIN_TAB_BAR_MIN_BOTTOM_OFFSET = 8;
export const MAIN_TAB_BAR_CONTROL_GAP = SPACING.md;
export const MAIN_TAB_BAR_SCROLL_GAP = SPACING.xl;

export function getMainTabBarMetrics(bottomInset = 0) {
  const bottomOffset = Math.max(bottomInset, MAIN_TAB_BAR_MIN_BOTTOM_OFFSET);
  const topOffsetFromBottom = bottomOffset + MAIN_TAB_BAR_CONTENT_HEIGHT;

  return {
    contentHeight: MAIN_TAB_BAR_CONTENT_HEIGHT,
    bottomOffset,
    topOffsetFromBottom,
    controlBottomOffset: topOffsetFromBottom + MAIN_TAB_BAR_CONTROL_GAP,
    scrollPaddingBottom: topOffsetFromBottom + MAIN_TAB_BAR_SCROLL_GAP,
  };
}
