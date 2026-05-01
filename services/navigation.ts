import { router } from 'expo-router';

class NavigationService {
  private isNavigating = false;
  private navigationQueue: Array<() => void> = [];

  async dismissAllModalsAndNavigate(path: string, delay: number = 300): Promise<void> {
    if (this.isNavigating) {
      return new Promise((resolve) => {
        this.navigationQueue.push(() => {
          this.dismissAllModalsAndNavigate(path, delay).then(resolve);
        });
      });
    }

    try {
      this.isNavigating = true;

      try {
        router.dismissAll();
      } catch {
      }

      await new Promise((resolve) => setTimeout(resolve, delay));
      router.replace(path as any);
    } catch (error) {
      console.error('[Navigation] Error in dismissAllModalsAndNavigate:', error);
      try {
        router.replace(path as any);
      } catch (fallbackError) {
        console.error('[Navigation] Fallback navigation failed:', fallbackError);
      }
    } finally {
      this.isNavigating = false;

      if (this.navigationQueue.length > 0) {
        const nextNavigation = this.navigationQueue.shift();
        if (nextNavigation) {
          setTimeout(nextNavigation, 100);
        }
      }
    }
  }


  navigateToNotifications(): void {
    try {
      try { router.dismissAll(); } catch {}
      setTimeout(() => {
        try {
          router.push('/notifications');
        } catch (error) {
          console.error('[Navigation] Error pushing notifications:', error);
        }
      }, 100);
    } catch (error) {
      console.error('[Navigation] Error navigating to notifications:', error);
    }
  }

  canNavigate(): boolean {
    return !this.isNavigating;
  }

  clearQueue(): void {
    this.navigationQueue = [];
  }
}

export const navigationService = new NavigationService();
