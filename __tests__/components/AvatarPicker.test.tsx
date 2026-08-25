import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import {
  InteractionManager,
  Linking,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';

import { AvatarPicker } from '@/components/AvatarPicker';

const mockShowAlert = jest.fn();
const mockUpload = jest.fn();

jest.mock('@/hooks/useCustomAlert', () => ({
  useCustomAlert: () => ({
    showAlert: (...args: unknown[]) => mockShowAlert(...args),
    alertElement: null,
  }),
}));

jest.mock('@/hooks/useResolvedAvatarUrl', () => ({
  useResolvedAvatarUrl: (value: string | null | undefined) => value ?? null,
}));

jest.mock('@/components/AvatarCropModal', () => ({
  AvatarCropModal: ({ visible, asset, onCancel, onConfirm }: any) => {
    if (!visible) {
      return null;
    }

    const React = require('react');
    const { Text, TouchableOpacity, View } = require('react-native');

    return (
      <View testID="avatar-crop-modal">
        <Text testID="avatar-crop-asset-uri">{asset?.uri}</Text>
        <TouchableOpacity
          testID="avatar-crop-confirm"
          onPress={() =>
            onConfirm({
              originX: 10,
              originY: 20,
              width: 256,
              height: 256,
            })
          }
        >
          <Text>Confirm crop</Text>
        </TouchableOpacity>
        <TouchableOpacity testID="avatar-crop-cancel" onPress={onCancel}>
          <Text>Cancel crop</Text>
        </TouchableOpacity>
      </View>
    );
  },
}));

jest.mock('@/services/supabase', () => ({
  supabase: {
    auth: {
      getSession: jest.fn(() =>
        Promise.resolve({
          data: {
            session: {
              access_token: 'test-token',
              user: { id: 'test-user-123' },
            },
          },
          error: null,
        }),
      ),
    },
    storage: {
      from: jest.fn(() => ({
        upload: (...args: unknown[]) => mockUpload(...args),
      })),
    },
  },
}));

type AlertButton = {
  text: string;
  onPress?: () => void;
  style?: 'default' | 'cancel' | 'destructive';
};

describe('AvatarPicker', () => {
  const mockOnAvatarSelected = jest.fn();
  const defaultProps = {
    userId: 'test-user-123',
    onAvatarSelected: mockOnAvatarSelected,
  };

  let runAfterInteractionsSpy: jest.SpyInstance;
  let openSettingsSpy: jest.SpyInstance;

  const getPickerButtons = () =>
    (mockShowAlert.mock.calls[0]?.[2] ?? []) as AlertButton[];

  const getButton = (buttons: AlertButton[], label: string) =>
    buttons.find((button) => button.text === label);

  const flushScheduledPickerAction = async () => {
    await act(async () => {
      jest.runOnlyPendingTimers();
      await Promise.resolve();
    });
  };

  const confirmCrop = async (screen: ReturnType<typeof render>) => {
    await act(async () => {
      fireEvent.press(screen.getByTestId('avatar-crop-confirm'));
      await Promise.resolve();
    });
  };

  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();

    runAfterInteractionsSpy = jest
      .spyOn(InteractionManager, 'runAfterInteractions')
      .mockImplementation((task: any) => {
        task?.();
        return { cancel: jest.fn() } as any;
      });

    openSettingsSpy = jest
      .spyOn(Linking, 'openSettings')
      .mockResolvedValue();

    (ImagePicker.getMediaLibraryPermissionsAsync as jest.Mock).mockResolvedValue({
      status: 'granted',
      granted: true,
      canAskAgain: true,
      accessPrivileges: 'all',
    });
    (ImagePicker.requestMediaLibraryPermissionsAsync as jest.Mock).mockResolvedValue({
      status: 'granted',
      granted: true,
      canAskAgain: true,
      accessPrivileges: 'all',
    });
    (ImagePicker.getCameraPermissionsAsync as jest.Mock).mockResolvedValue({
      status: 'granted',
      granted: true,
      canAskAgain: true,
    });
    (ImagePicker.requestCameraPermissionsAsync as jest.Mock).mockResolvedValue({
      status: 'granted',
      granted: true,
      canAskAgain: true,
    });
    (ImagePicker.launchImageLibraryAsync as jest.Mock).mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'file:///avatar.jpg' }],
    });
    (ImagePicker.launchCameraAsync as jest.Mock).mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'file:///camera-avatar.jpg' }],
    });
    (FileSystem.getInfoAsync as jest.Mock).mockResolvedValue({
      exists: true,
      size: 1024,
    });
    (FileSystem.readAsStringAsync as jest.Mock).mockResolvedValue('/9j/4AAQSkZJRgABAQAAAQABAAD/');
    mockUpload.mockResolvedValue({ data: { path: 'test-user-123/avatar.jpg' }, error: null });

    global.fetch = jest.fn().mockResolvedValue({
      blob: async () => ({
        size: 1024,
        arrayBuffer: async () => new ArrayBuffer(8),
      }),
    }) as jest.Mock;
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
    runAfterInteractionsSpy.mockRestore();
    openSettingsSpy.mockRestore();
  });

  it('renders the shared fallback avatar when no image exists', () => {
    const screen = render(<AvatarPicker {...defaultProps} />);

    expect(screen.getByTestId('avatar-picker-image-fallback')).toBeTruthy();
  });

  it('opens the shared avatar options with gallery and camera actions', () => {
    const screen = render(<AvatarPicker {...defaultProps} />);

    fireEvent.press(screen.getByTestId('avatar-picker-trigger'));

    expect(mockShowAlert).toHaveBeenCalledWith(
      'Photo de profil',
      'Choisissez une option',
      expect.any(Array),
    );

    const buttons = getPickerButtons();
    expect(getButton(buttons, 'Prendre une photo')).toBeTruthy();
    expect(getButton(buttons, 'Choisir de la galerie')).toBeTruthy();
  });

  it('uploads a normalized avatar path after choosing from gallery', async () => {
    const fetchSpy = jest.fn();
    global.fetch = fetchSpy as jest.Mock;
    const screen = render(<AvatarPicker {...defaultProps} />);

    fireEvent.press(screen.getByTestId('avatar-picker-trigger'));
    const buttons = getPickerButtons();
    mockShowAlert.mockClear();

    await act(async () => {
      getButton(buttons, 'Choisir de la galerie')?.onPress?.();
    });
    await flushScheduledPickerAction();

    await waitFor(() => {
      expect(ImagePicker.launchImageLibraryAsync).toHaveBeenCalled();
      expect(screen.getByTestId('avatar-crop-modal')).toBeTruthy();
      expect(screen.getByTestId('avatar-crop-asset-uri').props.children).toBe(
        'file:///avatar.jpg',
      );
    });
    expect(mockOnAvatarSelected).not.toHaveBeenCalled();
    expect(mockUpload).not.toHaveBeenCalled();

    await confirmCrop(screen);

    await waitFor(() => {
      expect(mockOnAvatarSelected).toHaveBeenCalledWith('test-user-123/avatar.jpg');
    });
    expect(FileSystem.readAsStringAsync).toHaveBeenCalledWith(
      'manipulated-image-uri',
      expect.objectContaining({ encoding: 'base64' }),
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('uploads a normalized avatar path after taking a photo', async () => {
    const screen = render(<AvatarPicker {...defaultProps} />);

    fireEvent.press(screen.getByTestId('avatar-picker-trigger'));
    const buttons = getPickerButtons();
    mockShowAlert.mockClear();

    await act(async () => {
      getButton(buttons, 'Prendre une photo')?.onPress?.();
    });
    await flushScheduledPickerAction();

    await waitFor(() => {
      expect(ImagePicker.launchCameraAsync).toHaveBeenCalled();
      expect(screen.getByTestId('avatar-crop-asset-uri').props.children).toBe(
        'file:///camera-avatar.jpg',
      );
    });
    expect(mockOnAvatarSelected).not.toHaveBeenCalled();

    await confirmCrop(screen);

    await waitFor(() => {
      expect(mockOnAvatarSelected).toHaveBeenCalledWith('test-user-123/avatar.jpg');
    });
  });

  it('does not upload when the crop step is canceled', async () => {
    const screen = render(<AvatarPicker {...defaultProps} />);
    fireEvent.press(screen.getByTestId('avatar-picker-trigger'));
    const buttons = getPickerButtons();
    mockShowAlert.mockClear();

    await act(async () => {
      getButton(buttons, 'Choisir de la galerie')?.onPress?.();
    });
    await flushScheduledPickerAction();

    await waitFor(() => {
      expect(screen.getByTestId('avatar-crop-modal')).toBeTruthy();
    });

    await act(async () => {
      fireEvent.press(screen.getByTestId('avatar-crop-cancel'));
      await Promise.resolve();
    });

    expect(mockOnAvatarSelected).not.toHaveBeenCalled();
    expect(mockUpload).not.toHaveBeenCalled();
  });

  it('does nothing when the gallery picker is canceled', async () => {
    (ImagePicker.launchImageLibraryAsync as jest.Mock).mockResolvedValue({
      canceled: true,
      assets: [],
    });

    const screen = render(<AvatarPicker {...defaultProps} />);
    fireEvent.press(screen.getByTestId('avatar-picker-trigger'));
    const buttons = getPickerButtons();
    mockShowAlert.mockClear();

    await act(async () => {
      getButton(buttons, 'Choisir de la galerie')?.onPress?.();
    });
    await flushScheduledPickerAction();

    await waitFor(() => {
      expect(ImagePicker.launchImageLibraryAsync).toHaveBeenCalled();
    });
    expect(mockOnAvatarSelected).not.toHaveBeenCalled();
    expect(mockShowAlert).not.toHaveBeenCalled();
  });

  it('shows a size error when the normalized avatar exceeds the upload limit', async () => {
    (FileSystem.getInfoAsync as jest.Mock).mockResolvedValue({
      exists: true,
      size: 6 * 1024 * 1024,
    });

    const screen = render(<AvatarPicker {...defaultProps} />);
    fireEvent.press(screen.getByTestId('avatar-picker-trigger'));
    const buttons = getPickerButtons();
    mockShowAlert.mockClear();

    await act(async () => {
      getButton(buttons, 'Choisir de la galerie')?.onPress?.();
    });
    await flushScheduledPickerAction();
    await confirmCrop(screen);

    await waitFor(() => {
      expect(mockShowAlert).toHaveBeenCalledWith(
        'Erreur',
        'Image trop volumineuse. Maximum 5MB.',
      );
    });
    expect(mockOnAvatarSelected).not.toHaveBeenCalled();
    expect(mockUpload).not.toHaveBeenCalled();
  });

  it('surfaces storage upload failures after preparing the avatar', async () => {
    mockUpload.mockResolvedValue({
      data: null,
      error: new Error('Upload failed'),
    });

    const screen = render(<AvatarPicker {...defaultProps} />);
    fireEvent.press(screen.getByTestId('avatar-picker-trigger'));
    const buttons = getPickerButtons();
    mockShowAlert.mockClear();

    await act(async () => {
      getButton(buttons, 'Choisir de la galerie')?.onPress?.();
    });
    await flushScheduledPickerAction();
    await confirmCrop(screen);

    await waitFor(() => {
      expect(mockShowAlert).toHaveBeenCalledWith(
        'Erreur',
        'Upload failed',
      );
    });
    expect(mockOnAvatarSelected).not.toHaveBeenCalled();
  });

  it('opens the system gallery picker without a media-library permission preflight', async () => {
    (ImagePicker.getMediaLibraryPermissionsAsync as jest.Mock).mockResolvedValue({
      status: 'denied',
      granted: false,
      canAskAgain: true,
      accessPrivileges: 'none',
    });
    (ImagePicker.requestMediaLibraryPermissionsAsync as jest.Mock).mockResolvedValue({
      status: 'denied',
      granted: false,
      canAskAgain: true,
      accessPrivileges: 'none',
    });

    const screen = render(<AvatarPicker {...defaultProps} />);
    fireEvent.press(screen.getByTestId('avatar-picker-trigger'));
    const buttons = getPickerButtons();
    mockShowAlert.mockClear();

    await act(async () => {
      getButton(buttons, 'Choisir de la galerie')?.onPress?.();
    });
    await flushScheduledPickerAction();

    await waitFor(() => {
      expect(ImagePicker.launchImageLibraryAsync).toHaveBeenCalled();
    });
    expect(ImagePicker.getMediaLibraryPermissionsAsync).not.toHaveBeenCalled();
    expect(ImagePicker.requestMediaLibraryPermissionsAsync).not.toHaveBeenCalled();
  });

  it('ignores stale gallery permission state when the system picker is canceled', async () => {
    (ImagePicker.getMediaLibraryPermissionsAsync as jest.Mock).mockResolvedValue({
      status: 'denied',
      granted: false,
      canAskAgain: false,
      accessPrivileges: 'none',
    });
    (ImagePicker.requestMediaLibraryPermissionsAsync as jest.Mock).mockResolvedValue({
      status: 'denied',
      granted: false,
      canAskAgain: false,
      accessPrivileges: 'none',
    });
    (ImagePicker.launchImageLibraryAsync as jest.Mock).mockResolvedValue({
      canceled: true,
      assets: [],
    });

    const screen = render(<AvatarPicker {...defaultProps} />);
    fireEvent.press(screen.getByTestId('avatar-picker-trigger'));
    const buttons = getPickerButtons();
    mockShowAlert.mockClear();

    await act(async () => {
      getButton(buttons, 'Choisir de la galerie')?.onPress?.();
    });
    await flushScheduledPickerAction();

    await waitFor(() => {
      expect(ImagePicker.launchImageLibraryAsync).toHaveBeenCalled();
    });
    expect(ImagePicker.getMediaLibraryPermissionsAsync).not.toHaveBeenCalled();
    expect(ImagePicker.requestMediaLibraryPermissionsAsync).not.toHaveBeenCalled();
    expect(openSettingsSpy).not.toHaveBeenCalled();
    expect(mockShowAlert).not.toHaveBeenCalled();
  });

  it('shows a visible alert when camera permission is denied', async () => {
    (ImagePicker.getCameraPermissionsAsync as jest.Mock).mockResolvedValue({
      status: 'denied',
      granted: false,
      canAskAgain: true,
    });
    (ImagePicker.requestCameraPermissionsAsync as jest.Mock).mockResolvedValue({
      status: 'denied',
      granted: false,
      canAskAgain: true,
    });

    const screen = render(<AvatarPicker {...defaultProps} />);
    fireEvent.press(screen.getByTestId('avatar-picker-trigger'));
    const buttons = getPickerButtons();
    mockShowAlert.mockClear();

    await act(async () => {
      getButton(buttons, 'Prendre une photo')?.onPress?.();
    });
    await flushScheduledPickerAction();

    await waitFor(() => {
      expect(mockShowAlert).toHaveBeenCalledWith(
        'Permission requise',
        "Veuillez autoriser l'accès à la caméra",
        [{ text: 'OK' }],
      );
    });
    expect(ImagePicker.launchCameraAsync).not.toHaveBeenCalled();
  });

  it('surfaces gallery launcher failures instead of swallowing taps', async () => {
    (ImagePicker.launchImageLibraryAsync as jest.Mock).mockRejectedValue(
      new Error('Picker exploded'),
    );

    const screen = render(<AvatarPicker {...defaultProps} />);
    fireEvent.press(screen.getByTestId('avatar-picker-trigger'));
    const buttons = getPickerButtons();
    mockShowAlert.mockClear();

    await act(async () => {
      getButton(buttons, 'Choisir de la galerie')?.onPress?.();
    });
    await flushScheduledPickerAction();

    await waitFor(() => {
      expect(mockShowAlert).toHaveBeenCalledWith(
        'Erreur',
        'Impossible d\'ouvrir le sélecteur de photo pour le moment.',
        [{ text: 'OK' }],
      );
    });
  });

  it('surfaces camera availability failures instead of swallowing taps', async () => {
    (ImagePicker.launchCameraAsync as jest.Mock).mockRejectedValue(
      new Error('Camera unavailable on this device'),
    );

    const screen = render(<AvatarPicker {...defaultProps} />);
    fireEvent.press(screen.getByTestId('avatar-picker-trigger'));
    const buttons = getPickerButtons();
    mockShowAlert.mockClear();

    await act(async () => {
      getButton(buttons, 'Prendre une photo')?.onPress?.();
    });
    await flushScheduledPickerAction();

    await waitFor(() => {
      expect(mockShowAlert).toHaveBeenCalledWith(
        'Erreur',
        'La caméra n\'est pas disponible sur cet appareil.',
        [{ text: 'OK' }],
      );
    });
  });
});
