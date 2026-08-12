import type { Listing } from '@rmb/shared';
import { isInBratislavaArea, parseNumber, pricePerM2 } from '@rmb/shared';
import { attr, decodeEntities, labelValue, textLines } from './html.js';
import type { ListPageResult, Source } from './source.js';

const ORIGIN = 'https://www.topreality.sk';

function h1(html: string): string | null {
  const match = /<h1[^>]*>([\s\S]*?)<\/h1>/.exec(html);
  return match?.[1] ? decodeEntities(match[1].replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim() : null;
}

/** "2 izbový byt" → 2, "Garsónka" → 1. */
function roomsFromCategory(category: string | null): number | null {
  if (!category) return null;
  if (/garsónka|garsonka/i.test(category)) return 1;
  const match = /(\d+)\s*izbov/i.exec(category);
  return match?.[1] ? Number(match[1]) : null;
}

/**
 * topreality.sk patrí do tej istej skupiny ako nehnutelnosti.sk, ale beží na
 * staršej šablóne — dáta sú v texte ako dvojice štítok/hodnota. Ich robots.txt
 * uvádza `Request-rate: 10/1m`, čo je 6 s medzi requestmi; `minDelayMs` to drží
 * aj keď má zvyšok scrapera nastavené kratšie čakanie.
 */
export const toprealitySource: Source = {
  name: 'topreality',
  categories: ['byty na predaj, Bratislava'],
  minDelayMs: 6000,

  listUrl(_categoryIndex: number, page: number): string {
    // `/bratislava/byty/` mieša predaj aj prenájom — polovicu requestov by sme
    // minuli na inzeráty, ktoré aj tak zahodíme. `/predam` je len predaj.
    // Pozor na lomku: `/predam/2.html` je druhá strana, kým `/predam2.html`
    // vráti znova prvú. Portál pritom odkazuje na oba tvary.
    const base = `${ORIGIN}/bratislava/byty/predam`;
    return page === 1 ? base : `${base}/${page}.html`;
  },

  parseListPage(html: string): ListPageResult {
    const urls = new Set<string>();
    const re = /https:\/\/www\.topreality\.sk\/([a-z0-9-]+-r\d+)\.html/g;
    let match: RegExpExecArray | null;

    while ((match = re.exec(html)) !== null) {
      urls.add(`${ORIGIN}/${match[1]}.html`);
    }

    // "BYTY 1316" v paneli kategórií; za číslom hneď nasleduje ďalší štítok,
    // takže berieme len prvú súvislú skupinu číslic
    const totalMatch = /BYTY\s+(\d+)/.exec(html.replace(/<[^>]+>/g, ' '));

    return {
      detailUrls: [...urls],
      totalCount: totalMatch?.[1] ? parseNumber(totalMatch[1]) : null,
    };
  },

  parseDetail(html: string, url: string): Listing | null {
    const idMatch = /-r(\d+)\.html/.exec(url);
    if (!idMatch?.[1]) return null;
    const id = idMatch[1];

    // pozor na poradie: data-gpsx je zemepisná šírka, data-gpsy dĺžka
    const lat = parseNumber(attr(html, 'data-gpsx'));
    const lng = parseNumber(attr(html, 'data-gpsy'));
    if (lat == null || lng == null) return null;
    if (!isInBratislavaArea(lat, lng)) return null;

    const lines = textLines(html);
    const category = labelValue(lines, 'Kategória', 3);
    if (category && !/byt|garsónka|garsonka|mezonet|apartmán/i.test(category)) return null;

    // `/predam` filtruje len prvú stranu — stránkovanie sa vracia k zmiešanému
    // zoznamu, takže prenájmy musíme odchytiť ešte raz tu.
    if (/prenáj|prenaj/i.test(category ?? '')) return null;

    // plocha je v texte rozbitá na "51", "m", "2" — preto tri riadky dopredu
    const areaM2 = parseNumber(labelValue(lines, 'Úžitková plocha', 1));
    // Pozor na riadky typu "1 000 € 100 €" (nájom + energie): parseNumber
    // zahadzuje medzery, takže by z nich spravil 1000100. Berieme prvé číslo.
    const priceRaw = labelValue(lines, 'Cena', 1);
    const price = parseNumber(/^[\d\s ]+/.exec(priceRaw ?? '')?.[0] ?? priceRaw);
    const floorRaw = labelValue(lines, 'Podlažie', 1);
    const now = new Date().toISOString();

    // fotky sú lazy-loaded ako /topfoto/t/<prefix>/<id>-<poradie>-<velkost>.jpg
    const photoRe = new RegExp(`/topfoto/t/\\d+/${id}-\\d+-\\d+\\.jpg`, 'g');
    const images = [...new Set(html.match(photoRe) ?? [])].map((path) => `${ORIGIN}${path}`);

    const title = h1(html) ?? id;

    return {
      id: `topreality:${id}`,
      source: 'topreality',
      sourceId: id,
      sourceUrl: url,

      dealType: 'predaj',
      propertyType: 'byt',

      price,
      priceCurrency: 'EUR',
      pricePerM2: pricePerM2(price, areaM2),

      lat,
      lng,
      locationRadius: null,

      address: attr(html, 'data-address'),
      street: labelValue(lines, 'Ulica', 1),
      city: labelValue(lines, 'Lokalita', 3),
      district: null,

      areaM2,
      landAreaM2: null,
      rooms: roomsFromCategory(category),
      roomsRaw: category,
      // "2 / 4" = druhé zo štyroch podlaží
      floor: parseNumber(floorRaw?.split('/')[0] ?? null),
      condition: labelValue(lines, 'Stav', 1),
      hasElevator: null,

      title,
      description: null,
      imageUrls: images,

      advertiserName: null,
      advertiserType: null,

      publishedAt: null,
      firstSeenAt: now,
      scrapedAt: now,
    };
  },
};
