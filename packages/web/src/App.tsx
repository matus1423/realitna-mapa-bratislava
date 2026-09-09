import { useCallback, useState } from 'react';
import { FilterPanel } from './filters/FilterPanel.js';
import { ListingPopup } from './listing/ListingPopup.js';
import { MapView } from './map/MapView.js';
import type { Point } from './map/polygon.js';
import { useLastVisit } from './state/useLastVisit.js';
import { useSaved } from './state/useSaved.js';
import { useUrlState } from './state/useUrlState.js';

export function App() {
  const [state, update] = useUrlState();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [visibleCount, setVisibleCount] = useState(0);
  const { saved, isSaved, toggle } = useSaved();
  const [onlySaved, setOnlySaved] = useState(false);
  const lastVisit = useLastVisit();
  const [onlyNew, setOnlyNew] = useState(false);
  const [newCount, setNewCount] = useState(0);
  const [drawing, setDrawing] = useState(false);

  const handlePolygonChange = useCallback(
    (polygon: Point[]) => {
      update({ polygon });
      setDrawing(false);
    },
    [update],
  );

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
        <FilterPanel
          state={state}
          onChange={update}
          visibleCount={visibleCount}
          savedCount={saved.size}
          onlySaved={onlySaved}
          onOnlySavedChange={setOnlySaved}
          newCount={newCount}
          onlyNew={onlyNew}
          onOnlyNewChange={setOnlyNew}
          hasPolygon={state.polygon.length >= 3}
        />

        <main className="map-area">
          <MapView
            state={state}
            onViewChange={handleViewChange}
            onSelect={setSelectedIds}
            onCountChange={setVisibleCount}
            onNewCountChange={setNewCount}
            selectedIds={selectedIds}
            savedIds={saved}
            onlySaved={onlySaved}
            onlyNew={onlyNew}
            lastVisit={lastVisit}
            drawing={drawing}
            onPolygonChange={handlePolygonChange}
          />

          <div className="map-tools">
            {state.polygon.length >= 3 && !drawing ? (
              <button className="map-tool" onClick={() => update({ polygon: [] })}>
                ✕ Zrušiť oblasť
              </button>
            ) : (
              <button
                className={`map-tool${drawing ? ' is-active' : ''}`}
                onClick={() => setDrawing(!drawing)}
              >
                {drawing ? 'Dvojklikom uzavrieť' : '✎ Vyznačiť oblasť'}
              </button>
            )}
          </div>
          {selectedIds.length > 0 && (
            <ListingPopup
              ids={selectedIds}
              onClose={() => setSelectedIds([])}
              isSaved={isSaved}
              onToggleSave={toggle}
            />
          )}
        </main>
      </div>
    </div>
  );
}
