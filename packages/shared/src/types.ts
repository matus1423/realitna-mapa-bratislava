export type DealType = 'predaj' | 'prenajom';

export type PropertyType = 'byt' | 'dom' | 'pozemok' | 'komercne' | 'ine';

/** Zdroj dát — jeden portál. */
export type Source =
  | 'nehnutelnosti'
  | 'reality'
  | 'topreality'
  | 'zoznamrealit'
  | 'bazos';

/**
 * nehnutelnosti.sk, reality.sk a topreality.sk patria do tej istej siete
 * (United Classifieds) a zdieľajú inzeráty. Prvé dva používajú dokonca
 * rovnaké ID, takže ich duplicity vieme spárovať presne, nie odhadom.
 */
export const SHARED_ID_SOURCES: readonly Source[] = ['nehnutelnosti', 'reality'];

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

  /** Medián €/m² v okolí (~500 m). */
  areaPricePerM2: number | null;
  /** Pomer ceny bytu k okoliu; 0,85 = o 15 % lacnejší. */
  priceRatio: number | null;
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
  /** Poloha je len približná (ťažisko PSČ), nie adresa. */
  imprecise: boolean;
  /** Pomer ceny k okoliu; 0,85 = o 15 % lacnejší než okolie. */
  priceRatio: number | null;
}

/**
 * To, čo vie dať scraper. `areaPricePerM2` a `priceRatio` sa dopočítavajú
 * až po crawle z celej databázy, takže ich jednotlivý parser nemá odkiaľ vedieť.
 */
export type ScrapedListing = Omit<Listing, 'areaPricePerM2' | 'priceRatio'>;

export interface ListingFilters {
  dealType?: DealType;
  propertyTypes?: PropertyType[];
  priceMin?: number;
  priceMax?: number;
  areaMin?: number;
  areaMax?: number;
  rooms?: number[];
}
