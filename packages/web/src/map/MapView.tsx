import type { ListingMarker } from '@rmb/shared';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useEffect, useMemo, useRef, useState } from 'react';
import Supercluster from 'supercluster';
import { isStatic, loadMarkers } from '../data.js';
import { applyFilters, onlyNewSince } from './filter.js';
import type { MapState } from '../state/useUrlState.js';
import { groupByCoordinate, type MarkerGroup } from './grouping.js';
import { createClusterIcon, createPriceIcon } from './icons.js';
import { isInside, type Point } from './polygon.js';

interface Props {
  state: MapState;
  onViewChange: (view: { lat: number; lon: number; zoom: number }) => void;
  onSelect: (ids: string[]) => void;
  onCountChange: (count: number) => void;
  onNewCountChange: (count: number) => void;
  selectedIds: string[];
  savedIds: Set<string>;
  onlySaved: boolean;
  onlyNew: boolean;
  /** Deň poslednej návštevy; `null` pri prvej. */
  lastVisit: string | null;
  drawing: boolean;
  onPolygonChange: (polygon: Point[]) => void;
}

type ClusterProps = { cluster: true; cluster_id: number; point_count: number };
type GroupProps = { cluster: false; group: MarkerGroup };

function buildQuery(state: MapState, bounds: L.LatLngBounds): string {
  const p = new URLSearchParams({
    bbox: [
      bounds.getWest(),
      bounds.getSouth(),
      bounds.getEast(),
      bounds.getNorth(),
    ].join(','),
    deal_type: state.dealType,
    property_type: state.propertyTypes.join(','),
    minimal: '1',
  });
  if (state.priceMin != null) p.set('price_min', String(state.priceMin));
  if (state.priceMax != null) p.set('price_max', String(state.priceMax));
  if (state.rooms.length) p.set('rooms', state.rooms.join(','));
  return p.toString();
}

