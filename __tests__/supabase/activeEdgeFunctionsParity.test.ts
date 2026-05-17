import * as fs from 'fs';
import * as path from 'path';

const REPO_ROOT = process.cwd();
const ACTIVE_EDGE_FUNCTIONS_MANIFEST_PATH = path.join(
  REPO_ROOT,
  'supabase',
  'functions',
  'active-edge-functions.json',
);
const DEPLOY_SCRIPT_PATH = path.join(REPO_ROOT, 'deploy_functions.ps1');
const SUPABASE_CONFIG_PATH = path.join(REPO_ROOT, 'supabase', 'config.toml');

function readActiveEdgeFunctionsManifest() {
  const rawManifest = fs.readFileSync(ACTIVE_EDGE_FUNCTIONS_MANIFEST_PATH, 'utf8');
  const parsedManifest = JSON.parse(rawManifest) as {
    functions?: unknown;
  };

  if (!Array.isArray(parsedManifest.functions)) {
    throw new Error('active-edge-functions.json must expose a top-level functions array');
  }

  return parsedManifest.functions.map((value) => String(value));
}

function readSocialRoutesFromService(relativeFilePath: string) {
  const source = fs.readFileSync(path.join(REPO_ROOT, relativeFilePath), 'utf8');

  return Array.from(
    new Set(
      [...source.matchAll(/'((social-[a-z-]+))'/g)].map(([, route]) => route),
    ),
  ).sort();
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function readNamedImportsFromModule(
  relativeFilePath: string,
  moduleSpecifier: string,
) {
  const source = fs.readFileSync(path.join(REPO_ROOT, relativeFilePath), 'utf8');
  const importPattern = new RegExp(
    `import\\s*\\{([^}]*)\\}\\s*from\\s*['"]${escapeRegExp(moduleSpecifier)}['"]`,
  );
  const match = source.match(importPattern);

  if (!match) {
    throw new Error(
      `Unable to find named import for "${moduleSpecifier}" in ${relativeFilePath}`,
    );
  }

  return match[1]
    .split(',')
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0)
    .map((segment) => segment.replace(/\s+as\s+\w+$/, '').trim())
    .sort();
}

function readExportedFunctions(relativeFilePath: string) {
  const source = fs.readFileSync(path.join(REPO_ROOT, relativeFilePath), 'utf8');

  return new Set(
    [...source.matchAll(/export\s+(?:async\s+)?function\s+([A-Za-z0-9_]+)/g)].map(
      ([, exportName]) => exportName,
    ),
  );
}

function readDeployVerificationBlock(functionName: string) {
  const source = fs.readFileSync(DEPLOY_SCRIPT_PATH, 'utf8');
  const lines = source.split(/\r?\n/);
  const startIndex = lines.findIndex((line) =>
    line.includes(`'${functionName}' {`),
  );

  if (startIndex < 0) {
    throw new Error(`Unable to find deploy verification block for ${functionName}`);
  }

  const nextBlockIndex = lines.findIndex(
    (line, index) =>
      index > startIndex &&
      (/^\s+'[^']+' \{$/.test(line) || /^\s+default \{$/.test(line)),
  );

  return lines
    .slice(startIndex, nextBlockIndex >= 0 ? nextBlockIndex : lines.length)
    .join('\n');
}

function readFunctionVerificationConfig() {
  const source = fs.readFileSync(SUPABASE_CONFIG_PATH, 'utf8');
  const functionConfig = new Map<string, boolean>();
  const functionBlockPattern =
    /\[functions\.([^\]]+)\]\s*[\r\n]+verify_jwt\s*=\s*(true|false)/g;

  for (const [, functionName, rawVerifyJwt] of source.matchAll(functionBlockPattern)) {
    functionConfig.set(functionName, rawVerifyJwt === 'true');
  }

  return functionConfig;
}

