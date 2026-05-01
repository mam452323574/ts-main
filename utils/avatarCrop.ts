export const AVATAR_CROP_MIN_SCALE = 1;
export const AVATAR_CROP_MAX_SCALE = 4;
export const AVATAR_OUTPUT_SIZE = 512;

export interface AvatarCropSource {
  width: number;
  height: number;
}

export interface AvatarCropTransform {
  scale: number;
  translateX: number;
  translateY: number;
}

export interface AvatarCropSelection {
  originX: number;
  originY: number;
  width: number;
  height: number;
}

export interface AvatarCropSelectionInput extends AvatarCropSource, AvatarCropTransform {
  cropSize: number;
}

function clamp(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) {
    return min;
  }

  return Math.min(Math.max(value, min), max);
}

function normalizeDimension(value: number) {
  return Math.max(1, Math.round(Number.isFinite(value) ? value : 1));
}

export function normalizeAvatarCropSource(source: AvatarCropSource): AvatarCropSource {
  return {
    width: normalizeDimension(source.width),
    height: normalizeDimension(source.height),
  };
}

export function getAvatarCropBaseScale(source: AvatarCropSource, cropSize: number) {
  const normalizedSource = normalizeAvatarCropSource(source);
  const normalizedCropSize = normalizeDimension(cropSize);

  return Math.max(
    normalizedCropSize / normalizedSource.width,
    normalizedCropSize / normalizedSource.height,
  );
}

export function clampAvatarCropTransform(input: AvatarCropSelectionInput): AvatarCropTransform {
  const source = normalizeAvatarCropSource(input);
  const cropSize = normalizeDimension(input.cropSize);
  const baseScale = getAvatarCropBaseScale(source, cropSize);
  const scale = clamp(input.scale, AVATAR_CROP_MIN_SCALE, AVATAR_CROP_MAX_SCALE);
  const renderedWidth = source.width * baseScale * scale;
  const renderedHeight = source.height * baseScale * scale;
  const maxTranslateX = Math.max(0, (renderedWidth - cropSize) / 2);
  const maxTranslateY = Math.max(0, (renderedHeight - cropSize) / 2);

  return {
    scale,
    translateX: clamp(input.translateX, -maxTranslateX, maxTranslateX),
    translateY: clamp(input.translateY, -maxTranslateY, maxTranslateY),
  };
}

export function normalizeAvatarCropSelection(
  selection?: AvatarCropSelection | null,
  source?: AvatarCropSource | null,
): AvatarCropSelection | null {
  if (!selection) {
    return null;
  }

  const sourceWidth = source ? normalizeDimension(source.width) : null;
  const sourceHeight = source ? normalizeDimension(source.height) : null;
  const maxSize =
    sourceWidth && sourceHeight ? Math.min(sourceWidth, sourceHeight) : Infinity;
  const rawSize = Math.min(selection.width, selection.height);
  const size = Math.max(1, Math.min(normalizeDimension(rawSize), maxSize));

  if (!sourceWidth || !sourceHeight) {
    return {
      originX: Math.max(0, Math.round(selection.originX)),
      originY: Math.max(0, Math.round(selection.originY)),
      width: size,
      height: size,
    };
  }

  return {
    originX: clamp(Math.round(selection.originX), 0, sourceWidth - size),
    originY: clamp(Math.round(selection.originY), 0, sourceHeight - size),
    width: size,
    height: size,
  };
}

export function getAvatarCropSelection(input: AvatarCropSelectionInput): AvatarCropSelection {
  const source = normalizeAvatarCropSource(input);
  const cropSize = normalizeDimension(input.cropSize);
  const transform = clampAvatarCropTransform({ ...input, ...source, cropSize });
  const baseScale = getAvatarCropBaseScale(source, cropSize);
  const imageScale = baseScale * transform.scale;
  const renderedWidth = source.width * imageScale;
  const renderedHeight = source.height * imageScale;
  const imageLeft = (cropSize - renderedWidth) / 2 + transform.translateX;
  const imageTop = (cropSize - renderedHeight) / 2 + transform.translateY;
  const selection = normalizeAvatarCropSelection(
    {
      originX: -imageLeft / imageScale,
      originY: -imageTop / imageScale,
      width: cropSize / imageScale,
      height: cropSize / imageScale,
    },
    source,
  );

  return selection ?? {
    originX: 0,
    originY: 0,
    width: Math.min(source.width, source.height),
    height: Math.min(source.width, source.height),
  };
}
