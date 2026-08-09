export type DealType = 'predaj' | 'prenajom';

export type PropertyType = 'byt' | 'dom' | 'pozemok' | 'komercne' | 'ine';

/** Zdroj dát — jeden portál. */
export type Source = 'nehnutelnosti';

/** Ohraničenie výrezu mapy. */
export interface BBox {
  latMin: number;
  latMax: number;
  lngMin: number;
  lngMax: number;
}

/**
 * Normalizovaný inzerát — spoločná schéma naprieč všetkými zdrojmi.
 * Každý scraper mapuje svoj portál do tohto tvaru.
 */
export interface Listing {
  /** `${source}:${sourceId}` — stabilné naprieč behmi scrapera. */
  id: string;
  source: Source;
  sourceId: string;
  sourceUrl: string;

  dealType: DealType;
  propertyType: PropertyType;

  price: number | null;
  priceCurrency: string;
  /** €/m² — z portálu, ak ho uvádza, inak dopočítané. */
  pricePerM2: number | null;

  lat: number;
  lng: number;
  /**
   * Presnosť súradnice v metroch. nehnutelnosti.sk vracia stred ulice
   * s radius 200 — viac inzerátov teda zdieľa jeden bod.
   */
  locationRadius: number | null;

  address: string | null;
  street: string | null;
  city: string | null;
  district: string | null;

  areaM2: number | null;
  landAreaM2: number | null;
  /** Počet izieb; garsónka = 1. */
  rooms: number | null;
  /** Pôvodný text dispozície z portálu, napr. "3 izbový byt". */
  roomsRaw: string | null;
  floor: number | null;
  condition: string | null;
  hasElevator: boolean | null;

  title: string;
  description: string | null;
  imageUrls: string[];

  advertiserName: string | null;
  advertiserType: string | null;

  /** ISO 8601. */
  publishedAt: string | null;
  firstSeenAt: string;
  scrapedAt: string;
}

/**
 * Odľahčený tvar pre markery na mape. Pri niekoľkých tisíckach bodov
 * vo výreze je rozdiel oproti plnému `Listing` rádovo 20× menej dát.
 */
export interface ListingMarker {
  id: string;
  lat: number;
  lng: number;
  price: number | null;
  propertyType: PropertyType;
  rooms: number | null;
  /** Zmena ceny oproti prvej videnej cene (záporná = zlacnelo). */
  priceDiff: number | null;
  /** Inzerát pribudol za posledných 7 dní. */
  isNew: boolean;
}

export interface ListingFilters {
  dealType?: DealType;
  propertyTypes?: PropertyType[];
  priceMin?: number;
  priceMax?: number;
  areaMin?: number;
  areaMax?: number;
  rooms?: number[];
}
