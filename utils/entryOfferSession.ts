class EntryOfferSessionTracker {
  private activeUserId: string | null = null;
  private hasStartedEntryOffer = false;

  private syncUser(userId?: string | null) {
    const normalizedUserId = userId ?? null;
    if (this.activeUserId !== normalizedUserId) {
      this.activeUserId = normalizedUserId;
      this.hasStartedEntryOffer = false;
    }
  }

  public canAutoPresent(userId?: string | null) {
    this.syncUser(userId);
    return !this.hasStartedEntryOffer;
  }

  public markAutoPresentationStarted(userId?: string | null) {
    this.syncUser(userId);
    this.hasStartedEntryOffer = true;
  }

  public reset() {
    this.activeUserId = null;
    this.hasStartedEntryOffer = false;
  }
}

export const entryOfferSession = new EntryOfferSessionTracker();
