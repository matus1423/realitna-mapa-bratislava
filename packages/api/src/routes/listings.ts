import type { BBox, DealType, PropertyType } from '@rmb/shared';
import {
  countListings,
  findListingsInBBox,
  findMarkersInBBox,
  getDuplicatesFor,
  getListingsByIds,
  getPriceHistory,
} from '@rmb/db';
import type { FastifyInstance } from 'fastify';

const PROPERTY_TYPES: PropertyType[] = ['byt', 'dom', 'pozemok', 'komercne', 'ine'];

interface ListingsQuery {
  bbox?: string;
  deal_type?: string;
  property_type?: string;
  price_min?: string;
  price_max?: string;
  area_min?: string;
  area_max?: string;
  rooms?: string;
  minimal?: string;
  limit?: string;
}

function parseBBox(raw: string | undefined): BBox | null {
  if (!raw) return null;
  const parts = raw.split(',').map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) return null;
  const [lngMin, latMin, lngMax, latMax] = parts as [number, number, number, number];
  return { latMin, latMax, lngMin, lngMax };
}

function parseNumberParam(raw: string | undefined): number | undefined {
  if (raw == null || raw === '') return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

function parseList<T extends string>(raw: string | undefined, allowed: readonly T[]): T[] | undefined {
  if (!raw) return undefined;
  const values = raw.split(',').filter((v): v is T => (allowed as readonly string[]).includes(v));
  return values.length ? values : undefined;
}

export function registerListingRoutes(app: FastifyInstance): void {
  /**
   * Hlavný endpoint mapy. `minimal=1` vracia len to, čo treba na vykreslenie
   * markera — pri tisícoch bodov vo výreze je to rozdiel medzi
   * stovkami kilobajtov a pár desiatkami.
   */
  app.get<{ Querystring: ListingsQuery }>('/api/listings', (req, reply) => {
    const bbox = parseBBox(req.query.bbox);
    if (!bbox) {
      return reply
        .code(400)
        .send({ error: 'Chýba alebo je neplatný parameter bbox (formát: lngMin,latMin,lngMax,latMax)' });
    }

    const dealType = req.query.deal_type;
    const filters = {
      bbox,
      dealType:
        dealType === 'predaj' || dealType === 'prenajom' ? (dealType as DealType) : undefined,
      propertyTypes: parseList(req.query.property_type, PROPERTY_TYPES),
      priceMin: parseNumberParam(req.query.price_min),
      priceMax: parseNumberParam(req.query.price_max),
      areaMin: parseNumberParam(req.query.area_min),
      areaMax: parseNumberParam(req.query.area_max),
      rooms: req.query.rooms
        ?.split(',')
        .map(Number)
        .filter((n) => Number.isFinite(n)),
      limit: parseNumberParam(req.query.limit),
    };

    if (req.query.minimal === '1' || req.query.minimal === 'true') {
      const markers = findMarkersInBBox(filters);
      return reply.send({ markers, count: markers.length, total: countListings().active });
    }

    const listings = findListingsInBBox(filters);
    return reply.send({ listings, count: listings.length });
  });

  /** Detaily pre otvorenú kartu — klient si ich pýta až po kliknutí na marker. */
  app.get<{ Querystring: { ids?: string } }>('/api/listings/by-id', (req, reply) => {
    const ids = req.query.ids?.split(',').filter(Boolean) ?? [];
    if (ids.length === 0) return reply.code(400).send({ error: 'Chýba parameter ids' });
    if (ids.length > 100) return reply.code(400).send({ error: 'Maximálne 100 ID naraz' });

    const found = getListingsByIds(ids);
    const duplicates = getDuplicatesFor(found.map((listing) => listing.id));

    // Tvar musí sedieť so statickým exportom, inak by sa karta správala
    // inak vo vývoji a inak v nasadení.
    const listings = found.map((listing) => ({
      ...listing,
      // ten istý byt býva na viacerých portáloch; nech je z karty vidieť kde
      alsoOn: duplicates
        .filter((dup) => dup.canonicalId === listing.id)
        .map(({ source, sourceUrl }) => ({ source, sourceUrl })),
      priceHistory: getPriceHistory(listing.id),
    }));

    return reply.send({ listings });
  });

  app.get<{ Params: { id: string } }>('/api/listings/:id/price-history', (req, reply) => {
    return reply.send({ history: getPriceHistory(req.params.id) });
  });

  app.get('/api/stats', (_req, reply) => reply.send(countListings()));
}
