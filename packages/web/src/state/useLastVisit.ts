import { useState } from 'react';

const LAST = 'rmb:lastVisit';
const PREV = 'rmb:prevVisit';

/** Dnešný deň ako YYYY-MM-DD v miestnom čase — nie v UTC, nech to sedí s kalendárom. */
function today(): string {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}

/**
 * Deň predchádzajúcej návštevy, voči ktorému sa ráta „čo pribudlo“.
 *
 * Držia sa dva dni, nie jeden. Keby sa pamätal len ten posledný, prepísal by
 * sa hneď pri načítaní na dnešok a nové by nebolo nikdy nič. A keby sa
 * neprepísal vôbec, zvýraznenie by po prvom dni zamrzlo. Preto sa posúva
 * až pri zmene dňa: opakované načítanie v ten istý deň ukazuje stále to isté.
 *
 * Je to údaj o tebe, nie o bytoch, takže ostáva v prehliadači a na server
 * nechodí. Pri prvej návšteve vráti `null` a nové nie je nič — inak by sa
 * zvýraznilo úplne všetko, čo nikomu nič nepovie.
 */
export function useLastVisit(): string | null {
  const [previous] = useState<string | null>(() => {
    try {
      const last = window.localStorage.getItem(LAST);
      const now = today();

      if (last === now) return window.localStorage.getItem(PREV);

      if (last != null) window.localStorage.setItem(PREV, last);
      window.localStorage.setItem(LAST, now);
      return last;
    } catch {
      // súkromné okno alebo zakázané úložisko — mapa funguje aj bez toho
      return null;
    }
  });

  return previous;
}
