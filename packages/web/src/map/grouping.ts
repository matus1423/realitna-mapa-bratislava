import type { ListingMarker } from '@rmb/shared';

/**
 * Skupina inzerátov na jednej súradnici.
 *
 * nehnutelnosti.sk vracia stred ulice (`radius: 200`), nie presnú adresu —
 * niekoľko inzerátov v tom istom dome má teda identický bod. Bez zoskupenia
 * by sa markery prekrývali a spodné by sa nedali kliknúť.
 */
export interface MarkerGroup {
  key: string;
  lat: number;
  lng: number;
  /** ID všetkých inzerátov v skupine — posielame ich do /api/listings/by-id. */
  ids: string[];
  count: number;
  /** Najnižšia cena v skupine; tá sa zobrazuje na pilulke. */
  price: number | null;
  /** Najväčšie zlacnenie v skupine. */
  priceDiff: number | null;
  /** Aspoň jeden inzerát v skupine pribudol od poslednej návštevy. */
  hasNew: boolean;
  propertyType: string;
  /** Pomer ceny k okoliu; berieme z najlacnejšieho bytu v skupine. */
  priceRatio: number | null;
  rooms: number | null;
  /** Aspoň jeden inzerát v skupine má len približnú polohu. */
  imprecise: boolean;
}

/**
 * `newSince` je deň poslednej návštevy (YYYY-MM-DD). Inzeráty videné neskôr
 * dostanú na pilulke bodku. Pri prvej návšteve je `null` a nové nie je nič —
 * inak by sa zvýraznilo úplne všetko, čo nikomu nič nepovie.
 */
export function groupByCoordinate(
  markers: ListingMarker[],
  newSince: string | null = null,
): MarkerGroup[] {
  const groups = new Map<string, MarkerGroup>();
  const isNew = (m: ListingMarker): boolean => newSince != null && m.seenOn > newSince;

  for (const marker of markers) {
    // 5 desatinných miest ≈ 1 m, čo je pod presnosťou zdroja
    const key = `${marker.lat.toFixed(5)},${marker.lng.toFixed(5)}`;
    const existing = groups.get(key);

    if (!existing) {
      groups.set(key, {
        key,
        lat: marker.lat,
        lng: marker.lng,
        ids: [marker.id],
        count: 1,
        price: marker.price,
        priceDiff: marker.priceDiff,
        hasNew: isNew(marker),
        propertyType: marker.propertyType,
        priceRatio: marker.priceRatio,
        rooms: marker.rooms,
        imprecise: marker.imprecise,
      });
      continue;
    }

    existing.ids.push(marker.id);
    existing.count++;
    if (marker.price != null && (existing.price == null || marker.price < existing.price)) {
      existing.price = marker.price;
      existing.rooms = marker.rooms;
      existing.priceRatio = marker.priceRatio;
    }
    if (marker.priceDiff != null && (existing.priceDiff == null || marker.priceDiff < existing.priceDiff)) {
      existing.priceDiff = marker.priceDiff;
    }
    if (isNew(marker)) existing.hasNew = true;
    if (marker.imprecise) existing.imprecise = true;
  }

  return [...groups.values()];
}
