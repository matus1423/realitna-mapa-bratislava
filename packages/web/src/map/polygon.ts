export type Point = [lat: number, lng: number];

/**
 * Leží bod vnútri mnohouholníka? Ray casting: vedieme z bodu polpriamku
 * a rátame, koľkokrát pretne hranu. Nepárny počet znamená vnútri.
 *
 * Pri veľkosti mesta sa dá počítať priamo v stupňoch — skreslenie projekcie
 * je na takej ploche zanedbateľné a používateľ kreslí to, čo vidí na mape.
 */
export function isInside(point: Point, polygon: Point[]): boolean {
  if (polygon.length < 3) return true;

  const [lat, lng] = point;
  let inside = false;

  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [latI, lngI] = polygon[i]!;
    const [latJ, lngJ] = polygon[j]!;

    const straddles = latI > lat !== latJ > lat;
    if (!straddles) continue;

    const crossingLng = ((lngJ - lngI) * (lat - latI)) / (latJ - latI) + lngI;
    if (lng < crossingLng) inside = !inside;
  }

  return inside;
}

/**
 * Do URL ide mnohouholník na päť desatinných miest, čo je presnosť ~1 m.
 * Viac by len predlžovalo odkaz bez toho, aby to bolo na mape vidieť.
 */
export function encodePolygon(polygon: Point[]): string {
  return polygon.map(([lat, lng]) => `${lat.toFixed(5)},${lng.toFixed(5)}`).join(';');
}

export function decodePolygon(raw: string | null): Point[] {
  if (!raw) return [];

  const points: Point[] = [];
  for (const pair of raw.split(';')) {
    const [lat, lng] = pair.split(',').map(Number);
    if (Number.isFinite(lat) && Number.isFinite(lng)) points.push([lat!, lng!]);
  }

  // menej než tri body nie je plocha, len čiara — taký filter nemá zmysel
  return points.length >= 3 ? points : [];
}
