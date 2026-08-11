import { USER_AGENT } from './ua.js';

interface RobotsRules {
  disallow: string[];
  allow: string[];
  crawlDelayMs: number | null;
}

const cache = new Map<string, RobotsRules>();

/**
 * Minimalistický parser robots.txt — berie do úvahy iba skupinu `User-agent: *`,
 * čo je pre nás správne, lebo sa nevydávame za nikoho iného.
 * Podporuje `*` a `$` v pravidlách, `Crawl-delay` aj `Request-rate`.
 */
function parseRobots(text: string): RobotsRules {
  const rules: RobotsRules = { disallow: [], allow: [], crawlDelayMs: null };
  let inStarGroup = false;

  for (const rawLine of text.split('\n')) {
    const line = rawLine.split('#')[0]!.trim();
    if (!line) continue;

    const idx = line.indexOf(':');
    if (idx === -1) continue;

    const field = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();

    if (field === 'user-agent') {
      inStarGroup = value === '*';
      continue;
    }
    if (!inStarGroup) continue;

    if (field === 'disallow' && value) rules.disallow.push(value);
    else if (field === 'allow' && value) rules.allow.push(value);
    else if (field === 'crawl-delay') {
      const seconds = Number(value);
      if (Number.isFinite(seconds)) rules.crawlDelayMs = seconds * 1000;
    } else if (field === 'request-rate') {
      // formát "10/1m" = 10 requestov za 1 minútu
      const match = /^(\d+)\/(\d+)([smh])$/.exec(value);
      if (match) {
        const [, count, span, unit] = match;
        const unitMs = unit === 's' ? 1000 : unit === 'm' ? 60_000 : 3_600_000;
        rules.crawlDelayMs = (Number(span) * unitMs) / Number(count);
      }
    }
  }

  return rules;
}

function patternToRegex(pattern: string): RegExp {
  const escaped = pattern
    .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*');
  const anchored = escaped.endsWith('\\$') ? `${escaped.slice(0, -2)}$` : escaped;
  return new RegExp(`^${anchored}`);
}

export async function loadRobots(origin: string): Promise<RobotsRules> {
  const cached = cache.get(origin);
  if (cached) return cached;

  const res = await fetch(`${origin}/robots.txt`, {
    headers: { 'user-agent': USER_AGENT },
  });

  // Chýbajúci robots.txt znamená "všetko povolené", ale 5xx radšej berieme
  // ako "nevieme" a nespúšťame crawl.
  if (res.status >= 500) {
    throw new Error(`robots.txt na ${origin} vrátil ${res.status} — crawl nespúšťam`);
  }

  const rules = res.ok ? parseRobots(await res.text()) : { disallow: [], allow: [], crawlDelayMs: null };
  cache.set(origin, rules);
  return rules;
}

/** Presnejšie pravidlo vyhráva; pri zhode dĺžky vyhráva Allow. */
export function isAllowed(rules: RobotsRules, url: string): boolean {
  const path = new URL(url).pathname + new URL(url).search;

  let bestDisallow = -1;
  for (const pattern of rules.disallow) {
    if (patternToRegex(pattern).test(path)) {
      bestDisallow = Math.max(bestDisallow, pattern.length);
    }
  }
  if (bestDisallow === -1) return true;

  let bestAllow = -1;
  for (const pattern of rules.allow) {
    if (patternToRegex(pattern).test(path)) {
      bestAllow = Math.max(bestAllow, pattern.length);
    }
  }

  return bestAllow >= bestDisallow;
}

/**
 * Overí robots.txt pre celý beh a vráti odporúčanú pauzu.
 * Voláme pred každým crawlom, nie raz pri inštalácii — pravidlá sa menia.
 */
export async function assertCrawlable(urls: string[]): Promise<{ crawlDelayMs: number | null }> {
  const origins = new Set(urls.map((u) => new URL(u).origin));
  let delay: number | null = null;

  for (const origin of origins) {
    const rules = await loadRobots(origin);
    if (rules.crawlDelayMs != null) {
      delay = Math.max(delay ?? 0, rules.crawlDelayMs);
    }
    for (const url of urls) {
      if (new URL(url).origin !== origin) continue;
      if (!isAllowed(rules, url)) {
        throw new Error(`robots.txt zakazuje ${url} — crawl nespúšťam`);
      }
    }
  }

  return { crawlDelayMs: delay };
}