describe('active Edge Functions parity', () => {
  it('keeps the canonical manifest wired into deploy_functions.ps1', () => {
    const deployScriptSource = fs.readFileSync(DEPLOY_SCRIPT_PATH, 'utf8');

    expect(deployScriptSource).toContain('active-edge-functions.json');
    expect(deployScriptSource).not.toContain('--no-verify-jwt');
  });

  it('lists unique active function slugs and every local function directory exists', () => {
    const activeFunctionSlugs = readActiveEdgeFunctionsManifest();
    const uniqueFunctionSlugs = new Set(activeFunctionSlugs);

    expect(activeFunctionSlugs.length).toBe(uniqueFunctionSlugs.size);
    expect(activeFunctionSlugs).toEqual(
      expect.arrayContaining([
        'social-update-comment',
        'social-delete-post',
        'social-delete-comment',
      ]),
    );

    activeFunctionSlugs.forEach((functionSlug) => {
      const localFunctionPath = path.join(REPO_ROOT, 'supabase', 'functions', functionSlug);
      expect(fs.existsSync(localFunctionPath)).toBe(true);
    });
  });

  it('covers every social edge function invoked by the frontend services', () => {
    const activeFunctionSlugs = new Set(readActiveEdgeFunctionsManifest());
    const invokedSocialFunctionSlugs = new Set([
      ...readSocialRoutesFromService(path.join('services', 'social.ts')),
      ...readSocialRoutesFromService(path.join('services', 'socialAdmin.ts')),
    ]);

    expect([...invokedSocialFunctionSlugs].sort()).toEqual([
      'social-admin-adjust-post-reactions',
      'social-admin-eradicate-user',
      'social-admin-moderate-user',
      'social-create-comment',
      'social-create-post',
      'social-delete-comment',
      'social-delete-post',
      'social-follow-author',
      'social-hide-author',
      'social-list-moderation-queue',
      'social-moderate-content',
      'social-reclassify-post',
      'social-record-impressions',
      'social-record-post-views',
      'social-report-content',
      'social-reserve-upload',
      'social-set-comment-like',
      'social-set-reaction',
      'social-set-save',
      'social-update-comment',
    ]);

    expect(
      [...invokedSocialFunctionSlugs].filter((route) => !activeFunctionSlugs.has(route)),
    ).toEqual([]);
  });

  it('keeps social comment function imports backed by local phase2Social exports', () => {
    const exportedSharedFunctions = readExportedFunctions(
      path.join('supabase', 'functions', '_shared', 'phase2Social.ts'),
    );
    const updateCommentImports = readNamedImportsFromModule(
      path.join('supabase', 'functions', 'social-update-comment', 'index.ts'),
      '../_shared/phase2Social.ts',
    );
    const deleteCommentImports = readNamedImportsFromModule(
      path.join('supabase', 'functions', 'social-delete-comment', 'index.ts'),
      '../_shared/phase2Social.ts',
    );

    expect(updateCommentImports).toEqual([
      'assertEditableSocialComment',
      'assertNoRecentDuplicateCommentExcluding',
      'getSocialCommentSnapshotForUser',
      'getSocialRejectionCooldown',
    ]);
    expect(deleteCommentImports).toEqual(['assertDeletableSocialComment']);

    [...updateCommentImports, ...deleteCommentImports].forEach((importName) => {
      expect(exportedSharedFunctions.has(importName)).toBe(true);
    });
  });

  it('keeps social telemetry bundle verification wired into deploy_functions.ps1', () => {
    const impressionsBlock = readDeployVerificationBlock('social-record-impressions');
    const postViewsBlock = readDeployVerificationBlock('social-record-post-views');

    expect(impressionsBlock).toContain('phase2Auth.ts');
    expect(impressionsBlock).toContain('ensureUserProfileExistsForAuthenticatedUser');
    expect(impressionsBlock).toContain('parseSocialRecordImpressionsRequest');

    expect(postViewsBlock).toContain('phase2Auth.ts');
    expect(postViewsBlock).toContain('ensureUserProfileExistsForAuthenticatedUser');
    expect(postViewsBlock).toContain('parseSocialRecordPostViewsRequest');
  });

  it('keeps coach generation bundle verification wired into deploy_functions.ps1', () => {
    const coachGenerationBlock = readDeployVerificationBlock('coach-generate-response');

    expect(coachGenerationBlock).toContain('handler.ts');
    expect(coachGenerationBlock).toContain('phase2Contracts.ts');
    expect(coachGenerationBlock).toContain('parseCoachGenerateRequest');
  });

  it('keeps Supabase function JWT verification config in parity with the active manifest', () => {
    const activeFunctionSlugs = readActiveEdgeFunctionsManifest().sort();
    const functionConfig = readFunctionVerificationConfig();
    const publicWebhookFunctionSlugs = new Set([
      'check-ip-signup',
      'auth-pre-login',
      // U2-γ Phase 3 — Edge Function appelée avant signup (verify_jwt = false).
      'check-signup-eligibility',
      'fridge-scan-complete',
      'revenuecat-webhook',
      'secure-login',
      'secure-signup',
      'social-process-moderation-queue',
    ]);

    expect([...functionConfig.keys()].sort()).toEqual(activeFunctionSlugs);

    activeFunctionSlugs.forEach((functionSlug) => {
      expect(functionConfig.get(functionSlug)).toBe(
        !publicWebhookFunctionSlugs.has(functionSlug),
      );
    });
  });
});
