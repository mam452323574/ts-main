import type { ImageContentPosition } from 'expo-image';

/**
 * Per-asset crop configuration used by Coach image renderers.
 *
 * The Coach images are baked from different generations and don't all have
 * the subject placed identically inside the source frame — some have the
 * face very high, some have an object slightly off-center, etc. Rather than
 * regenerating every asset, we let the data layer describe how each image
 * should be framed when rendered.
 *
 * - `contentPosition` maps directly to `expo-image`'s `contentPosition` prop
 *   (`'top'`, `'center'`, `'bottom'`, `'top center'`, or an object with
 *   `top` / `left` / `right` / `bottom` percentages).
 * - `imageScale` is multiplied with the renderer's built-in scale to slightly
 *   zoom in or out — useful when a subject is too small or overflows the
 *   frame.
 *
 * Both fields are optional. When omitted, the rendering component falls back
 * to its historical default (typically centered with the component-specific
 * scale).
 */
export interface CoachImageCrop {
  contentPosition?: ImageContentPosition;
  imageScale?: number;
}
