import { useEffect, useState } from 'react';
import {
  daysLabel,
  daysOnMarket,
  formatArea,
  fullPrice,
  priceRatioLabel,
  roomsLabel,
  yieldLabel,
  yieldTone,
} from '../format.js';
import { loadDetails, type ListingDetail } from '../data.js';
import { PriceHistory } from './PriceHistory.js';

const SOURCE_LABELS: Record<string, string> = {
  nehnutelnosti: 'nehnutelnosti.sk',
  reality: 'reality.sk',
  topreality: 'topreality.sk',
  zoznamrealit: 'zoznamrealit.sk',
  bazos: 'bazos.sk',
};

const sourceLabel = (source: string): string => SOURCE_LABELS[source] ?? source;

interface Props {
  ids: string[];
  onClose: () => void;
  isSaved: (id: string) => boolean;
  onToggleSave: (id: string) => void;
}

/**
 * Karta inzerátu. Detaily sa doťahujú až po kliknutí na marker — v odpovedi
 * pre mapu popisy ani fotky nie sú, a ani tam nemajú čo robiť.
 */
export function ListingPopup({ ids, onClose, isSaved, onToggleSave }: Props) {
  const [listings, setListings] = useState<ListingDetail[] | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [photoIndex, setPhotoIndex] = useState(0);

  useEffect(() => {
    setListings(null);
    setActiveIndex(0);
    setPhotoIndex(0);

    const controller = new AbortController();
    loadDetails(ids, controller.signal)
      // od najlacnejšieho — na pilulke je cena najlacnejšieho z adresy,
      // takže prvá záložka musí ukázať práve ten inzerát
      .then((found) =>
        setListings([...found].sort((a, b) => (a.price ?? Infinity) - (b.price ?? Infinity))),
      )
      .catch((err: unknown) => {
        if ((err as Error).name !== 'AbortError') console.error(err);
      });

    return () => controller.abort();
  }, [ids]);

  if (!listings) {
    return (
      <aside className="listing-card">
        <button className="card-close" onClick={onClose} aria-label="Zavrieť">×</button>
        <div className="card-loading">Načítavam…</div>
      </aside>
    );
  }

  const listing = listings[activeIndex];
  if (!listing) return null;

  const photos = listing.imageUrls;
  const ratio = priceRatioLabel(listing.priceRatio);
  const onMarket = daysOnMarket(listing.publishedAt, listing.firstSeenAt);
  const saved = isSaved(listing.id);

  return (
    <aside className="listing-card">
      <button className="card-close" onClick={onClose} aria-label="Zavrieť">×</button>

      {listings.length > 1 && (
        <div className="card-tabs">
          {listings.map((item, i) => (
            <button
              key={item.id}
              className={i === activeIndex ? 'is-active' : ''}
              onClick={() => {
                setActiveIndex(i);
                setPhotoIndex(0);
              }}
            >
              {i + 1}
            </button>
          ))}
          <span className="card-tabs-label">{listings.length} inzerátov na tejto adrese</span>
        </div>
      )}

      <div className="card-photo">
        {photos.length > 0 ? (
          <>
            <img src={photos[photoIndex]} alt={listing.title} loading="lazy" />
            {photos.length > 1 && (
              <>
                <button
                  className="photo-nav prev"
                  onClick={() => setPhotoIndex((i) => (i - 1 + photos.length) % photos.length)}
                  aria-label="Predchádzajúca fotka"
                >
                  ‹
                </button>
                <button
                  className="photo-nav next"
                  onClick={() => setPhotoIndex((i) => (i + 1) % photos.length)}
                  aria-label="Ďalšia fotka"
                >
                  ›
                </button>
                <span className="photo-counter">
                  {photoIndex + 1} / {photos.length}
                </span>
              </>
            )}
          </>
        ) : (
          <div className="card-photo-empty">Bez fotografie</div>
        )}
      </div>

      <div className="card-body">
        <div className="card-price-row">
          <div className="card-price">{fullPrice(listing.price)}</div>
          <button
            className={`card-save${saved ? ' is-saved' : ''}`}
            onClick={() => onToggleSave(listing.id)}
            aria-pressed={saved}
            title={saved ? 'Odobrať z uložených' : 'Uložiť inzerát'}
          >
            {saved ? '★' : '☆'}
          </button>
        </div>
        <div className="card-meta">
          {[roomsLabel(listing.rooms, listing.propertyType), formatArea(listing.areaM2)]
            .filter(Boolean)
            .join(' · ')}
        </div>
        <div className="card-address">{listing.address ?? '—'}</div>

        {listing.pricePerM2 != null && (
          <div className="card-sub">
            {Math.round(listing.pricePerM2).toLocaleString('sk-SK')} €/m²
            {listing.areaPricePerM2 != null && (
              <span className="card-sub-dim">
                {' '}· okolie {listing.areaPricePerM2.toLocaleString('sk-SK')} €/m²
              </span>
            )}
          </div>
        )}

        {ratio && <div className={`card-ratio tone-${ratio.tone}`}>{ratio.text}</div>}

        {onMarket && (
          <div className="card-sub">
            V ponuke {daysLabel(onMarket.days)}
            {!onMarket.exact && (
              <span className="card-sub-dim"> — aspoň, odkedy o ňom vieme</span>
            )}
          </div>
        )}

        {listing.grossYield != null && listing.estimatedRent != null && (
          <div className="card-yield">
            <div className="cy-row">
              <span>Odhadovaný nájom</span>
              <strong>{listing.estimatedRent.toLocaleString('sk-SK')} € / mes.</strong>
            </div>
            <div className="cy-row">
              <span>Hrubý výnos</span>
              <strong className={`tone-${yieldTone(listing.grossYield)}`}>
                {yieldLabel(listing.grossYield)}
              </strong>
            </div>
            <p className="cy-note">
              Nájom je odhad z prenájmov v okolí prepočítaný na plochu bytu. Výnos je hrubý —
              nezahŕňa daň, správu, opravy ani neobsadenosť.
            </p>
          </div>
        )}

        <PriceHistory points={listing.priceHistory} />

        {listing.locationRadius != null && listing.locationRadius >= 1000 && (
          <div className="card-warning">
            Poloha je len približná — {sourceLabel(listing.source)} uvádza iba PSČ, nie adresu.
          </div>
        )}

        <a className="card-link" href={listing.sourceUrl} target="_blank" rel="noreferrer noopener">
          Zobraziť na {sourceLabel(listing.source)} →
        </a>

        {listing.alsoOn && listing.alsoOn.length > 0 && (
          <div className="card-sources">
            Ten istý byt inzerujú aj:{' '}
            {listing.alsoOn.map((other, i) => (
              <span key={other.sourceUrl}>
                {i > 0 && ', '}
                <a href={other.sourceUrl} target="_blank" rel="noreferrer noopener">
                  {sourceLabel(other.source)}
                  {/* duplicita v rámci jedného portálu je bežná — ten istý byt
                      tam visí od dvoch kancelárií, treba to odlíšiť od prekryvu portálov */}
                  {other.source === listing.source ? ' (druhý inzerát)' : ''}
                </a>
              </span>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}
