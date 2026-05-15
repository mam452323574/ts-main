import { Image as ExpoImage } from 'expo-image';
import type { ImageProps } from 'expo-image';

const DEFAULT_PLACEHOLDER = 'LKO2?U%2Tw=w]~RBVZRi};RPxuwH';

export type OptimizedImageProps = ImageProps & {
  showPlaceholder?: boolean;
};

export function OptimizedImage({
  cachePolicy = 'disk',
  contentFit = 'cover',
  placeholder,
  placeholderContentFit,
  showPlaceholder = true,
  transition = 120,
  ...props
}: OptimizedImageProps) {
  return (
    <ExpoImage
      cachePolicy={cachePolicy}
      contentFit={contentFit}
      placeholder={showPlaceholder ? placeholder ?? DEFAULT_PLACEHOLDER : placeholder}
      placeholderContentFit={placeholderContentFit ?? contentFit}
      transition={transition}
      {...props}
    />
  );
}

export default OptimizedImage;
