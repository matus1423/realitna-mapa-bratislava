import type { ScrapedListing } from '@rmb/shared';

export interface Coords {
  lat: number;
  lng: number;
}

export interface ListPageResult {
  /** URL detailov nájdených na tejto stránke. */
  detailUrls: string[];
  /** Celkový počet výsledkov, ak ho portál uvádza. */
  totalCount: number | null;
  /**
   * Koľko inzerátov stránka vôbec obsahovala, teda pred filtrovaním.
   * Zdroje, ktoré filtrujú lokalitu až z textu (Bazoš), majú bežne stránky
   * bez jediného zhodného inzerátu — driver to nesmie čítať ako koniec zoznamu.
   */
  itemsOnPage?: number;
  /**
   * Cena podľa zoznamu, kľúčom je URL detailu. Ak ju zdroj vie dať, driver
   * preskočí sťahovanie detailov, ktorým sa cena nezmenila — z dvojhodinového
   * behu je potom pár minút. `null` = portál cenu neuvádza (dohodou), vtedy
   * sa detail stiahne vždy.
   */
  prices?: Map<string, number | null>;
}

/**
 * Každý portál implementuje toto rozhranie. Pipeline potom nepozná
 * rozdiely medzi zdrojmi — vidí len zoznam URL a normalizovaný `Listing`.
 */
export interface Source {
  readonly name: string;

  /**
   * Vetvy, ktoré treba prejsť samostatne (napr. jednotlivé mestské časti majú
   * vlastné stránkovanie). Driver ide kategóriu po kategórii, aby prázdna
   * stránka v jednej nezastavila zbieranie v ostatných.
   */
  readonly categories: readonly string[];

  /** Pauza medzi requestmi, ak portál vyžaduje viac než globálne nastavenie. */
  readonly minDelayMs?: number;

  /** URL stránky so zoznamom; `page` je 1-based. */
  listUrl(categoryIndex: number, page: number): string;

  /** Vytiahne odkazy na detaily zo stránky so zoznamom. */
  parseListPage(html: string, listUrl: string): ListPageResult;

  /**
   * Zparsuje detail inzerátu; `null` = inzerát preskočiť (neaktívny, mimo
   * oblasti, nie byt). `coords` je vyplnené len pri portáloch, ktoré držia
   * polohu mimo detailu.
   */
  parseDetail(html: string, url: string, coords?: Coords | null): ScrapedListing | null;

  /**
   * Voliteľné: portál načítava mapu zvlášť (zoznamrealit.sk). Driver stiahne
   * tento endpoint pred `parseDetail` a výsledok mu podá v `coords`.
   */
  coordsUrl?(html: string, url: string): string | null;
  parseCoords?(html: string): Coords | null;
}
