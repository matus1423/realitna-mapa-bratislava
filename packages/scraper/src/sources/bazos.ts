import type { Listing } from '@rmb/shared';
import { isInBratislavaArea, parseNumber, pricePerM2 } from '@rmb/shared';
import { decodeEntities, labelValue, textLines } from './html.js';
import type { ListPageResult, Source } from './source.js';

const ORIGIN = 'https://reality.bazos.sk';
const PER_PAGE = 20;

/**
 * Bazoš nemá vlastnú bratislavskú vetvu, ktorú by sme smeli použiť: filter
 * lokality ide cez `?hlokalita=`, čo ich robots.txt zakazuje. Zoznam je preto
 * celoslovenský a Bratislavu si vyberáme z textu pri každom inzeráte — vďaka
 * tomu sťahujeme detail len tým, ktoré nás naozaj zaujímajú.
 */
export const bazosSource: Source = {
  name: 'bazos',
  categories: ['byty na predaj'],

  listUrl(_categoryIndex: number, page: number): string {
    const base = `${ORIGIN}/predam/byt/`;
    return page === 1 ? base : `${base}${(page - 1) * PER_PAGE}/`;
  },

  parseListPage(html: string): ListPageResult {
    const urls: string[] = [];
    // rozsekáme stránku na bloky jednotlivých inzerátov a filtrujeme podľa textu
    const chunks = html.split(/(?=\/inzerat\/\d+\/)/);

    for (const chunk of chunks) {
      const match = /^\/inzerat\/(\d+)\/([a-z0-9-]+)\.php/.exec(chunk);
      if (!match) continue;
      const text = decodeEntities(chunk.slice(0, 1500).replace(/<[^>]+>/g, ' '));
      if (!/Bratislav/i.test(text)) continue;
      urls.push(`${ORIGIN}/inzerat/${match[1]}/${match[2]}.php`);
    }

    return { detailUrls: [...new Set(urls)], totalCount: null };
  },

  parseDetail(html: string, url: string): Listing | null {
    const idMatch = /\/inzerat\/(\d+)\//.exec(url);
    if (!idMatch?.[1]) return null;
    const id = idMatch[1];

    // jediná poloha, ktorú Bazoš dáva, je odkaz na Google Maps — a je to
    // ťažisko PSČ, nie adresa inzerátu
    const coordsMatch = /maps\/place\/(-?\d+\.\d+),(-?\d+\.\d+)/.exec(html);
    const lat = parseNumber(coordsMatch?.[1] ?? null);
    const lng = parseNumber(coordsMatch?.[2] ?? null);
    if (lat == null || lng == null) return null;
    if (!isInBratislavaArea(lat, lng)) return null;

    const lines = textLines(html);
    // PSČ a mesto sú v dvoch riadkoch: "821 04" + "Bratislava"
    const locality = labelValue(lines, 'Lokalita', 2);
    if (locality && !/Bratislav/i.test(locality)) return null;

    // <title> má tvar "Názov inzerátu - Mesto | Bazoš.sk"
    const title = /<title>([^<]*)<\/title>/
      .exec(html)?.[1]
      ?.replace(/\s*\|\s*Bazo[šs]\.sk\s*$/i, '')
      .replace(/\s*-\s*[^-]*$/, '')
      .trim();

    const description =
      lines.slice(lines.findIndex((l) => l.startsWith('Inzerát č.')) + 1).find((line) => line.length > 120) ??
      null;

    // Bazoš nemá štruktúrované polia — plochu aj dispozíciu hľadáme v celom
    // texte inzerátu, nielen v názve a prvom odstavci
    const haystack = lines.join(' ');
    const areaM2 = parseNumber(/(\d+(?:[,.]\d+)?)\s*m[²2]/.exec(haystack)?.[1] ?? null);
    const roomsMatch = /(\d+)\s*(?:-\s*)?i(?:zb)/i.exec(haystack);
    const price = parseNumber(labelValue(lines, 'Cena', 1));
    const now = new Date().toISOString();

    // fotky: https://www.bazos.sk/img/<poradie>/<posledne3>/<id>.jpg
    const images = [
      ...new Set(html.match(/https:\/\/www\.bazos\.sk\/img\/\d+\/\d+\/\d+\.jpg/g) ?? []),
    ];

    return {
      id: `bazos:${id}`,
      source: 'bazos',
      sourceId: id,
      sourceUrl: url,

      dealType: 'predaj',
      propertyType: 'byt',

      price,
      priceCurrency: 'EUR',
      pricePerM2: pricePerM2(price, areaM2),

      lat,
      lng,
      // súradnica je ťažisko PSČ; 1500 m je realistický odhad jeho polomeru
      locationRadius: 1500,

      address: locality,
      street: null,
      city: locality?.replace(/^\d{3} ?\d{2}\s*/, '') ?? null,
      district: null,

      areaM2,
      landAreaM2: null,
      rooms: roomsMatch?.[1] ? Number(roomsMatch[1]) : null,
      roomsRaw: roomsMatch?.[0] ?? null,
      floor: null,
      condition: null,
      hasElevator: null,

      title: title ?? `Inzerát ${id}`,
      description,
      imageUrls: images,

      advertiserName: labelValue(lines, 'Meno', 1),
      advertiserType: null,

      publishedAt: null,
      firstSeenAt: now,
      scrapedAt: now,
    };
  },
};
