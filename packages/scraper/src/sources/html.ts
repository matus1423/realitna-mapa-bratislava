/**
 * Drobné pomôcky na čítanie HTML. Zámerne bez Cheeria — portály okrem
 * nehnutelnosti.sk vystačia s atribútmi, JSON-LD a dvojicami štítok/hodnota,
 * a jedna závislosť navyše by tu nič nezjednodušila.
 */

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

export function decodeEntities(text: string): string {
  return text
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&([a-z]+);/gi, (match, name: string) => ENTITIES[name.toLowerCase()] ?? match);
}

/** Hodnota atribútu, prvý výskyt v dokumente. */
export function attr(html: string, name: string): string | null {
  const match = new RegExp(`${name}="([^"]*)"`).exec(html);
  return match?.[1] != null ? decodeEntities(match[1]) : null;
}

/**
 * zoznamrealit.sk vkladá do JSON-LD popisy aj s doslovnými tabulátormi
 * a koncami riadkov, čo je podľa špecifikácie neplatný JSON a `JSON.parse`
 * to odmietne. Escapujeme riadiace znaky, ale iba vnútri reťazcov — mimo
 * nich sú to legitímne biele znaky.
 */
function escapeControlChars(json: string): string {
  let out = '';
  let inString = false;

  for (let i = 0; i < json.length; i++) {
    const char = json[i]!;

    if (inString && char === '\\') {
      out += char + (json[i + 1] ?? '');
      i++;
      continue;
    }
    if (char === '"') inString = !inString;

    const code = char.charCodeAt(0);
    if (inString && code < 0x20) {
      out += char === '\n' ? '\\n' : char === '\r' ? '\\r' : char === '\t' ? '\\t' : ' ';
      continue;
    }

    out += char;
  }

  return out;
}

/** Všetky JSON-LD bloky, ktoré sa podarilo rozparsovať. */
export function jsonLd(html: string): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  const re = /<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;

  while ((match = re.exec(html)) !== null) {
    const raw = match[1]!;
    let parsed: unknown;

    try {
      parsed = JSON.parse(raw);
    } catch {
      try {
        parsed = JSON.parse(escapeControlChars(raw));
      } catch {
        continue;
      }
    }

    if (Array.isArray(parsed)) out.push(...(parsed as Record<string, unknown>[]));
    else if (parsed && typeof parsed === 'object') out.push(parsed as Record<string, unknown>);
  }

  return out;
}

export function findLd(html: string, type: string): Record<string, unknown> | null {
  return jsonLd(html).find((b) => b['@type'] === type) ?? null;
}

/**
 * Text stránky rozsekaný na riadky. Portály ako topreality.sk a Bazoš nemajú
 * dáta v atribútoch, ale ako dvojice "štítok" / "hodnota" za sebou v texte —
 * riadky sú na to najspoľahlivejší prístup, lebo prežijú zmenu tried a obalov.
 */
export function textLines(html: string): string[] {
  const withoutScripts = html.replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ');
  const text = decodeEntities(withoutScripts.replace(/<[^>]+>/g, '\n'));
  return text
    .split('\n')
    .map((line) => line.replace(/[\s ]+/g, ' ').trim())
    .filter((line) => line !== '');
}

/**
 * Hodnota nasledujúca po štítku. `Cena` → `254 990 €`.
 * Vracia až `maxAhead` riadkov zlepených, lebo niektoré hodnoty sú rozbité
 * (`51` + `m` + `2` pre plochu).
 */
export function labelValue(lines: string[], label: string, maxAhead = 1): string | null {
  const index = lines.findIndex((line) => line === label || line === `${label}:`);
  if (index === -1) return null;
  const value = lines.slice(index + 1, index + 1 + maxAhead).join(' ').trim();
  return value === '' ? null : value;
}
