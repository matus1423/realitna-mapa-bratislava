import type { ListingMarker } from '@rmb/shared';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useEffect, useMemo, useRef, useState } from 'react';
import Supercluster from 'supercluster';
import type { MapState } from '../state/useUrlState.js';
import { groupByCoordinate, type MarkerGroup } from './grouping.js';
import { createClusterIcon, createPriceIcon } from './icons.js';

interface Props {
  state: MapState;
  onViewChange: (view: { lat: number; lon: number; zoom: number }) => void;
  onSelect: (ids: string[]) => void;
  onCountChange: (count: number) => void;
  selectedIds: string[];
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

export function MapView({ state, onViewChange, onSelect, onCountChange, selectedIds }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
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
    mapRef.current = map;

    const sync = (): void => {
      const center = map.getCenter();
      onViewChange({ lat: center.lat, lon: center.lng, zoom: map.getZoom() });
      setView({ zoom: map.getZoom(), bounds: map.getBounds() });
    };

    map.on('moveend', sync);
    sync();

    return () => {
      map.off('moveend', sync);
      map.remove();
      mapRef.current = null;
    };
    // zámerne bez závislostí — mapa sa inicializuje raz a ďalej ju riadime imperatívne
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- načítanie markerov pri zmene výrezu alebo filtrov ---------------------
  useEffect(() => {
    if (!view.bounds) return;

    const controller = new AbortController();
    // debounce: počas ťahania mapy by inak odišiel request na každý medzikrok
    const timer = setTimeout(() => {
      const url = `/api/listings?${buildQuery(state, view.bounds!)}`;
      fetch(url, { signal: controller.signal })
        .then((r) => {
          if (!r.ok) throw new Error(`API vrátilo ${r.status}`);
          return r.json() as Promise<{ markers: ListingMarker[] }>;
        })
        .then((data) => {
          setMarkers(data.markers);
          onCountChange(data.markers.length);
        })
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
    onCountChange,
  ]);

  // --- clustering ------------------------------------------------------------
  const index = useMemo(() => {
    const groups = groupByCoordinate(markers);
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
  }, [markers]);

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
      const marker = L.marker([lat, lng], {
        icon: createPriceIcon(group, isSelected),
        zIndexOffset: isSelected ? 1000 : 0,
      });
      marker.on('click', () => onSelect(group.ids));
      layer.addLayer(marker);
    }
  }, [index, view, selectedIds, onSelect]);

  return <div ref={containerRef} className="map-container" />;
}
