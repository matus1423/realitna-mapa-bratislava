import type { DealType, ScrapedListing } from '@rmb/shared';
import {
  isInBratislavaArea,
  mapPropertyType,
  parseNumber,
  parseRooms,
  pricePerM2,
} from '@rmb/shared';
import type { ListPageResult, Source } from './source.js';

const ORIGIN = 'https://www.nehnutelnosti.sk';

/**
 * Byty na predaj v Bratislave. robots.txt zakazuje `/api/` a zoradené
 * varianty (`?order=...`), preto ideme cez neutrálne `/vysledky/...`
 * stránky a stránkovanie `?page=N`.
 *
 * Delíme to na päť okresov z dvoch dôvodov. Po prvé, `.../bratislava/...`
 * vracia 3428 bytov, ale stránkovanie končí niekde okolo strany 71 —
 * cez jednu vetvu by sme sa k polovici inzerátov vôbec nedostali.
 * Po druhé, pôvodná cesta `/bratislavsky-kraj/bratislava/` sa presmerúvala
 * na celý kraj (4150 inzerátov vrátane Malaciek a Jakubova), čo sme potom
 * zbytočne sťahovali a zahadzovali. Najväčší okres má ~49 strán, čiže
 * všetky sa zmestia pod strop.
 */
const OKRESY = ['i', 'ii', 'iii', 'iv', 'v'];

/**
 * Prenájmy zbierame tiež — jednak sa dajú zobraziť na mape, jednak sú
 * podkladom pre odhad výnosu pri bytoch na predaj.
 */
const LIST_PATHS = [
  ...OKRESY.map((o) => `/vysledky/byty/bratislava-${o}/predaj`),
  ...OKRESY.map((o) => `/vysledky/byty/bratislava-${o}/prenajom`),
];

/**
 * Stránka je Next.js App Router — celý objekt inzerátu je v RSC payloade
 * rozsekanom do volaní `self.__next_f.push([1,"…"])`. Chunky sú JSON reťazce,
 * ktoré treba najprv rozkódovať a zlepiť, až potom v nich hľadať dáta.
 */
export function extractFlightPayload(html: string): string {
  const MARK = 'self.__next_f.push([1,';
  let out = '';
  let i = 0;

  while ((i = html.indexOf(MARK, i)) !== -1) {
    const start = i + MARK.length;
    if (html[start] !== '"') {
      i = start;
      continue;
    }

    // nájdi koniec JSON reťazca s rešpektovaním escapovania
    let end = start + 1;
    while (end < html.length) {
      if (html[end] === '\\') {
        end += 2;
        continue;
      }
      if (html[end] === '"') break;
      end++;
    }

    try {
      out += JSON.parse(html.slice(start, end + 1)) as string;
    } catch {
      // poškodený chunk preskočíme, zvyšok payloadu býva použiteľný
    }
    i = end;
  }

  return out;
}

/**
 * Vyreže z payloadu objekt začínajúci na `"<key>":{` párovaním zátvoriek.
 * `JSON.parse` na celý payload nejde — je to prúd viacerých hodnôt, nie jeden JSON.
 */
export function extractObject(text: string, key: string): unknown | null {
  const needle = `"${key}":{`;
  const start = text.indexOf(needle);
  if (start === -1) return null;

  const open = start + needle.length - 1;
  let depth = 0;
  let inString = false;

  for (let i = open; i < text.length; i++) {
    const c = text[i];
    if (inString) {
      if (c === '\\') i++;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') inString = true;
    else if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(text.slice(open, i + 1));
        } catch {
          return null;
        }
      }
    }
  }

  return null;
}

interface RawAd {
  id?: string;
  title?: string;
  sefName?: string;
  description?: string;
  isActive?: boolean;
  publishedAt?: string;
  location?: {
    name?: string;
    street?: string;
    city?: string;
    district?: string;
    point?: { latitude?: string; longitude?: string; radius?: number };
  };
  parameters?: {
    price?: { priceNum?: number; unitPrice?: string };
    category?: { mainValue?: string; subValue?: string };
    transaction?: string;
    area?: string;
    landArea?: string;
    floor?: number;
    realEstateState?: string;
    hasElevator?: boolean;
    title?: string;
  };
  media?: { photos?: { mediumUrl?: string; largeUrl?: string; origUrl?: string }[] };
  advertiser?: { name?: string; type?: string; agency?: { name?: string } };
}

