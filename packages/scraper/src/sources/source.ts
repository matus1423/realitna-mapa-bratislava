import type { Listing } from '@rmb/shared';

export interface ListPageResult {
  /** URL detailov nájdených na tejto stránke. */
  detailUrls: string[];
  /** Celkový počet výsledkov, ak ho portál uvádza. */
  totalCount: number | null;
}

/**
 * Každý portál implementuje toto rozhranie. Pipeline potom nepozná
 * rozdiely medzi zdrojmi — vidí len zoznam URL a normalizovaný `Listing`.
 */
export interface Source {
  readonly name: string;
  /** URL stránky so zoznamom pre danú stranu (1-based). */
  listUrl(page: number): string;
  /** Vytiahne odkazy na detaily zo stránky so zoznamom. */
  parseListPage(html: string): ListPageResult;
  /** Zparsuje detail inzerátu; `null` = inzerát preskočiť (neaktívny, mimo oblasti). */
  parseDetail(html: string, url: string): Listing | null;
}
