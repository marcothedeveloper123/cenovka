import type { Frame, Page } from 'playwright';

const CHALLENGE_NEEDLES = [
  'vyzadovano overeni',
  'just a moment',
  'okamzik',
  'attention required',
  'cloudflare ray id',
  'potvrdte ze jste clovek',
  'challenges.cloudflare.com',
];

const HARD_BLOCK_NEEDLES = [
  'pristup blokovan',
  'access denied',
  // Cloudflare's static block page mentions email-protection link + ray-id
  // without rendering a turnstile iframe.
];

/** Thrown when Cloudflare returns a static block page (no Turnstile to solve). */
export class KauflandHardBlockError extends Error {
  url: string;
  rayId?: string;
  constructor(url: string, rayId?: string) {
    super(`Kaufland hard-blocked us at ${url}${rayId ? ` (Ray ID ${rayId})` : ''}`);
    this.name = 'KauflandHardBlockError';
    this.url = url;
    this.rayId = rayId;
  }
}

function fold(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9. ]+/g, ' ')
    .replace(/\s+/g, ' ');
}

/** True if `text` looks like a Cloudflare interstitial (title or HTML body). */
export function isChallengeMarkup(text: string): boolean {
  return CHALLENGE_NEEDLES.some((n) => fold(text).includes(n));
}

/**
 * True if `text` looks like a static "you are blocked" page (vs. a solvable
 * Turnstile challenge). The hard-block page does not contain
 * "challenges.cloudflare.com", just a Ray ID + IP and a help blurb.
 */
export function isHardBlockMarkup(text: string): boolean {
  const folded = fold(text);
  if (folded.includes('challenges.cloudflare.com')) return false;
  return HARD_BLOCK_NEEDLES.some((n) => folded.includes(n));
}

/** Fast probe: title + presence of a Cloudflare/Turnstile iframe. */
export async function isChallengePresent(page: Page): Promise<boolean> {
  const title = await page.title().catch(() => '');
  if (isChallengeMarkup(title)) return true;
  return await page
    .locator('iframe[src*="challenges.cloudflare.com"], iframe[src*="turnstile"]')
    .count()
    .then((n) => n > 0)
    .catch(() => false);
}

interface SolveOpts {
  /** How long to wait for the click to clear the challenge before falling back. */
  autoTimeoutMs?: number;
  /** How long to wait for a human to click after auto-solve fails. */
  manualTimeoutMs?: number;
}

/**
 * Detect a Cloudflare challenge on `page` and try to solve it.
 *
 * Strategy:
 *  1. If no challenge → return 'solved' immediately.
 *  2. Find the Turnstile iframe and click its checkbox.
 *  3. Poll for ≤ autoTimeoutMs; if challenge clears → 'auto'.
 *  4. Otherwise log + poll for ≤ manualTimeoutMs (human clicks the
 *     checkbox in the visible Chrome window) → 'manual'.
 *  5. Otherwise → 'failed'.
 */
export async function solveCloudflareChallenge(
  page: Page,
  opts: SolveOpts = {},
): Promise<'solved' | 'auto' | 'manual' | 'failed'> {
  if (!(await isChallengePresent(page))) return 'solved';

  const autoMs = opts.autoTimeoutMs ?? 20_000;
  const manualMs = opts.manualTimeoutMs ?? 5 * 60_000;

  console.error(`[kaufland-cf] challenge detected at ${page.url()}; attempting auto-click`);
  await tryClickTurnstile(page).catch((err) => {
    console.error(`[kaufland-cf] auto-click threw: ${err instanceof Error ? err.message : String(err)}`);
  });

  if (await pollUntilClear(page, autoMs)) return 'auto';

  console.error('[kaufland-cf] auto-click did not clear it. Click the checkbox in the visible Chrome window — waiting up to 5 min.');
  if (await pollUntilClear(page, manualMs)) return 'manual';

  console.error('[kaufland-cf] still blocked after manual timeout. giving up on this URL.');
  return 'failed';
}

/**
 * `page.goto` with: jittered pre-pause (look less robotic),
 * automatic Cloudflare Turnstile solving, and hard-block detection
 * (throws `KauflandHardBlockError` so the scraper can abort cleanly).
 */
export async function safeGoto(
  page: Page,
  url: string,
  opts: {
    waitUntil?: 'load' | 'networkidle' | 'domcontentloaded';
    timeout?: number;
    /** Min ms to pause before navigating (default 1500). Set 0 for warmup. */
    minPauseMs?: number;
    /** Max ms to pause before navigating (default 3500). */
    maxPauseMs?: number;
  } = {},
): Promise<void> {
  const minMs = opts.minPauseMs ?? 1500;
  const maxMs = opts.maxPauseMs ?? 3500;
  if (maxMs > 0) {
    const wait = Math.floor(minMs + Math.random() * Math.max(0, maxMs - minMs));
    if (wait > 0) await page.waitForTimeout(wait);
  }
  await page.goto(url, { waitUntil: opts.waitUntil ?? 'load', timeout: opts.timeout ?? 30_000 }).catch(() => undefined);
  await assertNotHardBlocked(page);
  await solveCloudflareChallenge(page);
}

async function assertNotHardBlocked(page: Page): Promise<void> {
  const title = await page.title().catch(() => '');
  if (!isHardBlockMarkup(title)) return;
  // Title says "blokován" — confirm there's no turnstile (else it's solvable).
  const hasTurnstile = await page
    .locator('iframe[src*="challenges.cloudflare.com"], iframe[src*="turnstile"]')
    .count()
    .then((n) => n > 0)
    .catch(() => false);
  if (hasTurnstile) return;
  const rayId = await page
    .locator('#rayId, [class*="ray-id"]')
    .first()
    .innerText({ timeout: 1_000 })
    .catch(() => '');
  throw new KauflandHardBlockError(page.url(), rayId.replace(/^Ray ID:\s*/i, '').trim() || undefined);
}

async function tryClickTurnstile(page: Page): Promise<void> {
  // The Turnstile checkbox lives in a same-origin "challenges.cloudflare.com"
  // iframe (sometimes nested two deep). Walk every frame until we find an
  // input[type=checkbox] and click it.
  for (const frame of page.frames()) {
    if (await clickCheckboxIn(frame)) return;
  }
}

async function clickCheckboxIn(frame: Frame): Promise<boolean> {
  const url = frame.url();
  if (!/cloudflare|turnstile/.test(url)) return false;
  const box = frame.locator('input[type="checkbox"]').first();
  try {
    await box.waitFor({ state: 'visible', timeout: 6_000 });
    await box.click({ timeout: 4_000 });
    return true;
  } catch {
    return false;
  }
}

async function pollUntilClear(page: Page, ms: number): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < ms) {
    if (!(await isChallengePresent(page))) return true;
    await page.waitForTimeout(1_000);
  }
  return false;
}
