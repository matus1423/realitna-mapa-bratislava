import type { Listing } from '@rmb/shared';
import { isInBratislavaArea, parseNumber, pricePerM2 } from '@rmb/shared';
import { attr, findLd } from './html.js';
import type { ListPageResult, Source } from './source.js';

const ORIGIN = 'https://www.reality.sk';

interface Amenity {
  name?: string;
  value?: string;
}

function amenities(html: string): Map<string, string> {
  const residence = findLd(html, 'SingleFamilyResidence');
  const list = (residence?.['amenityFeature'] ?? []) as Amenity[];
  const map = new Map<string, string>();
  for (const item of list) {
    if (item.name && item.value != null) map.set(item.name, String(item.value));
  }
  return map;
}

/**
 * reality.sk beží na tej istej platforme ako nehnutelnosti.sk a zdieľa s ňou
 * aj ID inzerátov — duplicity medzi nimi sa preto párujú presne, nie odhadom.
 * Štruktúra stránky je ale iná: nie RSC payload, ale JSON-LD plus `data-*`
 * atribúty na kontajneri mapy.
 */
export const realitySource: Source = {
  name: 'reality',
  categories: ['byty'],

  listUrl(_categoryIndex: number, page: number): string {
    const base = `${ORIGIN}/byty/bratislava/predaj/`;
    return page === 1 ? base : `${base}?page=${page}`;
  },

  parseListPage(html: string): ListPageResult {
    const urls = new Set<string>();
    const re = /\/byty\/([a-z0-9-]+)\/([A-Za-z0-9]{8,})\//g;
    let match: RegExpExecArray | null;

    while ((match = re.exec(html)) !== null) {
      urls.add(`${ORIGIN}/byty/${match[1]}/${match[2]}/`);
    }

    return { detailUrls: [...urls], totalCount: null };
  },

  parseDetail(html: string, url: string): Listing | null {
    const idMatch = /\/([A-Za-z0-9]{8,})\/?$/.exec(url);
    if (!idMatch?.[1]) return null;

    const lat = parseNumber(attr(html, 'data-latitude'));
    const lng = parseNumber(attr(html, 'data-longitude'));
    if (lat == null || lng == null) return null;
    if (!isInBratislavaArea(lat, lng)) return null;

    // taxonómia v hlavičke stránky je najspoľahlivejší zdroj druhu a transakcie
    const taxonomy = html.slice(0, 200_000);
    if (!taxonomy.includes('"druh-byty"')) return null;

    const product = findLd(html, 'Product');
    const offer = product?.['offers'] as { price?: string } | undefined;
    const residence = findLd(html, 'SingleFamilyResidence');
    const address = (findLd(html, 'Residence')?.['address'] ?? {}) as {
      streetAddress?: string;
      addressLocality?: string;
    };

    const params = amenities(html);
    const floorSize = residence?.['floorSize'] as { value?: number } | undefined;
    const areaM2 = parseNumber(floorSize?.value ?? params.get('Úžitková plocha') ?? null);
    const price = parseNumber(offer?.price ?? null);
    const equipment = params.get('Vybavenie') ?? '';
    const now = new Date().toISOString();

    const images = ((product?.['image'] ?? []) as string[]).filter(
      (src) => typeof src === 'string',
    );

    return {
      id: `reality:${idMatch[1]}`,
      source: 'reality',
      sourceId: idMatch[1],
      sourceUrl: url,

      dealType: taxonomy.includes('"transakcia-prenajom"') ? 'prenajom' : 'predaj',
      propertyType: 'byt',

      price,
      priceCurrency: 'EUR',
      pricePerM2: pricePerM2(price, areaM2),

      lat,
      lng,
      locationRadius: null,

      address: address.addressLocality ?? address.streetAddress ?? null,
      street: null,
      city: address.addressLocality ?? null,
      district: null,

      areaM2,
      landAreaM2: null,
      rooms: parseNumber(params.get('Počet izieb / miestností') ?? null),
      roomsRaw: params.get('Počet izieb / miestností') ?? null,
      floor: parseNumber(params.get('Podlažie') ?? null),
      condition: params.get('Stav nehnuteľnosti') ?? null,
      hasElevator: equipment === '' ? null : equipment.includes('Výťah'),

      title: (product?.['name'] as string | undefined) ?? 'Bez názvu',
      description: (product?.['description'] as string | undefined) ?? null,
      imageUrls: images,

      advertiserName: null,
      advertiserType: null,

      publishedAt: null,
      firstSeenAt: now,
      scrapedAt: now,
    };
  },
};
