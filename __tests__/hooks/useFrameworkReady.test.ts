import { renderHook } from '@testing-library/react-native';
import { Platform } from 'react-native';
import { useFrameworkReady } from '@/hooks/useFrameworkReady';

describe('useFrameworkReady', () => {
  const originalPlatform = Platform.OS;

  afterEach(() => {
    // Reset Platform.OS
    Object.defineProperty(Platform, 'OS', { value: originalPlatform });
    // Clean up window.frameworkReady
    if (typeof window !== 'undefined') {
      delete (window as any).frameworkReady;
    }
  });

  it('calls frameworkReady on web when available', () => {
    // Mock Platform.OS as web
    Object.defineProperty(Platform, 'OS', { value: 'web' });
    
    const mockFrameworkReady = jest.fn();
    (global as any).window = { frameworkReady: mockFrameworkReady };

    renderHook(() => useFrameworkReady());

    expect(mockFrameworkReady).toHaveBeenCalled();
  });

  it('does not crash when frameworkReady is not defined on web', () => {
    Object.defineProperty(Platform, 'OS', { value: 'web' });
    (global as any).window = {};

    expect(() => {
      renderHook(() => useFrameworkReady());
    }).not.toThrow();
  });

  it('does not call frameworkReady on iOS', () => {
    Object.defineProperty(Platform, 'OS', { value: 'ios' });
    
    const mockFrameworkReady = jest.fn();
    if (typeof window !== 'undefined') {
      (window as any).frameworkReady = mockFrameworkReady;
    }

    renderHook(() => useFrameworkReady());

    expect(mockFrameworkReady).not.toHaveBeenCalled();
  });

  it('does not call frameworkReady on Android', () => {
    Object.defineProperty(Platform, 'OS', { value: 'android' });
    
    const mockFrameworkReady = jest.fn();
    if (typeof window !== 'undefined') {
      (window as any).frameworkReady = mockFrameworkReady;
    }

    renderHook(() => useFrameworkReady());

    expect(mockFrameworkReady).not.toHaveBeenCalled();
  });

  it('renders without crashing', () => {
    expect(() => {
      renderHook(() => useFrameworkReady());
    }).not.toThrow();
  });
});
