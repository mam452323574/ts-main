import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  InteractionManager,
  Linking,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Camera } from 'lucide-react-native';
import { AvatarCropModal, type AvatarCropAsset } from '@/components/AvatarCropModal';
import { ProfileAvatar } from '@/components/ProfileAvatar';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { SIZES, SPACING, withAlpha } from '@/constants/theme';
import { useCustomAlert } from '@/hooks/useCustomAlert';
import { uploadAvatarFromLocalUri } from '@/services/avatar';
import type { AvatarCropSelection } from '@/utils/avatarCrop';
import { Squircle } from '@/components/Squircle';

interface AvatarPickerProps {
  userId: string;
  currentAvatarUrl?: string | null;
  onAvatarSelected: (avatarReference: string) => void;
  size?: number;
}

const PICKER_LAUNCH_DELAY_MS = 60;

export function AvatarPicker({ userId, currentAvatarUrl, onAvatarSelected, size = 120 }: AvatarPickerProps) {
  const [uploading, setUploading] = useState(false);
  const [localUri, setLocalUri] = useState<string | null>(null);
  const [cropAsset, setCropAsset] = useState<AvatarCropAsset | null>(null);
  const { colors, isDark } = useTheme();
  const { t } = useLanguage();
  const { showAlert, alertElement } = useCustomAlert();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);
  const haloPadding = 12;
  const haloSize = size + haloPadding * 2;

  const openDeviceSettings = async () => {
    try {
      await Linking.openSettings();
    } catch (error) {
      console.error('Error opening device settings:', error);
    }
  };

  const showPermissionAlert = (
    message: string,
    canAskAgain: boolean | undefined,
  ) => {
    const shouldShowSettings = Platform.OS !== 'web' && canAskAgain === false;

    showAlert(
      t('components.avatar.perm_title'),
      message,
      shouldShowSettings
        ? [
            {
              text: t('components.avatar.open_settings'),
              onPress: () => {
                void openDeviceSettings();
              },
            },
            {
              text: t('common.cancel'),
              style: 'cancel',
            },
          ]
        : [{ text: t('common.ok') }],
    );
  };

  const showPickerError = (error: unknown, isCamera: boolean) => {
    console.error(
      isCamera
        ? 'Error launching avatar camera picker:'
        : 'Error launching avatar gallery picker:',
      error,
    );

    const message =
      error instanceof Error &&
      isCamera &&
      /(camera|simulator|available|device)/i.test(error.message)
        ? t('components.avatar.error_camera_unavailable')
        : t('components.avatar.error_picker_launch');

    showAlert(t('components.avatar.error_title'), message, [
      { text: t('common.ok') },
    ]);
  };

  const runPickerAction = (action: () => Promise<void>) => {
    if (Platform.OS === 'web') {
      void action();
      return;
    }

    InteractionManager.runAfterInteractions(() => {
      setTimeout(() => {
        void action();
      }, PICKER_LAUNCH_DELAY_MS);
    });
  };

  const ensureCameraPermission = async () => {
    if (Platform.OS === 'web') {
      return { granted: true, canAskAgain: true };
    }

    const currentPermission = await ImagePicker.getCameraPermissionsAsync();
    if (currentPermission.granted) {
      return {
        granted: true,
        canAskAgain: currentPermission.canAskAgain,
      };
    }

    const requestedPermission = await ImagePicker.requestCameraPermissionsAsync();
    return {
      granted: requestedPermission.granted,
      canAskAgain: requestedPermission.canAskAgain,
    };
  };

  const openCropModal = (asset: ImagePicker.ImagePickerAsset) => {
    setCropAsset({
      uri: asset.uri,
      width: asset.width,
      height: asset.height,
    });
  };

  const uploadAvatar = async (
    uri: string,
    cropSelection?: AvatarCropSelection | null,
  ) => {
    try {
      setUploading(true);

      const { avatarReference, localUri: preparedLocalUri } =
        await uploadAvatarFromLocalUri(userId, uri, cropSelection);
      setLocalUri(preparedLocalUri);
      onAvatarSelected(avatarReference);
    } catch (error) {
      console.error('Error uploading avatar:', error);
      const errorMessage =
        error instanceof Error ? error.message : t('components.avatar.error_download');
      const localizedMessage = /5mb|too large|trop volumineuse/i.test(errorMessage)
        ? t('components.avatar.error_size')
        : /unable to load|download|telechargement/i.test(errorMessage)
          ? t('components.avatar.error_download')
          : errorMessage;
      showAlert(t('components.avatar.error_title'), localizedMessage);
    } finally {
      setUploading(false);
    }
  };

  const pickImageFromLibrary = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        quality: 0.8,
      });

      const selectedAsset = result.canceled ? null : result.assets?.[0];
      if (selectedAsset?.uri) {
        openCropModal(selectedAsset);
      }
    } catch (error) {
      showPickerError(error, false);
    }
  };

  const takePhoto = async () => {
    try {
      const permission = await ensureCameraPermission();
      if (!permission.granted) {
        showPermissionAlert(
          t('components.avatar.perm_camera'),
          permission.canAskAgain,
        );
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: false,
        quality: 0.8,
      });

      const capturedAsset = result.canceled ? null : result.assets?.[0];
      if (capturedAsset?.uri) {
        openCropModal(capturedAsset);
      }
    } catch (error) {
      showPickerError(error, true);
    }
  };

  const showOptions = () => {
    showAlert(
      t('components.avatar.options_title'),
      t('components.avatar.options_msg'),
      [
        {
          text: t('components.avatar.take_photo'),
          onPress: () => runPickerAction(takePhoto),
        },
        {
          text: t('components.avatar.choose_gallery'),
          onPress: () => runPickerAction(pickImageFromLibrary),
        },
        {
          text: t('common.cancel'),
          style: 'cancel',
        },
      ]
    );
  };

  const handleCropCancel = () => {
    setCropAsset(null);
  };

  const handleCropConfirm = (cropSelection: AvatarCropSelection) => {
    const asset = cropAsset;
    setCropAsset(null);

    if (asset?.uri) {
      void uploadAvatar(asset.uri, cropSelection);
    }
  };

  return (
    <View style={styles.container}>
      {alertElement}
      <AvatarCropModal
        visible={!!cropAsset}
        asset={cropAsset}
        onCancel={handleCropCancel}
        onConfirm={handleCropConfirm}
      />
      <Squircle
        style={[
          styles.halo,
          { width: haloSize, height: haloSize, borderRadius: haloSize / 2, borderCurve: 'continuous' },
        ]}
      >
        <TouchableOpacity
          style={[styles.avatarContainer, { width: size, height: size }]}
          onPress={showOptions}
          disabled={uploading || !!cropAsset}
          testID="avatar-picker-trigger"
        >
          <ProfileAvatar
            avatarUrl={localUri || currentAvatarUrl}
            username={t('common.unknown_user')}
            size={size}
            style={styles.avatar}
            testID="avatar-picker-image"
          />
          {uploading && (
            <View style={styles.loadingOverlay}>
              <ActivityIndicator size="large" color={colors.white} />
            </View>
          )}
          {!uploading && (
            <Squircle style={styles.editBadge}>
              <Camera color={colors.background} size={16} />
            </Squircle>
          )}
        </TouchableOpacity>
      </Squircle>
      <Text style={styles.hint}>{t('components.avatar.hint')}</Text>
    </View>
  );
}

const createStyles = (colors: any, isDark: boolean) => StyleSheet.create({
  container: {
    alignItems: 'center',
  },
  halo: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: withAlpha(colors.primaryText, isDark ? 0.06 : 0.04),
  },
  avatarContainer: {
    borderRadius: 1000,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: withAlpha(colors.primaryText, 0.08),
    position: 'relative', borderCurve: 'continuous',
  },
  avatar: {
    borderRadius: 1000, borderCurve: 'continuous',
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  editBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    backgroundColor: colors.primaryText,
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: colors.background, borderCurve: 'continuous',
  },
  hint: {
    marginTop: SPACING.md,
    fontSize: SIZES.sm,
    color: colors.gray,
  },
});
