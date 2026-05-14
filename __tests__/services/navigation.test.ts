import { navigationService } from '@/services/navigation';

// Mock expo-router
const mockCanDismiss = jest.fn();
const mockDismissAll = jest.fn();
const mockReplace = jest.fn();
const mockPush = jest.fn();

jest.mock('expo-router', () => ({
  router: {
    canDismiss: () => mockCanDismiss(),
    dismissAll: () => mockDismissAll(),
    replace: (path: string) => mockReplace(path),
    push: (path: string) => mockPush(path),
  },
}));

describe('navigationService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    mockCanDismiss.mockReturnValue(true);
    navigationService.clearQueue();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('canNavigate', () => {
    it('returns true initially', () => {
      expect(navigationService.canNavigate()).toBe(true);
    });
  });

  describe('clearQueue', () => {
    it('clears the navigation queue', () => {
      // This shouldn't throw
      expect(() => navigationService.clearQueue()).not.toThrow();
    });
  });

  describe('navigateToNotifications', () => {
    it('calls router.push with /notifications', () => {
      navigationService.navigateToNotifications();
      jest.advanceTimersByTime(100);

      expect(mockDismissAll).toHaveBeenCalled();
      expect(mockPush).toHaveBeenCalledWith('/notifications');
    });

    it('skips dismissAll when no dismissible stack exists', () => {
      mockCanDismiss.mockReturnValue(false);

      navigationService.navigateToNotifications();
      jest.advanceTimersByTime(100);

      expect(mockDismissAll).not.toHaveBeenCalled();
      expect(mockPush).toHaveBeenCalledWith('/notifications');
    });

    it('handles errors gracefully', () => {
      mockPush.mockImplementationOnce(() => {
        throw new Error('Navigation error');
      });

      expect(() => navigationService.navigateToNotifications()).not.toThrow();
    });
  });

  describe('dismissAllModalsAndNavigate', () => {
    it('dismisses modals and navigates to path', async () => {
      const promise = navigationService.dismissAllModalsAndNavigate('/home', 100);
      
      // Fast-forward through the delay
      jest.advanceTimersByTime(100);
      
      await promise;

      expect(mockDismissAll).toHaveBeenCalled();
      expect(mockReplace).toHaveBeenCalledWith('/home');
    });

    it('skips dismissAll and still navigates when no dismissible stack exists', async () => {
      mockCanDismiss.mockReturnValue(false);

      const promise = navigationService.dismissAllModalsAndNavigate('/home', 100);
      jest.advanceTimersByTime(100);

      await promise;

      expect(mockDismissAll).not.toHaveBeenCalled();
      expect(mockReplace).toHaveBeenCalledWith('/home');
    });

    it('uses default delay of 300ms', async () => {
      const promise = navigationService.dismissAllModalsAndNavigate('/settings');
      
      // Not enough time
      jest.advanceTimersByTime(200);
      expect(mockReplace).not.toHaveBeenCalled();
      
      // Now it should work
      jest.advanceTimersByTime(100);
      await promise;

      expect(mockReplace).toHaveBeenCalledWith('/settings');
    });

    it('queues navigation when already navigating', async () => {
      // Start first navigation
      const first = navigationService.dismissAllModalsAndNavigate('/first', 100);
      
      // Start second navigation while first is in progress
      const second = navigationService.dismissAllModalsAndNavigate('/second', 100);
      
      // Complete first navigation
      jest.advanceTimersByTime(100);
      await first;
      
      expect(mockReplace).toHaveBeenCalledWith('/first');
      
      // Process the queue
      jest.advanceTimersByTime(200);
      await second;

      expect(mockReplace).toHaveBeenCalledWith('/second');
    });

    it('handles dismissAll errors gracefully', async () => {
      mockDismissAll.mockImplementationOnce(() => {
        throw new Error('Cannot dismiss');
      });

      const promise = navigationService.dismissAllModalsAndNavigate('/path', 100);
      jest.advanceTimersByTime(100);
      
      await expect(promise).resolves.not.toThrow();
      expect(mockReplace).toHaveBeenCalledWith('/path');
    });

    it('falls back to replace if main navigation fails', async () => {
      mockDismissAll.mockImplementationOnce(() => {
        throw new Error('Dismiss error');
      });
      mockReplace
        .mockImplementationOnce(() => {
          throw new Error('First replace error');
        })
        .mockImplementationOnce(() => {
          // Success on fallback
        });

      const promise = navigationService.dismissAllModalsAndNavigate('/path', 100);
      jest.advanceTimersByTime(100);
      
      await promise;

      // Should have attempted replace twice
      expect(mockReplace).toHaveBeenCalledTimes(2);
    });
  });
});
