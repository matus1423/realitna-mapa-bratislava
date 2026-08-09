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
  hasNew: boolean;
  propertyType: string;
  rooms: number | null;
}

export function groupByCoordinate(markers: ListingMarker[]): MarkerGroup[] {
  const groups = new Map<string, MarkerGroup>();

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
        hasNew: marker.isNew,
        propertyType: marker.propertyType,
        rooms: marker.rooms,
      });
      continue;
    }

    existing.ids.push(marker.id);
    existing.count++;
    if (marker.price != null && (existing.price == null || marker.price < existing.price)) {
      existing.price = marker.price;
      existing.rooms = marker.rooms;
    }
    if (marker.priceDiff != null && (existing.priceDiff == null || marker.priceDiff < existing.priceDiff)) {
      existing.priceDiff = marker.priceDiff;
    }
    if (marker.isNew) existing.hasNew = true;
  }

  return [...groups.values()];
}
