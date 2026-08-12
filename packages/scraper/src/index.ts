import { parseArgs } from 'node:util';
import { countListings, deactivateMissing, upsertListing } from '@rmb/db';
import { dedupe } from './dedupe.js';
import { fetchHtml, setMinDelay } from './http.js';
import { assertCrawlable } from './robots.js';
import { bazosSource } from './sources/bazos.js';
import { nehnutelnostiSource } from './sources/nehnutelnosti.js';
import { realitySource } from './sources/reality.js';
import type { Coords, Source } from './sources/source.js';
import { toprealitySource } from './sources/topreality.js';
import { zoznamrealitSource } from './sources/zoznamrealit.js';

const SOURCES: Record<string, Source> = {
  nehnutelnosti: nehnutelnostiSource,
  reality: realitySource,
  topreality: toprealitySource,
  zoznamrealit: zoznamrealitSource,
  bazos: bazosSource,
};

/**
 * reality.sk odmieta klientov, ktorí sa nevydávajú za prehliadač — na náš
 * User-Agent vráti WAF stránku "Request Rejected". Ich robots.txt tie cesty
 * povoľuje, ale blokáciu berieme ako jasnejší signál a portál nesťahujeme.
 * Stratíme tým minimum: reality.sk zdieľa inzeráty aj ID s nehnutelnosti.sk,
 * takže by ich deduplikácia aj tak zlúčila. Dá sa spustiť cez `--source reality`.
 */
const BLOCKED_BY_DEFAULT = new Set(['reality']);

const DEFAULT_SOURCES = Object.keys(SOURCES).filter((name) => !BLOCKED_BY_DEFAULT.has(name));

interface RunStats {
  saved: number;
  skipped: number;
  failed: number;
}

async function collectDetailUrls(source: Source, limit: number, maxPages: number): Promise<string[]> {
  const seen = new Set<string>();
  const urls: string[] = [];

  for (const [categoryIndex, category] of source.categories.entries()) {
    console.log(`\n  kategória "${category}"`);

    let consecutiveErrors = 0;

    for (let page = 1; page <= maxPages && urls.length < limit; page++) {
      const listUrl = source.listUrl(categoryIndex, page);
      process.stdout.write(`    strana ${page}: `);

      let result;
      try {
        result = source.parseListPage(await fetchHtml(listUrl), listUrl);
        consecutiveErrors = 0;
      } catch (err) {
        console.log(`chyba (${(err as Error).message})`);
        // portály zastropujú hĺbku stránkovania a ďalej vracajú 404;
        // nemá zmysel búchať na zavreté dvere ďalších tristo strán
        if (++consecutiveErrors >= 3) {
          console.log('    tri chyby po sebe — kategóriu končím');
          break;
        }
        continue;
      }

      const fresh = result.detailUrls.filter((u) => !seen.has(u));
      for (const u of fresh) {
        seen.add(u);
        urls.push(u);
      }

      console.log(
        `${fresh.length} nových` +
          (result.totalCount ? ` (portál hlási ${result.totalCount} spolu)` : ''),
      );

      // Prázdna strana znamená koniec kategórie, nie koniec celého zdroja.
      // Pri zdrojoch, ktoré filtrujú lokalitu až z textu, ale nula zhôd
      // neznamená nula inzerátov — tam sa pýtame na `itemsOnPage`.
      const pageWasEmpty = result.itemsOnPage != null ? result.itemsOnPage === 0 : fresh.length === 0;
      if (pageWasEmpty) break;
    }

    if (urls.length >= limit) break;
  }

  return urls.slice(0, limit);
}

