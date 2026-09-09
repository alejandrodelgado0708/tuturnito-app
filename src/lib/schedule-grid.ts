export type Pixels = { data: Uint8ClampedArray; width: number; height: number };
export type GridCell = { x0: number; y0: number; x1: number; y1: number };

const gray = (data: Uint8ClampedArray, i: number) => {
  const alpha = data[i + 3] / 255;
  return (data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114) * alpha + 255 * (1 - alpha);
};

/** Find long rules in a spreadsheet screenshot; never assume a fixed cell size. */
export function detectGrid({ data, width, height }: Pixels): GridCell[][] {
  const xs = new Uint32Array(width), ys = new Uint32Array(height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = (y * width + x) * 4;
    if (gray(data, i) < 160 && Math.max(data[i], data[i + 1], data[i + 2]) - Math.min(data[i], data[i + 1], data[i + 2]) < 45) { xs[x]++; ys[y]++; }
  }
  const edges = (counts: Uint32Array, span: number) => {
    const lines: { start: number; end: number }[] = [];
    for (let i = 0; i < counts.length; i++) if (counts[i] > span * 0.65) {
      const last = lines.at(-1);
      if (last && i === last.end + 1) last.end = i;
      else lines.push({ start: i, end: i });
    }
    if (!lines.length) return [];
    if (lines[0].start > 3) lines.unshift({ start: -1, end: -1 });
    if (lines.at(-1)!.end < counts.length - 4) lines.push({ start: counts.length, end: counts.length });
    return lines;
  };
  const vertical = edges(xs, height), horizontal = edges(ys, width);
  if (vertical.length < 3 || horizontal.length < 3) return [];
  return horizontal.slice(0, -1).map((line, y) => vertical.slice(0, -1).map((col, x) => ({
    x0: col.end + 2, x1: vertical[x + 1].start - 1,
    y0: line.end + 2, y1: horizontal[y + 1].start - 1,
  })).filter(c => c.x1 - c.x0 > 5 && c.y1 - c.y0 > 5));
}

/** Tight text bounds, generous white padding and deterministic bilinear scaling. */
export function prepareGridCell(source: Pixels, cell: GridCell, monochrome: boolean): Pixels | undefined {
  let left = cell.x1, right = cell.x0, top = cell.y1, bottom = cell.y0;
  for (let y = cell.y0; y < cell.y1; y++) for (let x = cell.x0; x < cell.x1; x++) {
    if (gray(source.data, (y * source.width + x) * 4) < 110) {
      left = Math.min(left, x); right = Math.max(right, x);
      top = Math.min(top, y); bottom = Math.max(bottom, y);
    }
  }
  if (left > right || top > bottom) return;
  left = Math.max(cell.x0, left - 2); right = Math.min(cell.x1 - 1, right + 2);
  top = Math.max(cell.y0, top - 2); bottom = Math.min(cell.y1 - 1, bottom + 2);
  const scale = 4, padding = 20;
  const width = (right - left + 1) * scale + padding * 2;
  const height = (bottom - top + 1) * scale + padding * 2;
  const data = new Uint8ClampedArray(width * height * 4).fill(255);
  for (let y = padding; y < height - padding; y++) for (let x = padding; x < width - padding; x++) {
    const sx = Math.min(right, left + (x - padding) / scale);
    const sy = Math.min(bottom, top + (y - padding) / scale);
    const x0 = Math.floor(sx), y0 = Math.floor(sy), dx = sx - x0, dy = sy - y0;
    const offsets = [y0 * source.width + x0, y0 * source.width + Math.min(right, x0 + 1), Math.min(bottom, y0 + 1) * source.width + x0, Math.min(bottom, y0 + 1) * source.width + Math.min(right, x0 + 1)];
    const weights = [(1 - dx) * (1 - dy), dx * (1 - dy), (1 - dx) * dy, dx * dy];
    for (let c = 0; c < 3; c++) {
      const value = offsets.reduce((sum, pixel, j) => sum + weights[j] * (monochrome ? Math.max(0, Math.min(255, (gray(source.data, pixel * 4) - 30) * 255 / 150)) : source.data[pixel * 4 + c]), 0);
      data[(y * width + x) * 4 + c] = value;
    }
  }
  return { data, width, height };
}

export function cellSector(source: Pixels, cell: GridCell): Sector | undefined {
  const counts = new Map<Sector, number>();
  let total = 0;
  for (let y = cell.y0 + 1; y < cell.y1 - 1; y += 2) for (let x = cell.x0 + 1; x < cell.x1 - 1; x += 2) {
    const i = (y * source.width + x) * 4;
    total++;
    if (source.data[i + 3] < 200) continue;
    const sector = sectorFromRgb(source.data[i], source.data[i + 1], source.data[i + 2]);
    if (sector) counts.set(sector, (counts.get(sector) ?? 0) + 1);
  }
  const best = [...counts].sort((a, b) => b[1] - a[1])[0];
  return best && best[1] > total * 0.45 ? best[0] : undefined;
}

function splitTextRows(source: Pixels, cell: GridCell): GridCell[] {
  const bands: { start: number; end: number }[] = [];
  for (let y = cell.y0; y < cell.y1; y++) {
    let count = 0;
    for (let x = cell.x0; x < cell.x1; x++) if (gray(source.data, (y * source.width + x) * 4) < 80) count++;
    if (count < 2) continue;
    const last = bands.at(-1);
    if (last && y - last.end < 4) last.end = y;
    else bands.push({ start: y, end: y });
  }
  if (bands.length < 2) return [cell];
  return bands.map((band, i) => ({ ...cell, y0: i ? Math.floor((bands[i - 1].end + band.start) / 2) : cell.y0, y1: i + 1 < bands.length ? Math.floor((band.end + bands[i + 1].start) / 2) : cell.y1 }));
}

export async function readGrid(
  source: Pixels,
  recognize: (pixels: Pixels, numeric: boolean, mode: "6" | "7") => Promise<string>,
): Promise<Word[]> {
  const words: Word[] = [];
  for (const row of detectGrid(source)) {
    let dateRow = false;
    for (const cell of row.flatMap(c => splitTextRows(source, c))) {
      const pixels = prepareGridCell(source, cell, dateRow);
      if (!pixels) continue;
      let text = (await recognize(pixels, dateRow, dateRow ? "7" : "6")).trim();
      if (!text && dateRow) text = (await recognize(pixels, true, "6")).trim();
      if (!text && dateRow) {
        // A second horizontal table may start with another FECHA label.
        const label = prepareGridCell(source, cell, false);
        if (label) text = (await recognize(label, false, "6")).trim();
      }
      if (/^fecha\b/i.test(text)) dateRow = true;
      const sector = cellSector(source, cell);
      if (text) words.push({ text, bbox: cell, ...(sector ? { sector } : {}) });
    }
  }
  return words;
}
import { sectorFromRgb, type Sector } from "./shift-sectors";
import type { Word } from "./schedule-import";
