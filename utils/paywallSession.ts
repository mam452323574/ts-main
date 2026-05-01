class PaywallSessionTracker {
  private hasShownGlobalPaywall = false;

  public canShowPaywall(): boolean {
    return !this.hasShownGlobalPaywall;
  }

  public markPaywallShown(): void {
    this.hasShownGlobalPaywall = true;
  }

  public reset(): void {
    this.hasShownGlobalPaywall = false;
  }
}

export const paywallSession = new PaywallSessionTracker();
