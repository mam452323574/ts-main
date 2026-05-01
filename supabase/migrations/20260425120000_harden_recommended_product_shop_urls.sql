-- Enforce HTTPS allowlisted shop URLs for recommended products.
-- Existing rows are not validated immediately; new writes are constrained.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'recommended_products_shop_url_allowed_domains_check'
      AND conrelid = 'public.recommended_products'::regclass
  ) THEN
    ALTER TABLE public.recommended_products
      ADD CONSTRAINT recommended_products_shop_url_allowed_domains_check
      CHECK (
        shop_url ~* '^https://(apps\.apple\.com|play\.google\.com)([/?#]|$)'
      ) NOT VALID;
  END IF;
END $$;
