import type { Listing } from '@rmb/shared';
import { useEffect, useState } from 'react';
import { formatArea, fullPrice, roomsLabel } from '../format.js';

interface Props {
  ids: string[];
  onClose: () => void;
}

/**
 * Karta inzerátu. Detaily sa doťahujú až po kliknutí na marker — v odpovedi
 * pre mapu popisy ani fotky nie sú, a ani tam nemajú čo robiť.
 */
export function ListingPopup({ ids, onClose }: Props) {
  const [listings, setListings] = useState<Listing[] | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [photoIndex, setPhotoIndex] = useState(0);

  useEffect(() => {
    setListings(null);
    setActiveIndex(0);
    setPhotoIndex(0);

    const controller = new AbortController();
    fetch(`/api/listings/by-id?ids=${ids.join(',')}`, { signal: controller.signal })
      .then((r) => r.json() as Promise<{ listings: Listing[] }>)
      // od najlacnejšieho — na pilulke je cena najlacnejšieho z adresy,
      // takže prvá záložka musí ukázať práve ten inzerát
      .then((data) =>
        setListings(
          [...data.listings].sort((a, b) => (a.price ?? Infinity) - (b.price ?? Infinity)),
        ),
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
        <div className="card-price">{fullPrice(listing.price)}</div>
        <div className="card-meta">
          {[roomsLabel(listing.rooms, listing.propertyType), formatArea(listing.areaM2)]
            .filter(Boolean)
            .join(' · ')}
        </div>
        <div className="card-address">{listing.address ?? '—'}</div>

        {listing.pricePerM2 != null && (
          <div className="card-sub">{Math.round(listing.pricePerM2).toLocaleString('sk-SK')} €/m²</div>
        )}

        <a className="card-link" href={listing.sourceUrl} target="_blank" rel="noreferrer noopener">
          Zobraziť na nehnutelnosti.sk →
        </a>
      </div>
    </aside>
  );
}
