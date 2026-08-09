import { useCallback, useState } from 'react';
import { FilterPanel } from './filters/FilterPanel.js';
import { ListingPopup } from './listing/ListingPopup.js';
import { MapView } from './map/MapView.js';
import { useUrlState } from './state/useUrlState.js';

export function App() {
  const [state, update] = useUrlState();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [visibleCount, setVisibleCount] = useState(0);

  const handleViewChange = useCallback(
    (view: { lat: number; lon: number; zoom: number }) => update(view),
    [update],
  );

  return (
    <div className="app">
      <header className="topbar">
        <span className="logo">realitná mapa</span>
        <span className="topbar-sub">Bratislava a okolie</span>
      </header>

      <div className="layout">
        <FilterPanel state={state} onChange={update} visibleCount={visibleCount} />

        <main className="map-area">
          <MapView
            state={state}
            onViewChange={handleViewChange}
            onSelect={setSelectedIds}
            onCountChange={setVisibleCount}
            selectedIds={selectedIds}
          />
          {selectedIds.length > 0 && (
            <ListingPopup ids={selectedIds} onClose={() => setSelectedIds([])} />
          )}
        </main>
      </div>
    </div>
  );
}
