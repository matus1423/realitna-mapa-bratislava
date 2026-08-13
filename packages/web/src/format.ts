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

/**
 * Pomer ceny k okoliu ako veta. 0,85 → "o 15 % lacnejší než okolie".
 * Rozdiely pod 5 % nekomentujeme — pri mediáne z pár desiatok bytov
 * by to bolo predstieranie presnosti.
 */
export function priceRatioLabel(ratio: number | null): { text: string; tone: 'good' | 'bad' | 'neutral' } | null {
  if (ratio == null) return null;
  const pct = Math.round(Math.abs(1 - ratio) * 100);
  if (pct < 5) return { text: 'zhruba na úrovni okolia', tone: 'neutral' };
  return ratio < 1
    ? { text: `o ${pct} % lacnejší než okolie`, tone: 'good' }
    : { text: `o ${pct} % drahší než okolie`, tone: 'bad' };
}

/**
 * Ako dlho je byt v ponuke. Uprednostňujeme dátum zverejnenia z portálu;
 * ten má ale len nehnutelnosti.sk. Pri ostatných počítame od prvého videnia,
 * čo je spočiatku dnešok — preto sa taká hodnota označuje ako približná.
 * Postupnými crawlmi sa to samo spresní: čo pribudne neskôr, už bude mať
 * poctivý dátum prvého výskytu.
 */
export function daysOnMarket(
  publishedAt: string | null,
  firstSeenAt: string,
): { days: number; exact: boolean } | null {
  const source = publishedAt ?? firstSeenAt;
  const days = Math.floor((Date.now() - Date.parse(source)) / 86_400_000);
  if (!Number.isFinite(days) || days < 0) return null;
  return { days, exact: publishedAt != null };
}

export function daysLabel(days: number): string {
  if (days === 0) return 'dnes';
  if (days === 1) return 'včera';
  if (days < 5) return `${days} dni`;
  if (days < 31) return `${days} dní`;
  const months = Math.round(days / 30);
  return months === 1 ? 'mesiac' : months < 5 ? `${months} mesiace` : `${months} mesiacov`;
}

/** 0,042 → "4,2 %". */
export function yieldLabel(grossYield: number): string {
  return `${(grossYield * 100).toFixed(1).replace('.', ',')} %`;
}

/**
 * Farebné pásmo výnosu. Bratislavský priemer sa dlhodobo drží okolo 4 %,
 * takže hranice sú postavené naň — nie na nejakú obecnú "dobrú" mieru.
 */
export function yieldTone(grossYield: number): 'good' | 'bad' | 'neutral' {
  if (grossYield >= 0.05) return 'good';
  if (grossYield < 0.035) return 'bad';
  return 'neutral';
}
