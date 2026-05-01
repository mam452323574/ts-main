-- Enable social comments for all authenticated users.
-- The social_comments_enabled flag was defaulting to false in the seed,
-- which prevented normal accounts from seeing the comment button and
-- accessing the comments screen in the Social section.

UPDATE public.app_feature_flags
SET social_comments_enabled = true,
    updated_at = now()
WHERE scope = 'mobile';
