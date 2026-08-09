import { parseArgs } from 'node:util';
import { countListings, upsertListing } from '@rmb/db';
import { fetchHtml } from './http.js';
import { assertCrawlable } from './robots.js';
import { nehnutelnostiSource } from './sources/nehnutelnosti.js';
import type { Source } from './sources/source.js';

const SOURCES: Record<string, Source> = {
  nehnutelnosti: nehnutelnostiSource,
};

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      source: { type: 'string', default: 'nehnutelnosti' },
      limit: { type: 'string', default: '100' },
      'max-pages': { type: 'string', default: '50' },
    },
  });

  const source = SOURCES[values.source!];
  if (!source) {
    throw new Error(`Neznámy zdroj "${values.source}". Dostupné: ${Object.keys(SOURCES).join(', ')}`);
  }

  const limit = Number(values.limit);
  const maxPages = Number(values['max-pages']);

  console.log(`Zdroj: ${source.name}, limit: ${limit} inzerátov`);

  // robots.txt overujeme pri každom behu, nie raz pri inštalácii
  const { crawlDelayMs } = await assertCrawlable([source.listUrl(1)]);
  if (crawlDelayMs != null) {
    console.log(`robots.txt žiada pauzu ${crawlDelayMs} ms medzi requestmi`);
  }
  console.log('robots.txt OK\n');

  const detailUrls: string[] = [];
  const seen = new Set<string>();

  for (let page = 1; page <= maxPages && detailUrls.length < limit; page++) {
    const listUrl = source.listUrl(page);
    process.stdout.write(`  zoznam ${page}: ${listUrl} … `);

    let result;
    try {
      result = source.parseListPage(await fetchHtml(listUrl));
    } catch (err) {
      console.log(`chyba (${(err as Error).message})`);
      continue;
    }

    const fresh = result.detailUrls.filter((u) => !seen.has(u));
    for (const u of fresh) {
      seen.add(u);
      detailUrls.push(u);
    }

    console.log(
      `${fresh.length} nových${result.totalCount ? ` (portál hlási ${result.totalCount} spolu)` : ''}`,
    );

    if (fresh.length === 0) break;
  }

  const toScrape = detailUrls.slice(0, limit);
  console.log(`\nSťahujem ${toScrape.length} detailov…\n`);

  let saved = 0;
  let skipped = 0;
  let failed = 0;

  for (const [index, url] of toScrape.entries()) {
    const progress = `[${index + 1}/${toScrape.length}]`;
    try {
      const listing = source.parseDetail(await fetchHtml(url), url);
      if (!listing) {
        skipped++;
        console.log(`${progress} preskočené (neaktívne alebo mimo Bratislavy) ${url}`);
        continue;
      }
      upsertListing(listing);
      saved++;
      console.log(
        `${progress} ${listing.price?.toLocaleString('sk-SK') ?? '—'} € · ` +
          `${listing.areaM2 ?? '—'} m² · ${listing.address ?? '—'}`,
      );
    } catch (err) {
      failed++;
      console.log(`${progress} CHYBA ${url}: ${(err as Error).message}`);
    }
  }

  const counts = countListings();
  console.log(
    `\nHotovo — uložených ${saved}, preskočených ${skipped}, chýb ${failed}.\n` +
      `V databáze je celkovo ${counts.total} inzerátov (${counts.active} aktívnych).`,
  );
}

main().catch((err: unknown) => {
  console.error(err);
  process.exitCode = 1;
});
