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

/** True if `text` looks like a Cloudflare interstitial (title or HTML body). */
export function isChallengeMarkup(text: string): boolean {
  // Diacritic-fold and squash punctuation so "Potvrďte, že jste člověk"
  // matches the same needle as a un-accented body dump.
  const folded = text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9. ]+/g, ' ')
    .replace(/\s+/g, ' ');
  return CHALLENGE_NEEDLES.some((n) => folded.includes(n));
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

/** `page.goto` with automatic Cloudflare challenge handling. */
export async function safeGoto(
  page: Page,
  url: string,
  opts: { waitUntil?: 'load' | 'networkidle' | 'domcontentloaded'; timeout?: number } = {},
): Promise<void> {
  await page.goto(url, { waitUntil: opts.waitUntil ?? 'load', timeout: opts.timeout ?? 30_000 }).catch(() => undefined);
  await solveCloudflareChallenge(page);
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
