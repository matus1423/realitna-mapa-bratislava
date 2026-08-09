# Realitná mapa Bratislava

Interaktívna mapa nehnuteľností na predaj v Bratislave a blízkom okolí.
Dáta sa scrapujú z verejne dostupných inzerátov, ukladajú do SQLite
a servujú na mapu postavenú na Leaflete a OpenStreetMap.

Osobný prototyp, nie komerčný produkt.

## Spustenie

```bash
npm install
cp .env.example .env
npm run scrape -- --limit 100   # naplní databázu
npm run dev                     # API na :3001 + web na :5175
```

## Štruktúra

| Balík | Čo robí |
|---|---|
| `packages/shared` | typy a normalizácia spoločné pre celý stack |
| `packages/scraper` | sťahovanie a parsovanie inzerátov, rate-limit, kontrola robots.txt |
| `packages/db` | SQLite schéma a dotazy (bbox, filtre, cenová história) |
| `packages/api` | Fastify — `/api/listings?bbox=…` |
| `packages/web` | Vite + React + Leaflet |

## Scraper

```bash
npm run scrape -- --source nehnutelnosti --limit 500
npm run scrape -- --limit 5000 --max-pages 400   # plná Bratislava, ~1,7 h
```

Pravidlá, ktoré scraper dodržiava:

- **robots.txt sa kontroluje pri každom behu**, nie raz pri inštalácii
  (`assertCrawlable` v `packages/scraper/src/robots.ts`). Ak sa pravidlá
  sprísnia, beh skončí chybou namiesto toho, aby ich ticho porušil.
- **Rate-limit** `SCRAPE_DELAY_MS` (predvolene 1,5 s). Ak portál v robots.txt
  uvádza `Crawl-delay` alebo `Request-rate`, scraper to vypíše.
- **Cache na disku** (`data/cache/`) — tá istá stránka sa počas ladenia
  parsera nesťahuje opakovane. Vypni cez `SCRAPE_USE_CACHE=0`.
- Vlastný `User-Agent` s kontaktom, žiadne vydávanie sa za prehliadač.

Detaily o štruktúre dát jednotlivých portálov sú v [docs/sources.md](docs/sources.md).

## API

```
GET /api/listings?bbox=lngMin,latMin,lngMax,latMax
                 &deal_type=predaj
                 &property_type=byt,dom
                 &price_min=&price_max=&area_min=&area_max=&rooms=2,3
                 &minimal=1
```

`minimal=1` vracia len polia potrebné na vykreslenie markera. Rozdiel oproti
plnej odpovedi je rádovo 20× menej dát — pri niekoľkých tisíckach bodov vo
výreze to je rozdiel medzi plynulou a trhanou mapou.

Ďalšie endpointy: `/api/listings/by-id?ids=…` (detaily pre otvorenú kartu),
`/api/listings/:id/price-history`, `/api/stats`.

## Mapa

- Stav mapy je celý v URL (`lat`, `lon`, `zoom`, `deal_type`, `property_type`,
  `rooms`, `price_min`, `price_max`) — každý výrez aj sada filtrov sa dá poslať odkazom.
- Zhlukovanie cez `supercluster`; nad zoom 15 sa zhluky rozpadnú na cenové pilulky.
- Inzeráty na rovnakej súradnici sa zlučujú do jedného markera s počtom. Zdroj
  vracia stred ulice s presnosťou 200 m, takže kolízie sú bežné — bez zlúčenia
  by sa markery prekrývali.

## Právna stránka

Scrapujú sa iba verejne viditeľné stránky, s rešpektovaním robots.txt
a rate-limitov. Ide o osobný prototyp. Ak by sa z toho mala stať verejná alebo
komerčná služba, treba prejsť ToS jednotlivých portálov.
