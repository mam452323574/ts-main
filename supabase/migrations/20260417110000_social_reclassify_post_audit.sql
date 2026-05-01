ALTER TABLE public.social_moderation_events
  DROP CONSTRAINT IF EXISTS social_moderation_events_action_check;

ALTER TABLE public.social_moderation_events
  ADD CONSTRAINT social_moderation_events_action_check CHECK (
    action IN (
      'approve',
      'flag',
      'hide',
      'remove',
      'restore',
      'reject',
      'dismiss_reports',
      'reclassify_category'
    )
  );
