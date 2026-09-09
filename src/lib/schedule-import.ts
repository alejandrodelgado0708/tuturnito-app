export type ImportedShift = { from: string; to: string } | { from: string; to: string }[] | null;
export type ImportRow = { excelName: string; shifts: Record<string, ImportedShift> };
export type Word = { text: string; bbox: { x0: number; y0: number; x1: number; y1: number } };
export type ImportResult = { rows: ImportRow[]; dates: string[]; warnings: string[] };
export const nameKey = (text: string) => text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim().replace(/\s+/g, " ");
const months = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const weekdays = ["domingo", "lunes", "martes", "miercoles", "jueves", "viernes", "sabado"];
const isHeader = (s: string) => /^(colaborador(?:es)?|empleados?|nombre(?:s)?)(?:\b|$)/.test(nameKey(s));
const center = (w: Word) => (w.bbox.x0 + w.bbox.x1) / 2;

export function parseShift(raw: string): ImportedShift | undefined {
  const value = raw.trim().replace(/^[|]+|[|]+$/g, "").trim();
  if (!value || /^[—–-]+$/.test(value)) return undefined;
  if (/^(franco|libre|descanso)$/i.test(value)) return null;
  const normalized = value.replace(/[–—]/g, "-").replace(/[.,'’´](?=\d{2}\b)/g, ":");
  const range = /^(\d{1,2})(?::(\d{2}))?\s*(?:-|a)\s*(\d{1,2})(?::(\d{2}))?$/i;
  const parts = normalized.split(/\s*\/\s*/);
  const shifts: { from: string; to: string }[] = [];
  for (const part of parts) {
    const match = part.trim().match(range);
    if (!match) {
      // Preserve textual statuses, but never turn malformed hours into a shift.
      return /\d/.test(value) ? undefined : { from: value, to: "" };
    }
    const [, h1, m1 = "00", h2, m2 = "00"] = match;
    if (+h1 > 23 || +h2 > 24 || +m1 > 59 || +m2 > 59 || (+h2 === 24 && +m2 !== 0)) return undefined;
    shifts.push({ from: `${h1.padStart(2, "0")}:${m1}`, to: `${h2.padStart(2, "0")}:${m2}` });
  }
  return shifts.length === 1 ? shifts[0] : shifts;
}

function dateValue(raw: string, month: number | undefined, year: number): string | undefined {
  const text = raw.trim();
  const iso = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  const local = text.match(/^(\d{1,2})(?:[/-](\d{1,2})(?:[/-](\d{2}|\d{4}))?)?$/);
  if (!iso && !local) return;
  const y = iso ? +iso[1] : local?.[3] ? (+local[3] < 100 ? 2000 + +local[3] : +local[3]) : year;
  const m = iso ? +iso[2] : local?.[2] ? +local[2] : month;
  const d = iso ? +iso[3] : +local![1];
  if (!m || m < 1 || m > 12 || d < 1) return;
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export function mergeImports(results: ImportResult[]): ImportResult {
  const people = new Map<string, ImportRow>();
  const warnings = new Set(results.flatMap(r => r.warnings));
  for (const row of results.flatMap(r => r.rows)) {
    const key = nameKey(row.excelName);
    const person = people.get(key) ?? { excelName: row.excelName, shifts: {} };
    for (const [date, shift] of Object.entries(row.shifts)) {
      if (date in person.shifts && JSON.stringify(person.shifts[date]) !== JSON.stringify(shift)) {
        throw new Error(`Hay horarios diferentes para ${person.excelName} el ${date}. Corregí el documento antes de importarlo.`);
      }
      person.shifts[date] = shift;
    }
    people.set(key, person);
  }
  return { rows: [...people.values()], dates: [...new Set(results.flatMap(r => r.dates))].sort(), warnings: [...warnings] };
}

/** Coordinates always run left-to-right and top-to-bottom, including PDF input. */
export function parseSchedule(words: Word[], fallbackYear: number): ImportResult {
  const lines: Word[][] = [];
  for (const word of words.filter(w => w.text.trim()).sort((a, b) => a.bbox.y0 - b.bbox.y0)) {
    const cy = (word.bbox.y0 + word.bbox.y1) / 2;
    const line = lines.find(r => {
      const first = r[0];
      return Math.abs(cy - (first.bbox.y0 + first.bbox.y1) / 2) < Math.max(2, Math.min(word.bbox.y1 - word.bbox.y0, first.bbox.y1 - first.bbox.y0) * 0.55);
    });
    if (line) line.push(word); else lines.push([word]);
  }
  lines.forEach(line => line.sort((a, b) => a.bbox.x0 - b.bbox.x0));
  let month: number | undefined;
  let year = fallbackYear;
  let explicitYear = false;
  const rows: ImportRow[] = [];
  const dates = new Set<string>();
  const warnings = new Set<string>();
  for (let i = 0; i < lines.length; i++) {
    const text = nameKey(lines[i].map(w => w.text).join(" "));
    const foundMonth = months.findIndex(m => new RegExp(`\\b${m}\\b`).test(text.replace(/setiembre/g, "septiembre")));
    if (foundMonth >= 0) month = foundMonth + 1;
    if (/\b(19|20|21)\d{2}\b/.test(text) && (foundMonth >= 0 || /fecha|colaborador|nombre|empleado|ano/.test(text))) {
      year = +text.match(/\b(?:19|20|21)\d{2}\b/)![0]; explicitYear = true;
    }
    const headers = lines[i].filter(w => isHeader(w.text));
    // A centered label is not the left edge of its column: employee names
    // commonly start well before it. Separate horizontal tables in the gap
    // before each subsequent label, keeping the first table's full left side.
    const tableEdges = headers.map((header, index) => {
      if (index === 0) return -Infinity;
      const preceding = lines[i].filter(w => w.bbox.x1 <= header.bbox.x0).at(-1);
      return preceding ? (preceding.bbox.x1 + header.bbox.x0) / 2 : header.bbox.x0;
    });
    for (let hi = 0; hi < headers.length; hi++) {
      const left = tableEdges[hi];
      const right = tableEdges[hi + 1] ?? Infinity;
      const within = (w: Word) => w.bbox.x0 >= left && w.bbox.x0 < right;
      const nearby = [i, i - 1, i + 1].filter(n => n >= 0 && n < lines.length);
      let dateLine = -1;
      let columns: { word: Word; date: string }[] = [];
      let invalidDate = false;
      for (const n of nearby) {
        const cells = lines[n].filter(within);
        if (n !== i && !cells.some(w => /^fecha\b/.test(nameKey(w.text))) && n < i) continue;
        const candidates = cells.flatMap(word => {
          const date = dateValue(word.text, month, year);
          if (/^(?:\d{4}-\d{1,2}-\d{1,2}|\d{1,2}(?:[/-]\d{1,2}(?:[/-](?:\d{2}|\d{4}))?)?)$/.test(word.text.trim()) && !date) invalidDate = true;
          return date ? [{ word, date }] : [];
        });
        if (candidates.length || invalidDate) { columns = candidates; dateLine = n; break; }
      }
      if (!columns.length || invalidDate) {
        warnings.add("Un bloque no tiene fechas válidas o le falta el mes; no se importó ese bloque.");
        continue;
      }
      if (!explicitYear && columns.some(c => !/\d{4}|[/-]\d{2}[/-]\d{2}$/.test(c.word.text))) warnings.add(`El documento no indica el año en algunas fechas: se usó ${fallbackYear}.`);
      const dayWords = lines[i].filter(w => within(w) && weekdays.includes(nameKey(w.text)));
      const anchors = columns.map((col, index) => dayWords.length === columns.length ? center(dayWords[index]) : center(col.word));
      const gap = anchors.length > 1 ? anchors[1] - anchors[0] : Math.max(60, anchors[0] - headers[hi].bbox.x1);
      const boundaries = anchors.map((x, index) => index ? (anchors[index - 1] + x) / 2 : x - gap / 2);
      columns.forEach((col, index) => {
        dates.add(col.date);
        if (dayWords.length === columns.length && new Date(`${col.date}T12:00:00Z`).getUTCDay() !== weekdays.indexOf(nameKey(dayWords[index].text))) warnings.add(`El día de la semana no coincide con ${col.date}. Revisá el año antes de confirmar.`);
      });
      for (let r = Math.max(i, dateLine) + 1; r < lines.length; r++) {
        const cells = lines[r].filter(within);
        const lineText = nameKey(cells.map(w => w.text).join(" "));
        if (cells.some(w => isHeader(w.text) || /^fecha\b/.test(nameKey(w.text))) || /^(total|cantidad|hs\.? semanal|horas semanal)/.test(lineText) || months.some(m => new RegExp(`^${m}\\b`).test(lineText))) break;
        const name = cells.filter(w => center(w) < boundaries[0]).map(w => w.text).join(" ").trim();
        if (!name || !/\p{L}/u.test(name) || /^\d/.test(name) || weekdays.includes(nameKey(name))) continue;
        const shifts: Record<string, ImportedShift> = {};
        columns.forEach((col, index) => {
          const raw = cells.filter(w => center(w) >= boundaries[index] && center(w) < (boundaries[index + 1] ?? Math.min(right, anchors[index] + gap / 2))).map(w => w.text).join(" ");
          const shift = parseShift(raw);
          if (shift !== undefined) shifts[col.date] = shift;
          else if (raw.trim() && !/^[—–-]+$/.test(raw.trim())) warnings.add(`No se pudo interpretar el horario de ${name} el ${col.date}: ${raw}`);
        });
        if (Object.keys(shifts).length) rows.push({ excelName: name, shifts });
      }
    }
  }
  return mergeImports([{ rows, dates: [...dates], warnings: [...warnings] }]);
}
