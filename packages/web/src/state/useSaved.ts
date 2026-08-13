import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'rmb.saved';

function read(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

/**
 * Uložené inzeráty držíme v localStorage, nie na serveri. Je to osobný
 * prototyp bez účtov — účet len kvôli zoznamu obľúbených by bol väčší
 * kus práce než celá zvyšná appka.
 *
 * Ukladáme len ID; zvyšok sa doťahuje z API, takže uložený byt nikdy
 * neukazuje zastaranú cenu.
 */
export function useSaved(): {
  saved: Set<string>;
  isSaved: (id: string) => boolean;
  toggle: (id: string) => void;
} {
  const [saved, setSaved] = useState<Set<string>>(read);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...saved]));
  }, [saved]);

  // druhá otvorená karta prehliadača nemá zobrazovať iný zoznam
  useEffect(() => {
    const onStorage = (event: StorageEvent): void => {
      if (event.key === STORAGE_KEY) setSaved(read());
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const toggle = useCallback((id: string) => {
    setSaved((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }, []);

  const isSaved = useCallback((id: string) => saved.has(id), [saved]);

  return { saved, isSaved, toggle };
}
