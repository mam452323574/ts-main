import {
  GAMIFICATION_EMPTY_FILENAME,
  GAMIFICATION_LEGACY_EMPTY_FILENAME,
  type GamificationMascotFilename,
} from '@/constants/gamification';

export const GAMIFICATION_ASSET_SOURCES: Record<GamificationMascotFilename, number> =
  {
    [GAMIFICATION_EMPTY_FILENAME]: require('../assets/images/gamification/stade_0.png'),
    'stade_1.png': require('../assets/images/gamification/stade_1.png'),
    'stade_2.png': require('../assets/images/gamification/stade_2.png'),
    'stade_3.png': require('../assets/images/gamification/stade_3.png'),
    'stade_4.png': require('../assets/images/gamification/stade_4.png'),
    'stade_5.png': require('../assets/images/gamification/stade_5.png'),
    'stade_6.png': require('../assets/images/gamification/stade_6.png'),
    'stade_7.png': require('../assets/images/gamification/stade_7.png'),
    'stade_8.png': require('../assets/images/gamification/stade_8.png'),
    'stade_9.png': require('../assets/images/gamification/stade_9.png'),
    'stade_10.png': require('../assets/images/gamification/stade_10.png'),
  };

const GAMIFICATION_LEGACY_ASSET_ALIASES: Record<string, GamificationMascotFilename> =
  {
    [GAMIFICATION_LEGACY_EMPTY_FILENAME]: GAMIFICATION_EMPTY_FILENAME,
    'stade_1.gif': 'stade_1.png',
    'stade_2.gif': 'stade_2.png',
    'stade_3.gif': 'stade_3.png',
    'stade_4.gif': 'stade_4.png',
    'stade_5.gif': 'stade_5.png',
    'stade_6.gif': 'stade_6.png',
    'stade_7.gif': 'stade_7.png',
    'stade_8.gif': 'stade_8.png',
    'stade_9.gif': 'stade_9.png',
    'stade_10.gif': 'stade_10.png',
  };

export function getGamificationAssetSource(filename: string) {
  const resolvedFilename =
    GAMIFICATION_LEGACY_ASSET_ALIASES[filename] ?? filename;

  return (
    GAMIFICATION_ASSET_SOURCES[
      resolvedFilename as keyof typeof GAMIFICATION_ASSET_SOURCES
    ] ?? GAMIFICATION_ASSET_SOURCES[GAMIFICATION_EMPTY_FILENAME]
  );
}
