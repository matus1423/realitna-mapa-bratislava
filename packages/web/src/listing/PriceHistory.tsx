import { useEffect, useState } from 'react';
import { fullPrice } from '../format.js';

interface Point {
  price: number;
  seenAt: string;
}

/**
 * Cenová história bytu. Kreslí sa ako malý inline SVG, bez grafovej knižnice —
 * je to lomená čiara z pár bodov a závislosť za 50 kB by sa nevyplatila.
 *
 * Zobrazí sa len pri dvoch a viac záznamoch. Pri jednom by to bola vodorovná
 * čiara, ktorá predstiera informáciu — vieme len to, že sme cenu raz videli.
 */
export function PriceHistory({ listingId }: { listingId: string }) {
  const [points, setPoints] = useState<Point[] | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/listings/${encodeURIComponent(listingId)}/price-history`, {
      signal: controller.signal,
    })
      .then((r) => r.json() as Promise<{ history: Point[] }>)
      .then((data) => setPoints(data.history))
      .catch((err: unknown) => {
        if ((err as Error).name !== 'AbortError') console.error(err);
      });

    return () => controller.abort();
  }, [listingId]);

  if (!points || points.length < 2) return null;

  const prices = points.map((p) => p.price);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const span = max - min || 1;

  const W = 260;
  const H = 44;
  const coords = points.map((point, i) => {
    const x = (i / (points.length - 1)) * (W - 4) + 2;
    const y = H - 4 - ((point.price - min) / span) * (H - 12);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  const first = prices[0]!;
  const last = prices[prices.length - 1]!;
  const change = last - first;
  const tone = change < 0 ? 'good' : change > 0 ? 'bad' : 'neutral';

  return (
    <div className="price-history">
      <div className="ph-head">
        Cenová história
        {change !== 0 && (
          <span className={`ph-change tone-${tone}`}>
            {change < 0 ? '−' : '+'}
            {fullPrice(Math.abs(change))}
          </span>
        )}
      </div>

      <svg className={`ph-chart tone-${tone}`} viewBox={`0 0 ${W} ${H}`} role="img"
        aria-label={`Cena sa zmenila z ${fullPrice(first)} na ${fullPrice(last)}`}>
        <polyline points={coords.join(' ')} fill="none" strokeWidth="2" />
        {coords.map((c, i) => {
          const [x, y] = c.split(',');
          return <circle key={points[i]!.seenAt} cx={x} cy={y} r="2.5" />;
        })}
      </svg>

      <div className="ph-foot">
        <span>{fullPrice(first)}</span>
        <span>{fullPrice(last)}</span>
      </div>
    </div>
  );
}
