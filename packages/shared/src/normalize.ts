import type { PropertyType } from './types.js';

/**
 * Kategórie nehnutelnosti.sk (`parameters.category.mainValue`) → naša schéma.
 */
const MAIN_CATEGORY_MAP: Record<string, PropertyType> = {
  APARTMENTS: 'byt',
  HOUSES: 'dom',
  COTTAGES_AND_CABINS: 'dom',
  LANDS: 'pozemok',
  SPACES_AND_OBJECTS: 'komercne',
  COMMERCIAL_PROPERTIES: 'komercne',
};

export function mapPropertyType(mainValue: string | null | undefined): PropertyType {
  if (!mainValue) return 'ine';
  return MAIN_CATEGORY_MAP[mainValue] ?? 'ine';
}

/**
 * `subValue` nesie dispozíciu: THREE_ROOM_APARTMENT → 3, GARSONKA → 1.
 * Pri domoch a pozemkoch dispozícia nedáva zmysel, vraciame null.
 */
const ROOM_WORDS: Record<string, number> = {
  ONE: 1,
  TWO: 2,
  THREE: 3,
  FOUR: 4,
  FIVE: 5,
  SIX: 6,
};

export function parseRooms(subValue: string | null | undefined): number | null {
  if (!subValue) return null;
  if (subValue.includes('GARSONKA') || subValue.includes('STUDIO')) return 1;
  const match = /^([A-Z]+)_(?:AND_MORE_)?ROOM/.exec(subValue);
  if (match?.[1] && match[1] in ROOM_WORDS) return ROOM_WORDS[match[1]]!;
  return null;
}

/**
 * Ceny a plochy prichádzajú ako reťazce s medzerami a jednotkami:
 * "279 000 €", "3 764,67 €/m²", "74". Nezlomiteľná medzera ( )
 * je tu bežná, preto sa nedá spoľahnúť na obyčajný trim.
 */
export function parseNumber(raw: string | number | null | undefined): number | null {
  if (raw == null) return null;
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;

  const cleaned = raw
    .replace(/[\s  ]/g, '')
    .replace(/[^\d,.-]/g, '')
    .replace(/\.(?=\d{3}\b)/g, '') // tisícové bodky
    .replace(',', '.');

  if (cleaned === '' || cleaned === '-') return null;
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : null;
}

export function pricePerM2(price: number | null, areaM2: number | null): number | null {
  if (price == null || areaM2 == null || areaM2 <= 0) return null;
  return Math.round((price / areaM2) * 100) / 100;
}

/** Bratislava + blízke okolie — mimo tohto obdĺžnika inzeráty zahadzujeme. */
export const BRATISLAVA_BBOX = {
  latMin: 48.0,
  latMax: 48.35,
  lngMin: 16.85,
  lngMax: 17.4,
} as const;

export function isInBratislavaArea(lat: number, lng: number): boolean {
  return (
    lat >= BRATISLAVA_BBOX.latMin &&
    lat <= BRATISLAVA_BBOX.latMax &&
    lng >= BRATISLAVA_BBOX.lngMin &&
    lng <= BRATISLAVA_BBOX.lngMax
  );
}
