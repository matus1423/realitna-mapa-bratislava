import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { repoRoot } from '@rmb/db';

const CACHE_DIR = resolve(repoRoot, 'data/cache');
const DELAY_MS = Number(process.env.SCRAPE_DELAY_MS ?? 1500);
const USE_CACHE = process.env.SCRAPE_USE_CACHE !== '0';

const USER_AGENT =
  'realitna-mapa-bratislava/0.1 (osobný prototyp; kontakt: matus.mader00@gmail.com)';

let lastRequestAt = 0;
let minDelayMs = 0;

/**
 * Zvýši pauzu nad rámec `SCRAPE_DELAY_MS` pre portály, ktoré si to pýtajú
 * v robots.txt (topreality.sk má `Request-rate: 10/1m`, čiže 6 s).
 */
export function setMinDelay(ms: number): void {
  minDelayMs = ms;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Rate-limit je globálny, nie per-doména — pri jednom zdroji je to prísnejšie a stačí to. */
async function throttle(): Promise<void> {
  const delay = Math.max(DELAY_MS, minDelayMs);
  const waitFor = lastRequestAt + delay - Date.now();
  if (waitFor > 0) await sleep(waitFor);
  lastRequestAt = Date.now();
}

function cachePath(url: string): string {
  const hash = createHash('sha1').update(url).digest('hex');
  return resolve(CACHE_DIR, `${hash}.html`);
}

export interface FetchOptions {
  /** Vynúti sieť aj keď je stránka v cache. */
  noCache?: boolean;
}

/**
 * Stiahne stránku s rate-limitom a cachovaním na disk.
 * Cache existuje preto, aby sa počas ladenia parsera nesťahovala tá istá
 * stránka dookola — portál o tom nemá vedieť.
 */
export async function fetchHtml(url: string, opts: FetchOptions = {}): Promise<string> {
  const path = cachePath(url);

  if (USE_CACHE && !opts.noCache && existsSync(path)) {
    return readFileSync(path, 'utf8');
  }

  await throttle();

  const res = await fetch(url, {
    headers: {
      'user-agent': USER_AGENT,
      accept: 'text/html,application/xhtml+xml',
      'accept-language': 'sk-SK,sk;q=0.9',
    },
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status} pri ${url}`);
  }

  const html = await res.text();

  mkdirSync(CACHE_DIR, { recursive: true });
  writeFileSync(path, html, 'utf8');

  return html;
}

export { USER_AGENT, DELAY_MS };