function mapDealType(transaction: string | undefined): DealType {
  return transaction?.toLowerCase().startsWith('prenáj') ? 'prenajom' : 'predaj';
}

export const nehnutelnostiSource: Source = {
  name: 'nehnutelnosti',
  categories: LIST_PATHS,

  listUrl(categoryIndex: number, page: number): string {
    const path = LIST_PATHS[categoryIndex]!;
    return page === 1 ? `${ORIGIN}${path}` : `${ORIGIN}${path}?page=${page}`;
  },

  parseListPage(html: string): ListPageResult {
    const urls = new Set<string>();
    const linkRe = /\/detail\/([A-Za-z0-9]+)\/([a-z0-9-]+)/g;
    let match: RegExpExecArray | null;

    while ((match = linkRe.exec(html)) !== null) {
      urls.add(`${ORIGIN}/detail/${match[1]}/${match[2]}`);
    }

    const totalMatch = /\\?"totalCount\\?":(\d+)/.exec(html);

    return {
      detailUrls: [...urls],
      totalCount: totalMatch?.[1] ? Number(totalMatch[1]) : null,
      // Portál opakuje topované inzeráty naprieč stranami, takže strana bez
      // jediného nového odkazu neznamená koniec zoznamu — bez tohto sa zber
      // zastavoval po ~75 % každého okresu.
      itemsOnPage: urls.size,
    };
  },

  parseDetail(html: string, url: string): ScrapedListing | null {
    const flight = extractFlightPayload(html);
    const ad = extractObject(flight, 'advertisement') as RawAd | null;
    if (!ad?.id) return null;
    if (ad.isActive === false) return null;

    const point = ad.location?.point;
    const lat = parseNumber(point?.latitude ?? null);
    const lng = parseNumber(point?.longitude ?? null);

    // Bez súradníc inzerát na mapu nedostaneme, takže ho nemá zmysel ukladať.
    if (lat == null || lng == null) return null;
    if (!isInBratislavaArea(lat, lng)) return null;

    const params = ad.parameters;
    // do zoznamu bytov občas prepadne developerský projekt alebo iná kategória
    if (mapPropertyType(params?.category?.mainValue) !== 'byt') return null;
    const price = params?.price?.priceNum ?? null;
    const areaM2 = parseNumber(params?.area ?? null);
    const now = new Date().toISOString();

    const images = (ad.media?.photos ?? [])
      .map((img) => img.mediumUrl ?? img.largeUrl ?? img.origUrl)
      .filter((u): u is string => typeof u === 'string');

    return {
      id: `nehnutelnosti:${ad.id}`,
      source: 'nehnutelnosti',
      sourceId: ad.id,
      sourceUrl: url,

      dealType: mapDealType(params?.transaction),
      propertyType: mapPropertyType(params?.category?.mainValue),

      price,
      priceCurrency: 'EUR',
      pricePerM2: parseNumber(params?.price?.unitPrice ?? null) ?? pricePerM2(price, areaM2),

      lat,
      lng,
      locationRadius: point?.radius ?? null,

      address: ad.location?.name ?? null,
      street: ad.location?.street ?? null,
      city: ad.location?.city ?? null,
      district: ad.location?.district ?? null,

      areaM2,
      landAreaM2: parseNumber(params?.landArea ?? null),
      rooms: parseRooms(params?.category?.subValue),
      roomsRaw: params?.title ?? null,
      floor: params?.floor ?? null,
      condition: params?.realEstateState ?? null,
      hasElevator: params?.hasElevator ?? null,

      title: ad.title ?? params?.title ?? 'Bez názvu',
      description: ad.description ?? null,
      imageUrls: images,

      advertiserName: ad.advertiser?.agency?.name ?? ad.advertiser?.name ?? null,
      advertiserType: ad.advertiser?.type ?? null,

      publishedAt: ad.publishedAt ?? null,
      firstSeenAt: now,
      scrapedAt: now,
    };
  },
};
