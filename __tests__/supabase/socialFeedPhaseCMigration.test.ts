import * as fs from 'fs';
import * as path from 'path';

const REPO_ROOT = process.cwd();
const SCHEMA_PATH = path.join(
  REPO_ROOT,
  'supabase',
  'migrations',
  '20260520120000_social_feed_phase_c.sql',
);
const RPCS_PATH = path.join(
  REPO_ROOT,
  'supabase',
  'migrations',
  '20260520130000_social_phase_c_rpcs.sql',
);

const schemaSql = fs.readFileSync(SCHEMA_PATH, 'utf8');
const rpcsSql = fs.readFileSync(RPCS_PATH, 'utf8');

describe('social feed Phase C migration (schema + scoring v6 + RPC)', () => {
  describe('schema additions', () => {
    it('adds total_dwell_ms (bigint) and dwell_samples (integer) on social_posts', () => {
      expect(schemaSql).toMatch(
        /ADD COLUMN IF NOT EXISTS total_dwell_ms bigint NOT NULL DEFAULT 0/,
      );
      expect(schemaSql).toMatch(
        /ADD COLUMN IF NOT EXISTS dwell_samples integer NOT NULL DEFAULT 0/,
      );
    });

    it('adds save_count and reaction_distribution columns', () => {
      expect(schemaSql).toMatch(
        /ADD COLUMN IF NOT EXISTS save_count integer NOT NULL DEFAULT 0/,
      );
      expect(schemaSql).toMatch(
        /ADD COLUMN IF NOT EXISTS reaction_distribution jsonb NOT NULL DEFAULT '\{\}'::jsonb/,
      );
    });

    it('enforces non-negative checks for the new counters', () => {
      expect(schemaSql).toContain('social_posts_total_dwell_ms_nonneg');
      expect(schemaSql).toContain('social_posts_dwell_samples_nonneg');
      expect(schemaSql).toContain('social_posts_save_count_nonneg');
    });

    it('extends reaction_type CHECK to allow laugh, wow, sad (C3)', () => {
      expect(schemaSql).toMatch(
        /CHECK \(reaction_type IN \('like', 'dislike', 'laugh', 'wow', 'sad'\)\)/,
      );
    });

    it('creates social_post_saves with composite PK and indexes', () => {
      expect(schemaSql).toContain(
        'CREATE TABLE IF NOT EXISTS public.social_post_saves',
      );
      expect(schemaSql).toContain('PRIMARY KEY (viewer_id, post_id)');
      expect(schemaSql).toContain('idx_social_post_saves_viewer_created_at');
      expect(schemaSql).toContain('idx_social_post_saves_post');
    });

    it('enables RLS and viewer-scoped policies on social_post_saves', () => {
      expect(schemaSql).toContain(
        'ALTER TABLE public.social_post_saves ENABLE ROW LEVEL SECURITY',
      );
      expect(schemaSql).toMatch(
        /CREATE POLICY "viewer reads own saves"[\s\S]+?USING \(viewer_id = auth\.uid\(\)\)/,
      );
      expect(schemaSql).toMatch(
        /CREATE POLICY "viewer inserts own saves"[\s\S]+?WITH CHECK \(viewer_id = auth\.uid\(\)\)/,
      );
      expect(schemaSql).toMatch(
        /CREATE POLICY "viewer deletes own saves"[\s\S]+?USING \(viewer_id = auth\.uid\(\)\)/,
      );
    });
  });

  describe('triggers', () => {
    it('C2 — increments/decrements save_count on social_post_saves insert/delete', () => {
      expect(schemaSql).toContain(
        'CREATE OR REPLACE FUNCTION public.handle_social_post_save_counter',
      );
      expect(schemaSql).toMatch(
        /SET save_count = save_count \+ 1\s*\n\s*WHERE id = NEW\.post_id/,
      );
      expect(schemaSql).toMatch(
        /SET save_count = GREATEST\(save_count - 1, 0\)\s*\n\s*WHERE id = OLD\.post_id/,
      );
      expect(schemaSql).toMatch(
        /CREATE TRIGGER tg_social_post_saves_counter[\s\S]+?AFTER INSERT OR DELETE ON public\.social_post_saves/,
      );
    });

    it('C3 — maintains reaction_distribution jsonb on social_post_likes INSERT/UPDATE/DELETE', () => {
      expect(schemaSql).toContain(
        'CREATE OR REPLACE FUNCTION public.handle_social_post_reaction_distribution',
      );
      expect(schemaSql).toMatch(
        /CREATE TRIGGER tg_social_post_likes_reaction_distribution[\s\S]+?AFTER INSERT OR UPDATE OR DELETE ON public\.social_post_likes/,
      );
      // Decrement when DELETE or UPDATE-with-changed-key
      expect(schemaSql).toMatch(/jsonb_set\([\s\S]+?GREATEST\(COALESCE\(\(reaction_distribution->>old_key\)::int, 0\) - 1, 0\)/);
      // Increment when INSERT or UPDATE-with-changed-key
      expect(schemaSql).toMatch(/jsonb_set\([\s\S]+?COALESCE\(\(reaction_distribution->>new_key\)::int, 0\) \+ 1/);
    });
  });

  describe('calculate_social_post_rank_v6', () => {
    it('is created without dropping v5 (rollback safety)', () => {
      expect(schemaSql).toContain(
        'CREATE OR REPLACE FUNCTION public.calculate_social_post_rank_v6',
      );
      expect(schemaSql).not.toContain(
        'DROP FUNCTION IF EXISTS public.calculate_social_post_rank_v5',
      );
    });

    it('takes the new dwell/save/reaction_distribution parameters', () => {
      expect(schemaSql).toMatch(/p_total_dwell_ms\s+bigint/);
      expect(schemaSql).toMatch(/p_dwell_samples\s+integer/);
      expect(schemaSql).toMatch(/p_save_count\s+integer/);
      expect(schemaSql).toMatch(/p_reaction_distribution\s+jsonb/);
    });

    it('preserves the v5 baseline weights and adds the new ones', () => {
      expect(schemaSql).toContain('like_weight constant numeric := 3.0');
      expect(schemaSql).toContain('rejection_penalty_cap constant numeric := 18.0');
      expect(schemaSql).toContain('language_match_boost constant numeric := 7.0');
      expect(schemaSql).toContain('unique_view_weight constant numeric := 0.5');
      expect(schemaSql).toContain('dwell_weight constant numeric := 0.05');
      expect(schemaSql).toContain('save_weight constant numeric := 5.0');
      expect(schemaSql).toContain('nuanced_reaction_boost_cap constant numeric := 1.0');
    });

    it('computes dwell_signal from avg_dwell_ms = total / samples', () => {
      expect(schemaSql).toMatch(/avg_dwell_ms\s*:=\s*GREATEST\(p_total_dwell_ms, 0\)::numeric \/ p_dwell_samples/);
      expect(schemaSql).toMatch(/dwell_signal\s*:=\s*LN\(1 \+ avg_dwell_ms \/ 1000\.0\) \* dwell_weight/);
    });

    it('computes save_signal as ln(1 + save_count) * 5.0', () => {
      expect(schemaSql).toMatch(/save_signal\s*:=\s*LN\(1 \+ GREATEST\(COALESCE\(p_save_count, 0\), 0\)\) \* save_weight/);
    });

    it('bounds nuanced_reaction_boost to the cap (1.0)', () => {
      expect(schemaSql).toMatch(/LEAST\(\s*nuanced_reaction_boost_cap,\s*\(laugh_wow_count \/ total_reactions\) \* nuanced_reaction_boost_cap\s*\)/);
    });

    it('aggregates all signals additively in the final RETURN', () => {
      expect(schemaSql).toMatch(/\+ dwell_signal[\s\S]+?\+ save_signal[\s\S]+?\+ nuanced_reaction_boost/);
    });
  });

  describe('get_social_feed_page (v6 RPC)', () => {
    it('drops the v5 5-arg signature before recreating', () => {
      expect(schemaSql).toContain(
        'DROP FUNCTION IF EXISTS public.get_social_feed_page(text, integer, integer, text, text);',
      );
    });

    it('keeps the same 5-arg signature so the client does not have to change', () => {
      expect(schemaSql).toContain('p_viewer_language_code text DEFAULT NULL');
      expect(schemaSql).toContain('p_viewer_country_code text DEFAULT NULL');
      expect(schemaSql).toMatch(
        /GRANT EXECUTE ON FUNCTION public\.get_social_feed_page\(\s*text,\s*integer,\s*integer,\s*text,\s*text\s*\)\s*TO authenticated/,
      );
    });

    it('extends RETURNS TABLE with save_count, reaction_distribution, viewer_has_saved', () => {
      expect(schemaSql).toMatch(/RETURNS TABLE\s*\([\s\S]*save_count integer[\s\S]*reaction_distribution jsonb[\s\S]*viewer_has_saved boolean[\s\S]*\)/);
    });

    it('declares viewer_saves CTE and left-joins it for the boolean column', () => {
      expect(schemaSql).toMatch(
        /viewer_saves AS \(\s*SELECT[\s\S]+?FROM public\.social_post_saves AS saves[\s\S]+?WHERE saves\.viewer_id = viewer_uid/,
      );
      expect(schemaSql).toMatch(/\(viewer_save\.post_id IS NOT NULL\) AS viewer_has_saved/);
    });

    it('routes scoring through calculate_social_post_rank_v6 with all new parameters', () => {
      expect(schemaSql).toContain('public.calculate_social_post_rank_v6(');
      expect(schemaSql).toMatch(/post\.total_dwell_ms,\s*\n?\s*post\.dwell_samples/);
      expect(schemaSql).toMatch(/post\.save_count,\s*\n?\s*post\.reaction_distribution/);
    });

    it('preserves Phase A/B invariants', () => {
      expect(schemaSql).toContain(
        "AND NOT public.is_user_banned(post.author_id, 'posts')",
      );
      expect(schemaSql).toContain('author_diversity_penalty constant numeric := 2.5');
      expect(schemaSql).toContain('follow_boost_weight constant numeric := 5.0');
      expect(schemaSql).toContain('affinity_positive_cap constant numeric := 3.0');
      expect(schemaSql).toContain('affinity_negative_cap constant numeric := 2.0');
    });

    it('reloads the PostgREST schema cache', () => {
      expect(schemaSql).toContain("SELECT pg_notify('pgrst', 'reload schema')");
    });
  });
});

describe('social feed Phase C RPCs migration', () => {
  describe('set_social_post_save', () => {
    it('is created with SECURITY INVOKER and an explicit search_path', () => {
      expect(rpcsSql).toContain(
        'CREATE OR REPLACE FUNCTION public.set_social_post_save',
      );
      expect(rpcsSql).toMatch(
        /CREATE OR REPLACE FUNCTION public\.set_social_post_save[\s\S]+?SECURITY INVOKER\s*\n\s*SET search_path = public, auth/,
      );
    });

    it('rejects unauthenticated calls, missing post_id, invalid action, or unknown post', () => {
      expect(rpcsSql).toMatch(
        /IF viewer_uid IS NULL THEN\s*\n\s*RAISE EXCEPTION 'Authentication required'/,
      );
      expect(rpcsSql).toMatch(
        /IF p_post_id IS NULL THEN\s*\n\s*RAISE EXCEPTION 'post_id is required'/,
      );
      expect(rpcsSql).toMatch(/normalized_action NOT IN \('save', 'unsave'\)/);
      expect(rpcsSql).toContain("RAISE EXCEPTION 'Post not found or not visible'");
    });

    it('toggles when action is NULL, otherwise applies explicit state', () => {
      expect(rpcsSql).toMatch(/IF normalized_action IS NULL THEN\s*\n\s*result_saved := NOT already_saved/);
      expect(rpcsSql).toMatch(/ELSIF normalized_action = 'save' THEN\s*\n\s*result_saved := true/);
    });

    it('writes idempotently via INSERT ON CONFLICT DO NOTHING / DELETE', () => {
      expect(rpcsSql).toMatch(
        /INSERT INTO public\.social_post_saves[\s\S]+?ON CONFLICT \(viewer_id, post_id\) DO NOTHING/,
      );
      expect(rpcsSql).toMatch(
        /DELETE FROM public\.social_post_saves\s*\n\s*WHERE viewer_id = viewer_uid AND post_id = p_post_id/,
      );
    });

    it('returns a jsonb object with post_id and the resulting saved flag', () => {
      expect(rpcsSql).toMatch(
        /RETURN jsonb_build_object\(\s*\n\s*'post_id', p_post_id,\s*\n\s*'saved', result_saved\s*\n\s*\)/,
      );
    });

    it('grants EXECUTE to authenticated', () => {
      expect(rpcsSql).toMatch(
        /GRANT EXECUTE ON FUNCTION public\.set_social_post_save\(uuid, text\) TO authenticated/,
      );
    });
  });

  describe('record_social_impressions (extended for dwell)', () => {
    it('drops the old 3-arg signature and re-creates with p_dwell_ms_by_post jsonb DEFAULT NULL', () => {
      expect(rpcsSql).toContain(
        'DROP FUNCTION IF EXISTS public.record_social_impressions(uuid[], uuid, text);',
      );
      expect(rpcsSql).toMatch(/p_dwell_ms_by_post jsonb DEFAULT NULL/);
    });

    it('still rejects mismatched viewer_id and unknown source', () => {
      expect(rpcsSql).toContain("RAISE EXCEPTION 'p_viewer_id must match auth.uid()'");
      expect(rpcsSql).toMatch(/normalized_source NOT IN \('feed', 'detail', 'comments'\)/);
    });

    it('aggregates dwell_ms samples into social_posts when the map is provided', () => {
      expect(rpcsSql).toMatch(/total_dwell_ms = total_dwell_ms \+ dwell_ms_value/);
      expect(rpcsSql).toMatch(/dwell_samples = dwell_samples \+ 1/);
    });

    it('clamps each dwell_ms sample to [0, 300000] (5 min cap)', () => {
      expect(rpcsSql).toMatch(/LEAST\(GREATEST\(COALESCE\(\(value\)::bigint, 0\), 0\), 300000\)/);
    });

    it('keeps the impression insert idempotent via ON CONFLICT DO NOTHING', () => {
      expect(rpcsSql).toMatch(
        /INSERT INTO public\.social_post_impressions[\s\S]+?ON CONFLICT \(post_id, viewer_id, impression_window\) DO NOTHING/,
      );
    });

    it('grants EXECUTE to authenticated and service_role', () => {
      expect(rpcsSql).toMatch(
        /GRANT EXECUTE ON FUNCTION public\.record_social_impressions\(uuid\[\], uuid, text, jsonb\) TO authenticated, service_role/,
      );
    });
  });

  it('reloads the PostgREST schema cache', () => {
    expect(rpcsSql).toContain("SELECT pg_notify('pgrst', 'reload schema')");
  });
});