export function MapView({
  state,
  onViewChange,
  onSelect,
  onCountChange,
  onNewCountChange,
  selectedIds,
  savedIds,
  onlySaved,
  onlyNew,
  lastVisit,
  drawing,
  onPolygonChange,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  const drawLayerRef = useRef<L.LayerGroup | null>(null);
  // rozkreslený tvar držíme v refe, nie v state — každý klik by inak
  // pretvoril celú mapu vrátane markerov
  const draftRef = useRef<Point[]>([]);
  const [markers, setMarkers] = useState<ListingMarker[]>([]);
  const [view, setView] = useState({ zoom: state.zoom, bounds: null as L.LatLngBounds | null });

  // --- inicializácia mapy (raz) ---------------------------------------------
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: [state.lat, state.lon],
      zoom: state.zoom,
      zoomControl: false,
      preferCanvas: false,
    });

    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; prispievatelia <a href="https://openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map);

    L.control.zoom({ position: 'topright' }).addTo(map);

    layerRef.current = L.layerGroup().addTo(map);
    drawLayerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;

    const sync = (): void => {
      const center = map.getCenter();
      onViewChange({ lat: center.lat, lon: center.lng, zoom: map.getZoom() });
      setView({ zoom: map.getZoom(), bounds: map.getBounds() });
    };

    map.on('moveend', sync);
    sync();

    // Ak sa mapa vytvorí skôr, než kontajner dostane rozmery (pomalé fonty,
    // skrytá záložka), Leaflet si zapamätá nulovú veľkosť a ostane z nej
    // malý štvorec v rohu. ResizeObserver ho na správnu veľkosť prepočíta.
    const resize = new ResizeObserver(() => map.invalidateSize());
    resize.observe(containerRef.current);

    return () => {
      resize.disconnect();
      map.off('moveend', sync);
      map.remove();
      mapRef.current = null;
    };
    // zámerne bez závislostí — mapa sa inicializuje raz a ďalej ju riadime imperatívne
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- načítanie markerov ----------------------------------------------------
  useEffect(() => {
    if (!view.bounds) return;

    const controller = new AbortController();

    // V statickom režime je celé mesto v jednom súbore: stiahne sa raz
    // a bbox ani filtre už sieť neriešia.
    if (isStatic) {
      loadMarkers(state.dealType, controller.signal)
        .then(setMarkers)
        .catch((err: unknown) => {
          if ((err as Error).name !== 'AbortError') console.error(err);
        });
      return () => controller.abort();
    }

    // debounce: počas ťahania mapy by inak odišiel request na každý medzikrok
    const timer = setTimeout(() => {
      const url = `/api/listings?${buildQuery(state, view.bounds!)}`;
      fetch(url, { signal: controller.signal })
        .then((r) => {
          if (!r.ok) throw new Error(`API vrátilo ${r.status}`);
          return r.json() as Promise<{ markers: ListingMarker[] }>;
        })
        .then((data) => setMarkers(data.markers))
        .catch((err: unknown) => {
          if ((err as Error).name !== 'AbortError') console.error(err);
        });
    }, 250);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [
    view.bounds,
    state.dealType,
    state.propertyTypes,
    state.priceMin,
    state.priceMax,
    state.rooms,
  ]);

  // Jedna sada filtrov pre počty aj pre vykreslenie. Kým to bolo opísané
  // dvakrát, hrozilo, že sa počet vo výreze rozíde s tým, čo je na mape.
  //
  // "Len uložené" ide na klientovi — ID uložených sú v prehliadači a posielať
  // ich na server by znamenalo tlačiť tam osobný zoznam. To isté platí pre
  // poslednú návštevu.
  const baseVisible = useMemo(() => {
    let out = applyFilters(markers, state, isStatic);
    if (onlySaved) out = out.filter((m) => savedIds.has(m.id));
    if (state.polygon.length >= 3) {
      out = out.filter((m) => isInside([m.lat, m.lng], state.polygon));
    }
    return out;
  }, [markers, onlySaved, savedIds, state]);

  const freshCount = useMemo(
    () => onlyNewSince(baseVisible, lastVisit).length,
    [baseVisible, lastVisit],
  );

  const visible = useMemo(
    () => (onlyNew ? onlyNewSince(baseVisible, lastVisit) : baseVisible),
    [baseVisible, onlyNew, lastVisit],
  );

  useEffect(() => {
    onCountChange(visible.length);
  }, [visible, onCountChange]);

  // Hlásime bez ohľadu na prepínač — inak by sa číslo v tlačidle po zapnutí
  // zmenilo samo na seba a prestalo dávať zmysel.
  useEffect(() => {
    onNewCountChange(freshCount);
  }, [freshCount, onNewCountChange]);

  // --- clustering ------------------------------------------------------------
  const index = useMemo(() => {
    const groups = groupByCoordinate(visible, lastVisit);
    const sc = new Supercluster<GroupProps, ClusterProps>({
      radius: 60,
      // nad zoom 15 už zhluky nechceme — tam sa majú ukazovať ceny
      maxZoom: 15,
      minPoints: 2,
    });
    sc.load(
      groups.map((group) => ({
        type: 'Feature' as const,
        properties: { cluster: false as const, group },
        geometry: { type: 'Point' as const, coordinates: [group.lng, group.lat] },
      })),
    );
    return sc;
  }, [visible, lastVisit]);

  // --- kreslenie oblasti ------------------------------------------------------
  useEffect(() => {
    const map = mapRef.current;
    const drawLayer = drawLayerRef.current;
    if (!map || !drawLayer) return;

    const redraw = (): void => {
      drawLayer.clearLayers();
      const draft = draftRef.current;

      if (draft.length > 0) {
        L.polyline(draft, { color: '#2563eb', weight: 2, dashArray: '5 4' }).addTo(drawLayer);
        for (const point of draft) {
          L.circleMarker(point, {
            radius: 4,
            color: '#2563eb',
            fillColor: '#fff',
            fillOpacity: 1,
          }).addTo(drawLayer);
        }
      }
    };

    if (!drawing) {
      draftRef.current = [];
      drawLayer.clearLayers();

      // hotová oblasť sa kreslí aj mimo režimu kreslenia, nech používateľ
      // vidí, čo vlastne filtruje
      if (state.polygon.length >= 3) {
        L.polygon(state.polygon, {
          color: '#2563eb',
          weight: 2,
          fillOpacity: 0.06,
        }).addTo(drawLayer);
      }
      return;
    }

    const onClick = (event: L.LeafletMouseEvent): void => {
      draftRef.current = [...draftRef.current, [event.latlng.lat, event.latlng.lng]];
      redraw();
    };

    // dvojklik oblasť uzavrie; Leaflet by inak ešte priblížil mapu
    const onDblClick = (event: L.LeafletMouseEvent): void => {
      L.DomEvent.stop(event);
      if (draftRef.current.length >= 3) onPolygonChange(draftRef.current);
      draftRef.current = [];
    };

    // Escape zahodí rozkreslený tvar — bez neho by sa používateľ z režimu
    // kreslenia dostal len tak, že niečo dokreslí
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return;
      draftRef.current = [];
      onPolygonChange([]);
    };

    map.doubleClickZoom.disable();
    map.on('click', onClick);
    map.on('dblclick', onDblClick);
    window.addEventListener('keydown', onKey);
    redraw();

    return () => {
      map.off('click', onClick);
      map.off('dblclick', onDblClick);
      window.removeEventListener('keydown', onKey);
      map.doubleClickZoom.enable();
    };
  }, [drawing, state.polygon, onPolygonChange]);

  // --- vykreslenie -----------------------------------------------------------
  useEffect(() => {
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!map || !layer || !view.bounds) return;

    layer.clearLayers();

    const bbox: [number, number, number, number] = [
      view.bounds.getWest(),
      view.bounds.getSouth(),
      view.bounds.getEast(),
      view.bounds.getNorth(),
    ];

    for (const feature of index.getClusters(bbox, Math.round(view.zoom))) {
      const [lng, lat] = feature.geometry.coordinates as [number, number];
      const props = feature.properties;

      if ('cluster' in props && props.cluster) {
        const marker = L.marker([lat, lng], {
          icon: createClusterIcon(props.point_count),
        });
        marker.on('click', () => {
          const target = Math.min(index.getClusterExpansionZoom(props.cluster_id), 18);
          map.setView([lat, lng], target, { animate: true });
        });
        layer.addLayer(marker);
        continue;
      }

      const group = (props as GroupProps).group;
      const isSelected = group.ids.some((id) => selectedIds.includes(id));
      const isSaved = group.ids.some((id) => savedIds.has(id));
      const marker = L.marker([lat, lng], {
        icon: createPriceIcon(group, isSelected, isSaved),
        zIndexOffset: isSelected ? 1000 : 0,
      });
      marker.on('click', () => onSelect(group.ids));
      layer.addLayer(marker);
    }
  }, [index, view, selectedIds, savedIds, onSelect]);

  return <div ref={containerRef} className={`map-container${drawing ? ' is-drawing' : ''}`} />;
}
