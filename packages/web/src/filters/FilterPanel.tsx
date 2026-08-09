import type { DealType, PropertyType } from '@rmb/shared';
import type { MapState } from '../state/useUrlState.js';

interface Props {
  state: MapState;
  onChange: (patch: Partial<MapState>) => void;
  visibleCount: number;
}

const PROPERTY_OPTIONS: { value: PropertyType; label: string }[] = [
  { value: 'byt', label: 'Byty' },
  { value: 'dom', label: 'Domy' },
  { value: 'pozemok', label: 'Pozemky' },
  { value: 'komercne', label: 'Komerčné' },
];

const ROOM_OPTIONS = [
  { value: 1, label: '1 izb.' },
  { value: 2, label: '2 izb.' },
  { value: 3, label: '3 izb.' },
  { value: 4, label: '4 izb.' },
  { value: 5, label: '5+ izb.' },
];

function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

export function FilterPanel({ state, onChange, visibleCount }: Props) {
  return (
    <aside className="filter-panel">
      <div className="panel-section">
        <div className="segmented">
          {(['predaj', 'prenajom'] as DealType[]).map((deal) => (
            <button
              key={deal}
              className={state.dealType === deal ? 'is-active' : ''}
              onClick={() => onChange({ dealType: deal })}
            >
              {deal === 'predaj' ? 'Predaj' : 'Prenájom'}
            </button>
          ))}
        </div>
      </div>

      <div className="panel-section">
        <div className="chip-grid">
          {PROPERTY_OPTIONS.map((option) => (
            <button
              key={option.value}
              className={`chip${state.propertyTypes.includes(option.value) ? ' is-active' : ''}`}
              onClick={() => {
                const next = toggle(state.propertyTypes, option.value);
                // prázdny výber by znamenal prázdnu mapu — aspoň jeden typ nechávame
                if (next.length > 0) onChange({ propertyTypes: next });
              }}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div className="panel-section">
        <label className="panel-label">Dispozícia</label>
        <div className="chip-grid rooms">
          {ROOM_OPTIONS.map((option) => (
            <button
              key={option.value}
              className={`chip${state.rooms.includes(option.value) ? ' is-active' : ''}`}
              onClick={() => onChange({ rooms: toggle(state.rooms, option.value) })}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div className="panel-section">
        <label className="panel-label">Cena (€)</label>
        <div className="range-row">
          <input
            type="number"
            placeholder="od"
            value={state.priceMin ?? ''}
            onChange={(e) =>
              onChange({ priceMin: e.target.value === '' ? undefined : Number(e.target.value) })
            }
          />
          <input
            type="number"
            placeholder="do"
            value={state.priceMax ?? ''}
            onChange={(e) =>
              onChange({ priceMax: e.target.value === '' ? undefined : Number(e.target.value) })
            }
          />
        </div>
      </div>

      <div className="panel-footer">
        <span className="result-count">{visibleCount.toLocaleString('sk-SK')} vo výreze</span>
        <button
          className="reset"
          onClick={() =>
            onChange({
              dealType: 'predaj',
              propertyTypes: ['byt', 'dom'],
              rooms: [],
              priceMin: undefined,
              priceMax: undefined,
            })
          }
        >
          Reset
        </button>
      </div>
    </aside>
  );
}
