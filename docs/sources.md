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

## reality.sk (implementované, ale vypnuté)

Beží na tej istej platforme ako nehnutelnosti.sk a používa **rovnaké ID
inzerátov** — overené na `JuA821k6w0E`, ktoré existuje na oboch portáloch.
Fotky ťahá z rovnakého CDN `img.unitedclassifieds.sk`.

Súradnice sú v `data-latitude` / `data-longitude` na `#js-map-detail`,
zvyšok polí v JSON-LD (`Product.offers.price`, `SingleFamilyResidence.floorSize`,
`amenityFeature[]` pre dispozíciu, podlažie a stav).

**Prečo je vypnutý:** portál má pred sebou WAF, ktorý odmieta klientov
nevydávajúcich sa za prehliadač. Na náš User-Agent vráti 246 B:

```
<title>Request Rejected</title>
The requested URL was rejected. Please consult with your administrator.
```

Overené trikrát po sebe, nejde o výpadok. robots.txt tie cesty povoľuje, ale
blokácia je jasnejší signál. Stratíme tým minimum — inzeráty aj ID zdieľa
s nehnutelnosti.sk, takže by ich deduplikácia aj tak zlúčila.
Spustiť sa dá cez `--source reality`.

## topreality.sk

Staršia šablóna, dáta ako dvojice štítok/hodnota v texte (`Cena`, `Lokalita`,
`Ulica`, `Úžitková plocha`, `Podlažie`, `Stav`, `Kategória`). Súradnice
v `data-gpsx` (šírka) a `data-gpsy` (dĺžka), adresa v `data-address`.
Fotky sú lazy-loaded ako `/topfoto/t/<prefix>/<id>-<poradie>-<veľkosť>.jpg`.

robots.txt uvádza `Request-rate: 10/1m` → **6 s medzi requestmi**, čo scraper
rešpektuje cez `minDelayMs`. Zúženie na byty je tu zásadné: `/bratislava/byty/`
má 1316 inzerátov na 83 stranách namiesto 12 500 na 627 stranách, čiže ~3 h
namiesto ~21 h.

Portál je súčasťou tej istej skupiny ako nehnutelnosti.sk (v hlavičke
„patria do skupiny", odkazy s `utm_medium=zatvaranie_1krok`), takže sa
zjavne zlučuje — počítaj s vysokým prekryvom.

## zoznamrealit.sk

Jediný zdroj, ktorý súradnice v detaile **nemá vôbec** — mapa sa dopĺňa až
requestom na `/ajax/mapa-popup?id=<id>`, kde je volanie
`showAddress(48.0935846, 17.1187176)`. Stojí to jeden request navyše na
inzerát; preto má `Source` voliteľné `coordsUrl` / `parseCoords`.

Pozor: ich JSON-LD obsahuje v popisoch **doslovné tabulátory a konce riadkov**,
čo je neplatný JSON a `JSON.parse` to odmietne. `jsonLd()` v `html.ts` preto
skúša druhý priechod, ktorý riadiace znaky vnútri reťazcov zaescapuje.
Bez toho vypadnú `Product` (fotky) aj `RealEstateListing` (názov, popis)
a s nimi aj plocha, ktorá sa dá vytiahnuť len z textu popisu.

## bazos.sk

Najslabší zdroj, a to z dvoch dôvodov naraz:

1. **Nedá sa filtrovať na Bratislavu.** Ich filter lokality ide cez
   `?hlokalita=`, čo robots.txt zakazuje. Zoznam je preto celoslovenský
   a Bratislavu vyberáme z textu pri každom inzeráte na stránke so zoznamom —
   detail sťahujeme len tým, ktoré prejdú. Výťažnosť je nízka, rádovo jednotky
   inzerátov z dvadsiatich na stranu.
2. **Súradnica je ťažisko PSČ, nie adresa.** Jediná poloha, ktorú portál dáva,
   je odkaz na Google Maps (`maps/place/48.170639,17.147464`). V dátach to
   nesieme ako `locationRadius: 1500`, aby bolo vidieť, že bod nie je presný.

Štruktúrované polia neexistujú — plocha aj dispozícia sa hľadajú v texte
inzerátu. Stránkovanie je posunom po 20: `/predam/byt/20/`, `/predam/byt/40/`.

Ich robots.txt menovite blokuje agregátorové boty (`trovitBot`, `pricebot`,
`SemrushBot`). Na skupinu `User-agent: *`, pod ktorú spadáme, sa to
nevzťahuje, ale zámer stojí za zaznamenanie.

## Deduplikácia

`packages/scraper/src/dedupe.ts`, spúšťa sa automaticky na konci každého behu.
Nič nemaže — len nastaví `duplicate_of`, takže sa dá kedykoľvek pozrieť, na
ktorých portáloch tá istá nehnuteľnosť visí, a mapa zobrazuje len kanonický záznam.

Dva mechanizmy:

- **podľa ID** — nehnutelnosti.sk a reality.sk zdieľajú `source_id`, čo je
  presná zhoda bez odhadovania
- **podľa parametrov** — zhodná ~100 m mriežka súradníc + zaokrúhlená plocha
  + cena zaokrúhlená na tisíce

Pri konflikte vyhráva kvalitnejší zdroj v poradí
`nehnutelnosti → reality → zoznamrealit → topreality → bazos`;
Bazoš je posledný práve pre nepresnú polohu.
