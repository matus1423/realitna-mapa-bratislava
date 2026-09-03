export interface DeactivationCheck {
  /** Koľko odkazov sa v tomto behu nazbieralo. */
  collected: number;
  /** Horný strop behu (`--limit`). */
  limit: number;
  /** Koľko detailov sa reálne sťahovalo. */
  fetched: number;
  /** Koľko z nich zlyhalo. */
  failed: number;
  /** Koľko aktívnych inzerátov má zdroj v databáze. */
  inDb: number;
}

export interface DeactivationVerdict {
  deactivate: boolean;
  reason: string;
}

/**
 * Smieme označiť nevidené inzeráty za zmiznuté?
 *
 * Je to jediná operácia, ktorá vie hromadne odstrániť dáta z mapy, tak má
 * tri poistky. Raz sa už stalo, že sa rozbilo stránkovanie, beh vyzeral ako
 * úspešný — a zhaslo 795 platných bytov.
 */
export function shouldDeactivate(check: DeactivationCheck): DeactivationVerdict {
  if (check.collected >= check.limit) {
    return { deactivate: false, reason: 'beh narazil na limit, zdroj nie je prejdený celý' };
  }

  // Zlomok nazbieraného oproti tomu, čo už máme, odhalí pokazený zber:
  // vyzerá úspešne, len nič nenašiel.
  if (check.inDb > 0 && check.collected < check.inDb * 0.5) {
    return {
      deactivate: false,
      reason: `nazbieraných ${check.collected} odkazov, ale v databáze je ${check.inDb} aktívnych`,
    };
  }

  if (check.failed >= Math.max(check.fetched * 0.1, 1)) {
    return { deactivate: false, reason: `priveľa chýb (${check.failed} z ${check.fetched})` };
  }

  return { deactivate: true, reason: 'beh prešiel celý zdroj' };
}
