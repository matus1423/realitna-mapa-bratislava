/** 481 000 → "€481K", 1 250 000 → "€1,25M" — ako na referenčnej mape. */
export function compactPrice(price: number | null): string {
  if (price == null) return '—';
  if (price >= 1_000_000) {
    const millions = price / 1_000_000;
    return `€${millions.toFixed(millions < 10 ? 2 : 1).replace('.', ',').replace(/,?0+$/, '')}M`;
  }
  if (price >= 1000) {
    const thousands = price / 1000;
    return `€${thousands >= 100 ? Math.round(thousands) : thousands.toFixed(1).replace('.', ',').replace(/,0$/, '')}K`;
  }
  return `€${price}`;
}

export function fullPrice(price: number | null): string {
  if (price == null) return 'Cena dohodou';
  return `${price.toLocaleString('sk-SK')} €`;
}

export function formatArea(area: number | null): string {
  if (area == null) return '';
  return `${area.toLocaleString('sk-SK')} m²`;
}

/** Rozdiel ceny do zeleného štítku: -20 100 → "-€20,1K". */
export function priceDiffLabel(diff: number | null): string | null {
  if (diff == null || diff === 0) return null;
  const sign = diff < 0 ? '-' : '+';
  return `${sign}${compactPrice(Math.abs(diff))}`;
}

export function roomsLabel(rooms: number | null, propertyType: string): string {
  if (propertyType === 'dom') return 'Dom';
  if (propertyType === 'pozemok') return 'Pozemok';
  if (rooms == null) return 'Byt';
  if (rooms === 1) return '1 izbový byt';
  return `${rooms} izbový byt`;
}
