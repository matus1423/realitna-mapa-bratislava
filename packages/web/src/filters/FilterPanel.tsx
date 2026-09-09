import type { DealType } from '@rmb/shared';
import { DAYS_OPTIONS, RATIO_OPTIONS } from '../map/filter.js';
import type { MapState } from '../state/useUrlState.js';

interface Props {
  state: MapState;
  onChange: (patch: Partial<MapState>) => void;
  visibleCount: number;
  savedCount: number;
  onlySaved: boolean;
  onOnlySavedChange: (value: boolean) => void;
  newCount: number;
  onlyNew: boolean;
  onOnlyNewChange: (value: boolean) => void;
  hasPolygon: boolean;
}

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

export function FilterPanel({
  state,
  onChange,
  visibleCount,
  savedCount,
  onlySaved,
  onOnlySavedChange,
  newCount,
  onlyNew,
  onOnlyNewChange,
  hasPolygon,
}: Props) {
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

      <div className="panel-section">
        <label className="panel-label">Cena vzhľadom na okolie</label>
        <div className="chip-grid ratios">
          {RATIO_OPTIONS.map((option) => (
            <button
              key={option.value}
              className={`chip${state.maxPriceRatio === option.value ? ' is-active' : ''}`}
              // druhý klik na tú istú voľbu filter zruší — inak by sa nedal
              // vypnúť inak než Resetom, ktorý zmaže aj všetko ostatné
              onClick={() =>
                onChange({
                  maxPriceRatio: state.maxPriceRatio === option.value ? undefined : option.value,
                })
              }
            >
              {option.label}
            </button>
          ))}
        </div>
        {state.maxPriceRatio != null && (
          <p className="panel-note">
            Porovnáva €/m² s mediánom okolia. Nižšia cena môže znamenať aj horší
            stav alebo prízemie — nie je to samo o sebe dobrý obchod.
          </p>
        )}
      </div>

      <div className="panel-section">
        <label className="panel-label">V ponuke</label>
        <div className="chip-grid ratios">
          {DAYS_OPTIONS.map((option) => (
            <button
              key={option.value}
              className={`chip${state.minDaysOnMarket === option.value ? ' is-active' : ''}`}
              onClick={() =>
                onChange({
                  minDaysOnMarket:
                    state.minDaysOnMarket === option.value ? undefined : option.value,
                })
              }
            >
              {option.label}
            </button>
          ))}
        </div>
        {state.minDaysOnMarket != null && (
          <p className="panel-note">
            Čím dlhšie byt visí, tým väčší býva priestor na vyjednávanie. Pri inzerátoch
            bez dátumu z portálu počítame od prvého videnia, takže to je spodný odhad.
          </p>
        )}
      </div>

      {newCount > 0 && (
        <div className="panel-section">
          <button
            className={`chip saved-toggle${onlyNew ? ' is-active' : ''}`}
            onClick={() => onOnlyNewChange(!onlyNew)}
          >
            Len nové od minule ({newCount})
          </button>
        </div>
      )}

      {savedCount > 0 && (
        <div className="panel-section">
          <button
            className={`chip saved-toggle${onlySaved ? ' is-active' : ''}`}
            onClick={() => onOnlySavedChange(!onlySaved)}
          >
            ★ Len uložené ({savedCount})
          </button>
        </div>
      )}

      <div className="panel-footer">
        <span className="result-count">
          {visibleCount.toLocaleString('sk-SK')} {hasPolygon ? 'v oblasti' : 'vo výreze'}
        </span>
        <button
          className="reset"
          onClick={() =>
            onChange({
              dealType: 'predaj',
              rooms: [],
              polygon: [],
              priceMin: undefined,
              priceMax: undefined,
              maxPriceRatio: undefined,
              minDaysOnMarket: undefined,
            })
          }
        >
          Reset
        </button>
      </div>
    </aside>
  );
}
