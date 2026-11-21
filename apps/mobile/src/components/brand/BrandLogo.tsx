import { Image } from 'expo-image';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { BRAND, BRAND_TILE } from '@/theme/brand';

/**
 * The supplied PACE logo (PNG), cropped to its rounded tile so it sits cleanly on any background.
 * `size` is the tile's width and height in points.
 */
export function BrandLogo({
  size,
  style,
  accessibilityLabel = 'PACE',
}: {
  size: number;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}) {
  // The PNG is larger than the tile by its black margin on each side; scale it up and shift it so
  // exactly the tile fills the box, then round the corners to the tile's own radius.
  const scale = 1 / (1 - BRAND_TILE.insetRatio * 2);
  const imageSize = size * scale;
  const offset = -BRAND_TILE.insetRatio * imageSize;
  return (
    <View
      style={[
        styles.tile,
        { width: size, height: size, borderRadius: size * BRAND_TILE.radiusRatio },
        style,
      ]}
      accessible
      accessibilityRole="image"
      accessibilityLabel={accessibilityLabel}
    >
      <Image
        source={BRAND.logo}
        style={{ width: imageSize, height: imageSize, left: offset, top: offset }}
        contentFit="cover"
        transition={0}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  tile: { overflow: 'hidden', backgroundColor: BRAND_TILE.color },
});
