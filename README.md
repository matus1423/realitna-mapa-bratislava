# Realitná mapa Bratislava

Interaktívna mapa **bytov na predaj a prenájom** v Bratislave a blízkom okolí.
Dáta sa scrapujú z verejne dostupných inzerátov na štyroch portáloch,
deduplikujú, ukladajú do SQLite a servujú na mapu postavenú na Leaflete
a OpenStreetMap.

Domy, pozemky ani komerčné priestory sa nezbierajú.

## Čo mapa vie

- **Cena oproti okoliu** — medián €/m² v okruhu ~500 m; pilulka má farebný
  pruh a karta to povie slovom („o 24 % lacnejší než okolie"). Bez toho je
  cena za m² neinterpretovateľná: 4 500 €/m² je v Starom Meste normál
  a v Petržalke nadpriemer.
- **Odhad nájmu a hrubý výnos** — z prenájmov v okolí; podrobnosti nižšie.
- **Uložené inzeráty** — hviezdička, `localStorage`, filter „len uložené".
  Bez účtov; ukladajú sa iba ID, zvyšok sa doťahuje z API.
- **Dĺžka v ponuke** — z dátumu zverejnenia, ak ho portál dáva; inak od
  prvého videnia, čo je označené ako približné.
- **Cenová história** — malý graf v karte, keď má byt viac záznamov ceny.
- **Vyznačenie oblasti** — klikaním sa nakreslí tvar, dvojklik uzavrie,
  Escape zahodí. Oblasť je v URL, takže sa dá poslať odkazom.
- **Duplicity naprieč portálmi** — karta ukazuje, kde inde ten istý byt visí.

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
npm run scrape                                       # všetky zdroje, 100 z každého
npm run scrape -- --source zoznamrealit --limit 500  # jeden zdroj
npm run scrape -- --limit 20000 --max-pages 400      # plná Bratislava, niekoľko hodín
```

### Zdroje

| Zdroj | Predaj | Prenájom | Poloha | Poznámka |
|---|---|---|---|---|
| nehnutelnosti.sk | áno | áno | presná (stred ulice, 200 m) | hlavný zdroj |
| topreality.sk | áno | nie | presná | robots.txt žiada 6 s medzi requestmi |
| zoznamrealit.sk | áno | áno | presná | dva requesty na inzerát (mapa zvlášť) |
| bazos.sk | áno | nie | **ťažisko PSČ (~1,5 km)** | nedá sa filtrovať na BA |
| reality.sk | — | — | presná | **vypnuté** — portál blokuje neprehliadačových klientov |

Prenájmy zbierame z dvoch dôvodov: dajú sa zobraziť na mape a sú podkladom
pre odhad výnosu. Z topreality.sk ich neťaháme kvôli ich 6-sekundovej pauze
a z Bazoša kvôli nepresnej polohe — na medián nájmu v okolí by len pridali šum.

Prekryv medzi portálmi je vysoký: nehnutelnosti.sk, reality.sk a topreality.sk
patria do tej istej siete. Deduplikácia beží automaticky na konci každého behu
a označuje duplicity cez `duplicate_of` — nič nemaže, mapa len zobrazuje
kanonický záznam. Detaily v [docs/sources.md](docs/sources.md).

Pravidlá, ktoré scraper dodržiava:

- **robots.txt sa kontroluje pri každom behu**, nie raz pri inštalácii
  (`assertCrawlable` v `packages/scraper/src/robots.ts`). Ak sa pravidlá
  sprísnia, beh skončí chybou namiesto toho, aby ich ticho porušil.
- **Rate-limit** `SCRAPE_DELAY_MS` (predvolene 1,5 s). Ak portál v robots.txt
  uvádza `Crawl-delay` alebo `Request-rate`, scraper to vypíše.
- **Cache na disku** (`data/cache/`) — tá istá stránka sa počas ladenia
  parsera nesťahuje opakovane. Vypni cez `SCRAPE_USE_CACHE=0`.
- **Vlastný `User-Agent` s kontaktom, žiadne vydávanie sa za prehliadač.**
  Ak portál kvôli tomu odmietne obsluhu (reality.sk), zdroj sa vypne — obchádzať
  blokáciu prezlečením za prehliadač nie je súčasť projektu.

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

Odpovede obsahujú len kanonické záznamy — inzeráty označené ako duplicity
(`duplicate_of IS NOT NULL`) sa na mapu neposielajú.

## Pravidelný zber

Dve úlohy v launchd, obe cez `scripts/crawl.sh`:

| Úloha | Kedy | Zdroje | Trvanie |
|---|---|---|---|
| `denny` | každý deň 5:00 | nehnutelnosti, zoznamrealit, bazos | ~20 min |
| `tyzdenny` | nedeľa 5:30 | topreality | ~40 min |

### Prečo to netrvá hodiny

Prvý crawl sťahoval detail každého inzerátu — 4000 requestov, dve hodiny.
Pri dennom behu je to zbytočné, lebo cez noc sa zmení zlomok ponuky.

Zoznamy pritom obsahujú **ID aj cenu** každého inzerátu. Stačí ich teda
prejsť (~200 strán) a detail stiahnuť len tomu, čo je nové alebo čomu sa
zmenila cena. Zvyšku sa len posunie `scraped_at`, aby ho záver behu
nezhasol ako zmiznutý.

Na vzorke to vychádza na 10–15 % inzerátov, ktorým treba stiahnuť detail.
Ak zdroj cenu v zozname nedáva, detail sa sťahuje vždy — nemáme podľa čoho
rozhodnúť. Cena dohodou sa tiež vždy dosťahuje, lebo `null` sa nedá porovnať.

topreality je zvlášť kvôli `Request-rate: 10/1m` v ich robots.txt — 6 sekúnd
na request znamená, že samotný tento zdroj trvá dlhšie než všetky ostatné
dokopy. Denne to nemá zmysel, keď je navyše zo 68 % duplicitný.

Ak Mac o piatej spí, launchd beh dobehne hneď po prebudení. Logy sú
v `data/logs/`, mažú sa po dvoch týždňoch; HTML cache po týždni.

Beh zámerne obchádza cache — jeho zmyslom je zachytiť zmenu ceny a inzeráty,
ktoré zmizli, a ani jedno by sa zo starých kópií nezistilo. Až týmto sa
naplní cenová história, dĺžka v ponuke a zhasínanie predaných.

```bash
launchctl list | grep realitna       # bežia?
tail -f data/logs/denny-*.log        # priebeh
bash scripts/crawl.sh rucne nehnutelnosti,zoznamrealit,bazos   # spustiť teraz

launchctl unload ~/Library/LaunchAgents/com.maderovci.realitna-mapa.denny.plist
launchctl unload ~/Library/LaunchAgents/com.maderovci.realitna-mapa.tyzdenny.plist
```

Obe úlohy bežia na tomto Macu a potrebujú ho zapnutý (alebo prebudený neskôr).
Presun na server, ktorý beží stále, je otvorená otázka — viď nižšie.

## Predané a rezervované

Realitky nechávajú predané a rezervované byty visieť ako referenciu na svoju
prácu. Na mape zavadzajú — kúpiť sa nedajú a skresľujú aj medián cien v okolí,
preto sa nezobrazujú (`is_unavailable`).

Značka býva v názve, buď na začiatku alebo za názvom kancelárie
(`SVOBODA & WILLIAMS | REZERVOVANÉ | …`), často bez diakritiky a obalená
hviezdičkami či zátvorkami. Detekcia preto zhadzuje diakritiku a hľadá slovný
základ `rezervovan` / `predan`.

Jedna pasca: **„prenajatý" pri predaji znamená byt s nájomníkom**, čo je úplne
legitímna investičná ponuka. Mimo hry je len vtedy, keď ide o inzerát na
prenájom. Na dátach to vychádza tak, že sa skryje 7,6 % inzerátov a jediné,
čo slovo obsahuje a zostáva, sú práve tie obsadené byty na predaj.

## Odhad nájmu a výnosu

Z inzerátov na prenájom v okolí sa vezme **medián nájmu za m²** a vynásobí
plochou posudzovaného bytu; hrubý výnos je potom ročný nájom delený cenou.

Dve obmedzenia, ktoré karta priznáva priamo pod číslom:

- Odhad nepozná stav konkrétneho bytu. Dvojizbák po rekonštrukcii a dvojizbák
  v pôvodnom stave sa v tej istej ulici prenajímajú za výrazne iné peniaze.
- Výnos je **hrubý** — bez dane, správy, poistenia, opráv a neobsadenosti.
  Čisté číslo býva zhruba o tretinu nižšie. Slúži na porovnávanie bytov medzi
  sebou, nie ako podklad investičného rozhodnutia.

Rozdelenie na 2543 bytoch vyšlo takto: 4 % a viac má 1127 bytov, 3–4 % má
1026 a pod 3 % je 390. To zodpovedá tomu, čo sa o bratislavskom trhu píše.

## Odvodené hodnoty

`price_ratio`, `area_price_per_m2`, `estimated_rent` a `gross_yield` sa
nepočítajú pri dotaze, ale raz po každom crawle — na tisíckach markerov by
to inak mapu položilo. Preto ich scraper ani nevypĺňa: typ `ScrapedListing`
ich nemá, aby model hovoril pravdu o tom, čo vie jednotlivý parser zistiť.

Poradie na konci behu: deduplikácia → index cien → výnos. Každý krok stojí
na očistenom výsledku toho predchádzajúceho.

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
