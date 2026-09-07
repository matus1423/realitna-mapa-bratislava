import type { ListingMarker } from '@rmb/shared';
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