async function scrapeSource(source: Source, limit: number, maxPages: number): Promise<RunStats> {
  console.log(`\n${'='.repeat(60)}\nZdroj: ${source.name} (limit ${limit})`);
  const startedAt = new Date().toISOString();

  setMinDelay(source.minDelayMs ?? 0);

  const { crawlDelayMs } = await assertCrawlable([source.listUrl(0, 1)]);
  if (crawlDelayMs != null) {
    console.log(`  robots.txt žiada pauzu ${crawlDelayMs} ms — rešpektujem ju`);
    setMinDelay(Math.max(source.minDelayMs ?? 0, crawlDelayMs));
  }

  const detailUrls = await collectDetailUrls(source, limit, maxPages);
  console.log(`\n  sťahujem ${detailUrls.length} detailov…`);

  const stats: RunStats = { saved: 0, skipped: 0, failed: 0 };

  for (const [index, url] of detailUrls.entries()) {
    const progress = `  [${index + 1}/${detailUrls.length}]`;
    try {
      const html = await fetchHtml(url);

      // niektoré portály držia polohu mimo detailu — dotiahneme ju zvlášť
      let coords: Coords | null = null;
      if (source.coordsUrl && source.parseCoords) {
        const mapUrl = source.coordsUrl(html, url);
        if (mapUrl) coords = source.parseCoords(await fetchHtml(mapUrl));
      }

      const listing = source.parseDetail(html, url, coords);
      if (!listing) {
        stats.skipped++;
        continue;
      }

      upsertListing(listing);
      stats.saved++;

      if (stats.saved % 25 === 0 || detailUrls.length < 30) {
        console.log(
          `${progress} ${listing.price?.toLocaleString('sk-SK') ?? '—'} € · ` +
            `${listing.areaM2 ?? '—'} m² · ${listing.address ?? '—'}`,
        );
      }
    } catch (err) {
      stats.failed++;
      console.log(`${progress} CHYBA ${url}: ${(err as Error).message}`);
    }
  }

  console.log(
    `\n  ${source.name}: uložených ${stats.saved}, preskočených ${stats.skipped}, chýb ${stats.failed}`,
  );

  // Zhasnúť nevidené sa dá len vtedy, keď sme zdroj naozaj prešli celý.
  // Po behu s malým --limit by to zhaslo všetko, na čo sa nedostalo.
  const wasFullRun = detailUrls.length < limit && stats.failed < detailUrls.length * 0.1;
  if (wasFullRun) {
    const gone = deactivateMissing(source.name, startedAt);
    if (gone > 0) console.log(`  ${gone} inzerátov už na portáli nie je — označené za neaktívne`);
  } else {
    console.log('  (beh bol obmedzený limitom alebo mal veľa chýb — zmiznuté inzeráty nezhasínam)');
  }

  return stats;
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      source: { type: 'string', default: 'all' },
      limit: { type: 'string', default: '100' },
      'max-pages': { type: 'string', default: '50' },
      'skip-dedupe': { type: 'boolean', default: false },
    },
  });

  const names =
    values.source === 'all' ? DEFAULT_SOURCES : values.source!.split(',').map((s) => s.trim());

  if (values.source === 'all') {
    console.log(`Preskakujem: ${[...BLOCKED_BY_DEFAULT].join(', ')} (portál blokuje neprehliadačových klientov)`);
  }

  const limit = Number(values.limit);
  const maxPages = Number(values['max-pages']);
  const total: RunStats = { saved: 0, skipped: 0, failed: 0 };

  for (const name of names) {
    const source = SOURCES[name];
    if (!source) {
      throw new Error(`Neznámy zdroj "${name}". Dostupné: ${Object.keys(SOURCES).join(', ')}`);
    }

    const stats = await scrapeSource(source, limit, maxPages);
    total.saved += stats.saved;
    total.skipped += stats.skipped;
    total.failed += stats.failed;
  }

  console.log(
    `\n${'='.repeat(60)}\nSpolu: uložených ${total.saved}, preskočených ${total.skipped}, chýb ${total.failed}`,
  );

  if (!values['skip-dedupe']) {
    const result = dedupe();
    console.log(
      `Deduplikácia: ${result.marked} duplicít (${result.byId} podľa zhodného ID, ` +
        `${result.byMatch} podľa polohy a parametrov)`,
    );
  }

  const counts = countListings();
  console.log(`V databáze: ${counts.total} inzerátov, ${counts.unique} unikátnych na mape.`);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exitCode = 1;
});
