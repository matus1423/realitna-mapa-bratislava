import type { ListingMarker } from '@rmb/shared';
import { daysOnMarket } from '../format.js';
import type { MapState } from '../state/useUrlState.js';

/**
 * Prahy pre filter „cena vzhľadom na okolie“. Nie sú od oka: vychádzajú
 * z rozdelenia pomerov na skutočných dátach, kde desatina bytov leží pod
 * 0,76 a štvrtina nad 1,16. Prah −10 % teda vyberá výrazne užšiu skupinu
 * než „mierne pod priemerom“, a −30 % už len ojedinelé prípady.
 */
export const RATIO_OPTIONS = [
  { value: 0.9, label: '−10 %' },
  { value: 0.8, label: '−20 %' },
  { value: 0.7, label: '−30 %' },
] as const;

/**
 * Prahy pre „ako dlho je byt v ponuke“. Čím dlhšie visí, tým väčší býva
 * priestor na vyjednávanie — a tým väčšia šanca, že s ním niečo je.
 */
export const DAYS_OPTIONS = [
  { value: 30, label: '30+ dní' },
  { value: 60, label: '60+ dní' },
  { value: 90, label: '90+ dní' },
] as const;

/**
 * Dĺžka v ponuke. Dátum z portálu má ~83 % inzerátov; pri zvyšku sa počíta
 * od nášho prvého videnia, čo je spodný odhad — taký byt mohol visieť už
 * predtým, len sme o ňom nevedeli. Filter ich preto púšťa ďalej: radšej
 * ukázať byt, ktorý možno visí dlhšie, než zamlčať ten, čo naozaj visí.
 */
export function markerDaysOnMarket(marker: ListingMarker): number | null {
  return daysOnMarket(marker.publishedOn, marker.seenOn)?.days ?? null;
}

/**
 * Cena a dispozícia sa v statickom režime filtrujú u klienta — nemá to kto
 * spraviť na serveri. Pri API prídu markery už prefiltrované.
 *
 * Pomer k okoliu je výnimka: je priamo v markeri, takže ho filtrujeme vždy,
 * bez ohľadu na režim.
 */
export function applyFilters(
  markers: ListingMarker[],
  state: MapState,
  clientSide: boolean,
): ListingMarker[] {
  let out = markers;

  if (state.maxPriceRatio != null) {
    const max = state.maxPriceRatio;
    // Byt bez indexu nevieme s okolím porovnať — a keď sa niekto pýta na
    // výhodné ceny, "nevieme" nie je odpoveď, ktorú chce vidieť na mape.
    out = out.filter((m) => m.priceRatio != null && m.priceRatio <= max);
  }

  if (state.minDaysOnMarket != null) {
    const min = state.minDaysOnMarket;
    out = out.filter((m) => (markerDaysOnMarket(m) ?? 0) >= min);
  }

  if (!clientSide) return out;

  return out.filter((m) => {
    if (state.priceMin != null && (m.price ?? 0) < state.priceMin) return false;
    if (state.priceMax != null && (m.price ?? Infinity) > state.priceMax) return false;
    if (state.rooms.length > 0) {
      const rooms = m.rooms;
      if (rooms == null) return false;
      // "5+ izb" posielame ako 5 a berieme aj väčšie
      const ok = state.rooms.some((r) => (r === 5 ? rooms >= 5 : rooms === r));
      if (!ok) return false;
    }
    return true;
  });
}

/**
 * Inzeráty, ktoré pribudli od poslednej návštevy. Pri prvej návšteve
 * (`since` je `null`) nie je nové nič — zvýrazniť všetko nič nepovie.
 */
export function onlyNewSince(markers: ListingMarker[], since: string | null): ListingMarker[] {
  if (since == null) return [];
  return markers.filter((m) => m.seenOn > since);
}
