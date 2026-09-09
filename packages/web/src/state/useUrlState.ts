import { useCallback, useEffect, useState } from 'react';
import type { DealType, PropertyType } from '@rmb/shared';
import { decodePolygon, encodePolygon, type Point } from '../map/polygon.js';

/**
 * Sťahujeme výhradne byty na predaj, takže druh nehnuteľnosti ani typ
 * transakcie nie sú voľba používateľa — sú konštanty celej aplikácie.
 */
export interface MapState {
  lat: number;
  lon: number;
  zoom: number;
  dealType: DealType;
  propertyTypes: PropertyType[];
  priceMin?: number;
  priceMax?: number;
  rooms: number[];
  /** Horná hranica pomeru ceny k okoliu; 0,9 = aspoň o 10 % lacnejšie. */
  maxPriceRatio?: number;
  /** Minimálny počet dní v ponuke. */
  minDaysOnMarket?: number;
  /** Vyznačená oblasť; prázdne pole = bez obmedzenia. */
  polygon: Point[];
}

const DEFAULTS: MapState = {
  lat: 48.1486,
  lon: 17.1077,
  zoom: 13,
  dealType: 'predaj',
  propertyTypes: ['byt'],
  rooms: [],
  polygon: [],
};

function readUrl(): MapState {
  const p = new URLSearchParams(window.location.search);
  const num = (key: string, fallback?: number): number | undefined => {
    const raw = p.get(key);
    if (raw == null) return fallback;
    const n = Number(raw);
    return Number.isFinite(n) ? n : fallback;
  };

  const dealType = p.get('deal_type');
  const propertyTypes = p.get('property_type')?.split(',').filter(Boolean) as
    | PropertyType[]
    | undefined;

  return {
    lat: num('lat', DEFAULTS.lat)!,
    lon: num('lon', DEFAULTS.lon)!,
    zoom: num('zoom', DEFAULTS.zoom)!,
    dealType: dealType === 'prenajom' ? 'prenajom' : 'predaj',
    propertyTypes: propertyTypes?.length ? propertyTypes : DEFAULTS.propertyTypes,
    priceMin: num('price_min'),
    priceMax: num('price_max'),
    maxPriceRatio: num('max_ratio'),
    minDaysOnMarket: num('min_days'),
    polygon: decodePolygon(p.get('poly')),
    rooms:
      p
        .get('rooms')
        ?.split(',')
        .map(Number)
        .filter((n) => Number.isFinite(n)) ?? [],
  };
}

function writeUrl(state: MapState): void {
  const p = new URLSearchParams();
  p.set('deal_type', state.dealType);
  p.set('property_type', state.propertyTypes.join(','));
  p.set('lat', state.lat.toFixed(6));
  p.set('lon', state.lon.toFixed(6));
  p.set('zoom', String(Math.round(state.zoom)));
  if (state.priceMin != null) p.set('price_min', String(state.priceMin));
  if (state.priceMax != null) p.set('price_max', String(state.priceMax));
  if (state.maxPriceRatio != null) p.set('max_ratio', String(state.maxPriceRatio));
  if (state.minDaysOnMarket != null) p.set('min_days', String(state.minDaysOnMarket));
  if (state.rooms.length) p.set('rooms', state.rooms.join(','));
  if (state.polygon.length >= 3) p.set('poly', encodePolygon(state.polygon));

  // replaceState, nie pushState — inak by každý posun mapy zaplnil históriu
  window.history.replaceState(null, '', `?${p.toString()}`);
}

/**
 * URL je jediný zdroj pravdy o stave mapy — rovnako ako na realitymap.sk.
 * Vďaka tomu je každý výrez aj sada filtrov zdieľateľná odkazom.
 */
export function useUrlState(): [MapState, (patch: Partial<MapState>) => void] {
  const [state, setState] = useState<MapState>(readUrl);

  useEffect(() => {
    writeUrl(state);
  }, [state]);

  useEffect(() => {
    const onPop = (): void => setState(readUrl());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const update = useCallback((patch: Partial<MapState>) => {
    setState((prev) => ({ ...prev, ...patch }));
  }, []);

  return [state, update];
}
