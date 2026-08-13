/**
 * Priestorová mriežka nad Bratislavou. Používa ju index cien aj odhad nájmu —
 * obe potrebujú to isté: „daj mi hodnoty z okolia tohto bodu".
 *
 * 0,005° zemepisnej šírky je ~555 m; na 48° severnej šírky je poludník kratší,
 * preto je krok pre dĺžku väčší, aby bunka vyšla zhruba štvorcová.
 */
export const CELL_LAT = 0.005;
export const CELL_LNG = 0.0075;

/** Koľko vzoriek musí byť v okolí, aby mal medián zmysel. */
export const MIN_SAMPLE = 8;

export function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
}

/**
 * Hodnoty rozhádzané do buniek, aby sa okolie hľadalo v deviatich bunkách
 * namiesto porovnávania každého bodu s každým.
 */
export class Grid {
  private readonly cells = new Map<string, number[]>();

  add(lat: number, lng: number, value: number): void {
    const key = Grid.key(lat, lng);
    const bucket = this.cells.get(key);
    if (bucket) bucket.push(value);
    else this.cells.set(key, [value]);
  }

  /** Hodnoty z okolia; `ring` 1 = 3×3 bunky, 2 = 5×5. */
  around(lat: number, lng: number, ring: number): number[] {
    const baseLat = Math.floor(lat / CELL_LAT);
    const baseLng = Math.floor(lng / CELL_LNG);
    const out: number[] = [];

    for (let dLat = -ring; dLat <= ring; dLat++) {
      for (let dLng = -ring; dLng <= ring; dLng++) {
        const bucket = this.cells.get(`${baseLat + dLat}:${baseLng + dLng}`);
        if (bucket) out.push(...bucket);
      }
    }

    return out;
  }

  /**
   * Medián z okolia. V riedkych častiach mesta rozšíri okruh — radšej hrubší
   * odhad než žiadny; ak ani 5×5 nestačí, vráti null.
   */
  medianAround(lat: number, lng: number): number | null {
    let sample = this.around(lat, lng, 1);
    if (sample.length < MIN_SAMPLE) sample = this.around(lat, lng, 2);
    return sample.length < MIN_SAMPLE ? null : median(sample);
  }

  private static key(lat: number, lng: number): string {
    return `${Math.floor(lat / CELL_LAT)}:${Math.floor(lng / CELL_LNG)}`;
  }
}
