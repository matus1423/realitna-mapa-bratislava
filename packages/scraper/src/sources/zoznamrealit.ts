import type { Listing } from '@rmb/shared';
import { isInBratislavaArea, parseNumber, pricePerM2 } from '@rmb/shared';
import { decodeEntities, findLd, jsonLd } from './html.js';
import type { Coords, ListPageResult, Source } from './source.js';

const ORIGIN = 'https://www.zoznamrealit.sk';

function numericId(url: string): string | null {
  return /-(\d{5,})(?:$|[?#])/.exec(url)?.[1] ?? null;
}

/**
 * zoznamrealit.sk je jediný zo zdrojov, ktorý súradnice v detaile vôbec nemá —
 * mapa sa dopĺňa až requestom na `/ajax/mapa-popup`. Preto implementuje
 * `coordsUrl` a driver mu polohu podá zvonku; stojí to jeden request navyše
 * na inzerát.
 */
export const zoznamrealitSource: Source = {
  name: 'zoznamrealit',
  categories: ['byty'],

  listUrl(_categoryIndex: number, page: number): string {
    const base = `${ORIGIN}/predaj/byty/bratislava`;
    return page === 1 ? base : `${base}/${page}`;
  },

  parseListPage(html: string): ListPageResult {
    const urls = new Set<string>();
    // pozor na /pdf-<slug>-<id> — to je export inzerátu do PDF, ktorý
    // robots.txt zakazuje (`Disallow: /pdf*`), nie stránka inzerátu
    const re = /href="(\/(?!pdf-)[a-z0-9-]+-\d{5,})"/g;
    let match: RegExpExecArray | null;

    while ((match = re.exec(html)) !== null) {
      urls.add(`${ORIGIN}${match[1]}`);
    }

    return { detailUrls: [...urls], totalCount: null };
  },

  coordsUrl(_html: string, url: string): string | null {
    const id = numericId(url);
    return id ? `${ORIGIN}/ajax/mapa-popup?id=${id}` : null;
  },

  parseCoords(html: string): Coords | null {
    const match = /showAddress\(\s*(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)\s*\)/.exec(html);
    const lat = parseNumber(match?.[1] ?? null);
    const lng = parseNumber(match?.[2] ?? null);
    return lat != null && lng != null ? { lat, lng } : null;
  },

  parseDetail(html: string, url: string, coords?: Coords | null): Listing | null {
    const id = numericId(url);
    if (!id || !coords) return null;
    if (!isInBratislavaArea(coords.lat, coords.lng)) return null;

    const listing = findLd(html, 'RealEstateListing');
    const product = findLd(html, 'Product');
    const offer = jsonLd(html)
      .flatMap((blob) => (blob['@graph'] ?? []) as Record<string, unknown>[])
      .find((node) => node['@type'] === 'Offer');

    // og:title má tvar "… - predaj, Bratislava - Petržalka"
    const ogTitle = /property="og:title" content="([^"]*)"/.exec(html)?.[1];
    const address = ogTitle ? decodeEntities(ogTitle).split(',').slice(1).join(',').trim() : null;

    const title = (listing?.['name'] as string | undefined) ?? ogTitle ?? 'Bez názvu';
    const description = (listing?.['description'] as string | undefined) ?? null;

    // plocha a dispozícia sú len v texte popisu — štruktúrované ich portál nedáva
    const areaM2 = parseNumber(/(\d+(?:[,.]\d+)?)\s*m²/.exec(`${title} ${description ?? ''}`)?.[1] ?? null);
    const roomsMatch = /(\d+)[-\s]*izb/i.exec(title) ?? /(\d+)[-\s]*izb/i.exec(description ?? '');
    const price = parseNumber((offer?.['price'] as string | undefined) ?? null);
    const now = new Date().toISOString();

    const images = ((product?.['image'] ?? []) as string[]).filter(
      (src) => typeof src === 'string',
    );

    return {
      id: `zoznamrealit:${id}`,
      source: 'zoznamrealit',
      sourceId: id,
      sourceUrl: url,

      dealType: url.includes('/prenajom') || /prenáj/i.test(ogTitle ?? '') ? 'prenajom' : 'predaj',
      propertyType: 'byt',

      price,
      priceCurrency: 'EUR',
      pricePerM2: pricePerM2(price, areaM2),

      lat: coords.lat,
      lng: coords.lng,
      locationRadius: null,

      address,
      street: null,
      city: address,
      district: null,

      areaM2,
      landAreaM2: null,
      rooms: roomsMatch?.[1] ? Number(roomsMatch[1]) : null,
      roomsRaw: roomsMatch?.[0] ?? null,
      floor: null,
      condition: null,
      hasElevator: null,

      title,
      description,
      imageUrls: images,

      advertiserName: null,
      advertiserType: null,

      publishedAt: null,
      firstSeenAt: now,
      scrapedAt: now,
    };
  },
};
