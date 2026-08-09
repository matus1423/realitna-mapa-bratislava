# Zdroje dát

Overené 9. 8. 2026. Portály sa menia — pred úpravou parsera si HTML štruktúru over znova.

## Prehľad robots.txt

| Portál | Čo je zakázané | Poznámka |
|---|---|---|
| topreality.sk | `/admin` | explicitné `Request-rate: 10/1m` → 6 s medzi requestmi |
| nehnutelnosti.sk | `/api/`, `*?order=*`, `/profil/*`, `/aiListing`, `*nomobile=1` | interné JSON API je zakázané, detail stránky a sitemapy povolené |
| reality.sk | `/hladania/` | vyhľadávanie zakázané, detaily povolené |
| bezrealitky.sk | `/vyhladat*`, `/moje-bezrealitky/*` | to isté |

Bezpečný vzor naprieč všetkými štyrmi: **sitemap alebo neutrálna stránka so
zoznamom → detail inzerátu**, nikdy nie search/API endpointy.

## nehnutelnosti.sk (implementované)

**Technológia:** Next.js App Router. Žiadny Playwright netreba — obyčajný
`fetch` vráti kompletné dáta.

**Kde sú dáta:** celý objekt inzerátu je v RSC flight payloade, rozsekanom do
volaní `self.__next_f.push([1,"…"])`. Chunky sú JSON reťazce; treba ich
rozkódovať cez `JSON.parse` a zlepiť, až potom v nich hľadať objekt
`"advertisement":{…}` párovaním zátvoriek. `JSON.parse` na celý payload nefunguje —
je to prúd viacerých hodnôt, nie jeden JSON dokument.

Implementácia: [`extractFlightPayload`](../packages/scraper/src/sources/nehnutelnosti.ts)
a `extractObject`.

**Súradnice:** `advertisement.location.point`

```json
{ "latitude": "48.131666945547", "longitude": "17.200300054361", "radius": 200 }
```

`radius: 200` znamená, že ide o **stred ulice, nie presnú adresu**. Viac
inzerátov v tom istom dome má identický bod — preto sa markery na mape
zoskupujú (`packages/web/src/map/grouping.ts`), inak by sa prekrývali
a spodné by sa nedali kliknúť.

Geokódovanie cez Nominatim teda netreba.

**Mapovanie polí:**

| Naše pole | Zdroj |
|---|---|
| `price` | `parameters.price.priceNum` |
| `pricePerM2` | `parameters.price.unitPrice` (`"3 764,67 €/m²"`) |
| `propertyType` | `parameters.category.mainValue` (`APARTMENTS`, `HOUSES`, `LANDS`…) |
| `rooms` | `parameters.category.subValue` (`THREE_ROOM_APARTMENT` → 3) |
| `areaM2` | `parameters.area` (reťazec) |
| `imageUrls` | `media.photos[].mediumUrl` — pozor, kľúč je `photos`, nie `images` |
| `address` | `location.name` |
| `advertiserName` | `advertiser.agency.name`, inak `advertiser.name` |

**Stránky so zoznamom:** `/vysledky/bratislavsky-kraj/bratislava/predaj/{byty,domy}`,
stránkovanie `?page=N`, ~23 inzerátov na stránku. Súradnice na nich **nie sú** —
tie sú až v detaile, takže detail treba stiahnuť pre každý inzerát zvlášť.

**Objem:** byty na predaj v Bratislave hlásia `totalCount: 4161`. Prvý plný crawl
je teda ~4200 requestov; pri `SCRAPE_DELAY_MS=1500` to je zhruba 1,7 hodiny.
Ďalšie behy sú inkrementálne.

**Čo sa zahadzuje:** inzeráty bez súradníc, neaktívne (`isActive: false`)
a všetko mimo obdĺžnika Bratislavy (`BRATISLAVA_BBOX` v `@rmb/shared`).
Pri vzorke 100 inzerátov to bolo 14 % — hlavne Malacky a Jakubov, ktoré
portál radí pod Bratislavský kraj.

## Ďalšie zdroje (zatiaľ neimplementované)

Pri pridávaní druhého zdroja treba doriešiť **deduplikáciu** — tá istá
nehnuteľnosť býva na viacerých portáloch. Kandidát na kľúč: zaokrúhlené
súradnice + plocha + cena v tolerancii.
