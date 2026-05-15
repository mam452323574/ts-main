import type { ImageSourcePropType } from 'react-native';

import type { FridgeMealMode } from '@/types/fridgeScan';

export interface FridgeChefPersona {
  mode: FridgeMealMode;
  nameTranslationKey: `fridge_scan.mode_labels.${FridgeMealMode}`;
  labelTranslationKey: `fridge_scan.mode_short_labels.${FridgeMealMode}`;
  descriptionTranslationKey: `fridge_scan.mode_descriptions.${FridgeMealMode}`;
  imageSource: ImageSourcePropType;
  fallbackLabel: string;
  accentColor: string;
  testIdSuffix: string;
}

export const FRIDGE_CHEF_PERSONAS: readonly FridgeChefPersona[] = [
  {
    mode: 'diet',
    nameTranslationKey: 'fridge_scan.mode_labels.diet',
    labelTranslationKey: 'fridge_scan.mode_short_labels.diet',
    descriptionTranslationKey: 'fridge_scan.mode_descriptions.diet',
    imageSource: require('../assets/images/chef/chef-home-dietetique.webp'),
    fallbackLabel: 'CD',
    accentColor: '#87B66A',
    testIdSuffix: 'diet',
  },
  {
    mode: 'muscle_gain',
    nameTranslationKey: 'fridge_scan.mode_labels.muscle_gain',
    labelTranslationKey: 'fridge_scan.mode_short_labels.muscle_gain',
    descriptionTranslationKey: 'fridge_scan.mode_descriptions.muscle_gain',
    imageSource: require('../assets/images/chef/chef-home-sportif.webp'),
    fallbackLabel: 'CS',
    accentColor: '#0A84FF',
    testIdSuffix: 'sportif',
  },
  {
    mode: 'gourmand',
    nameTranslationKey: 'fridge_scan.mode_labels.gourmand',
    labelTranslationKey: 'fridge_scan.mode_short_labels.gourmand',
    descriptionTranslationKey: 'fridge_scan.mode_descriptions.gourmand',
    imageSource: require('../assets/images/chef/chef-home-gourmand.webp'),
    fallbackLabel: 'CG',
    accentColor: '#F1A43A',
    testIdSuffix: 'gourmand',
  },
] as const;
