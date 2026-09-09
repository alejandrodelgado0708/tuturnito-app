import { test } from "node:test";
import assert from "node:assert/strict";
import { mergeImports, parseSchedule, parseShift, type Word } from "./schedule-import";
import { sectorFromRgb } from "./shift-sectors";
import { cellSector } from "./schedule-grid";

function table(rows: string[][], offsetX = 0, offsetY = 0): Word[] {
  return rows.flatMap((row, y) => row.flatMap((text, x) => text ? [{ text, bbox: {
    x0: offsetX + x * 300, x1: offsetX + x * 300 + 100,
    y0: offsetY + y * 30, y1: offsetY + y * 30 + 20,
  } }] : []));
}

test("repeated weekly headings keep their own dates and merge full employee names", () => {
  const result = parseSchedule(table([
    ["SEPTIEMBRE 2026"], ["Fecha", "7", "8"], ["Colaborador", "Lunes", "Martes"],
    ["MARÍA DEL CARMEN PÉREZ", "8 a 12 / 16 a 20", "FRANCO"],
    ["Fecha", "14", "15"], ["Colaborador", "Lunes", "Martes"],
    ["María del Carmen Pérez", "09:30-18:00", "LIBRE"],
  ]), 2025);
  assert.equal(result.rows.length, 1);
  assert.deepEqual(result.dates, ["2026-09-07", "2026-09-08", "2026-09-14", "2026-09-15"]);
  assert.deepEqual(result.rows[0].shifts["2026-09-07"], [{ from: "08:00", to: "12:00" }, { from: "16:00", to: "20:00" }]);
  assert.equal(result.rows[0].shifts["2026-09-15"], null);
  assert.deepEqual(result.warnings, []);
});

test("side-by-side tables and empty cells do not shift subsequent hours", () => {
  const result = parseSchedule([
    ...table([["Septiembre 2026"], ["Fecha", "7", "8"], ["Colaborador", "Lunes", "Martes"], ["Ana", "", "9-17"]]),
    ...table([[""], ["Fecha", "14", "15"], ["Colaborador", "Lunes", "Martes"], ["Ana", "FRANCO", "10-18"]], 1000),
  ], 2026);
  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].shifts["2026-09-07"], undefined);
  assert.deepEqual(result.rows[0].shifts["2026-09-08"], { from: "09:00", to: "17:00" });
  assert.equal(result.rows[0].shifts["2026-09-14"], null);
});

test("ISO template dates and textual statuses remain supported", () => {
  const result = parseSchedule(table([["Nombre", "2027-01-01", "2027-01-02"], ["Juan Carlos López", "PLANTA", "LIBRE"]]), 2026);
  assert.deepEqual(result.dates, ["2027-01-01", "2027-01-02"]);
  assert.deepEqual(result.rows[0].shifts["2027-01-01"], { from: "PLANTA", to: "" });
  assert.deepEqual(result.warnings, []);
});

test("never invent missing months or accept impossible dates", () => {
  assert.equal(parseSchedule(table([["Fecha", "7"], ["Colaborador", "Lunes"], ["Ana", "8-16"]]), 2026).rows.length, 0);
  assert.equal(parseSchedule(table([["Febrero 2026"], ["Fecha", "30"], ["Colaborador", "Lunes"], ["Ana", "8-16"]]), 2026).rows.length, 0);
});

test("cropped month can use the calendar context, always with a warning", () => {
  const words = table([["Fecha", "7", "8"], ["Colaborador", "Lunes", "Martes"], ["NAHIARA ARCE", "Franco", "10 A 15"]]);
  const result = parseSchedule(words, 2026, 9);
  assert.deepEqual(result.dates, ["2026-09-07", "2026-09-08"]);
  assert.equal(result.rows[0].excelName, "NAHIARA ARCE");
  assert.ok(result.warnings.some(w => w.includes("septiembre del calendario")));
  const explicit = parseSchedule([...table([["Octubre 2026"]], 0, -30), ...words], 2026, 9);
  assert.deepEqual(explicit.dates, ["2026-10-07", "2026-10-08"]);
  assert.ok(!explicit.warnings.some(w => w.includes("del calendario")));
});

test("missing OCR date must not shift later hours to the wrong day", () => {
  const result = parseSchedule(table([["Fecha", "7", "", "9"], ["Colaborador", "Lunes", "Martes", "Miércoles"], ["Ana", "8-16", "9-17", "10-18"]]), 2026, 9);
  assert.equal(result.rows.length, 0);
  assert.ok(result.warnings.some(w => w.includes("todas las fechas")));
});

test("warn about assumed years and weekday mismatches", () => {
  const result = parseSchedule(table([["Septiembre"], ["Fecha", "7"], ["Colaborador", "Martes"], ["Ana", "8-16"]]), 2026);
  assert.equal(result.warnings.length, 2);
});

test("month changes in later blocks use the new month", () => {
  const result = parseSchedule(table([
    ["Septiembre 2026"], ["Fecha", "30"], ["Colaborador", "Miércoles"], ["Ana", "8-16"],
    ["Octubre 2026"], ["Fecha", "1"], ["Colaborador", "Jueves"], ["Ana", "10-18"],
  ]), 2026);
  assert.deepEqual(result.dates, ["2026-09-30", "2026-10-01"]);
  assert.equal(result.rows.length, 1);
});

test("conflicting repeated shifts are rejected, identical duplicates are merged", () => {
  const result = parseSchedule(table([["Nombre", "2026-09-07"], ["Ana", "8-16"]]), 2026);
  assert.equal(mergeImports([result, result]).rows.length, 1);
  const other = parseSchedule(table([["Nombre", "2026-09-07"], ["Ana", "10-18"]]), 2026);
  assert.throws(() => mergeImports([result, other]), /horarios diferentes/);
});

test("validates time ranges without corrupting overnight or split shifts", () => {
  assert.deepEqual(parseShift("22 a 6"), { from: "22:00", to: "06:00" });
  assert.deepEqual(parseShift("8.30 – 16.45"), { from: "08:30", to: "16:45" });
  assert.equal(parseShift("25-28"), undefined);
  assert.equal(parseShift("08:75-16:00"), undefined);
  assert.equal(parseShift("8 a"), undefined);
});

test("compact split shifts keep their sector on both ranges", () => {
  for (const text of ["9 a 16/18 a 20", "9a16/18a20", "09 A 16 / 18 A 20"]) {
    assert.deepEqual(parseShift(text, "cocina"), [
      { from: "09:00", to: "16:00", sector: "cocina" },
      { from: "18:00", to: "20:00", sector: "cocina" },
    ]);
  }
  assert.equal(parseShift("FRANCO", "caja"), null);
  assert.deepEqual(parseShift("PLANTA / local", "apoyo"), { from: "PLANTA / local", to: "", sector: "apoyo" });
});

test("background colors map to sectors; yellow and purple do not", () => {
  assert.equal(sectorFromRgb(52, 168, 83), "cocina");
  assert.equal(sectorFromRgb(204, 204, 204), "caja");
  assert.equal(sectorFromRgb(193, 122, 160), "apoyo");
  assert.equal(sectorFromRgb(241, 142, 134), "apoyo");
  assert.equal(sectorFromRgb(59, 130, 246), "cafeteria");
  assert.equal(sectorFromRgb(250, 187, 4), "salon");
  assert.equal(sectorFromRgb(255, 255, 0), undefined);
  assert.equal(sectorFromRgb(180, 167, 214), undefined);
  assert.equal(sectorFromRgb(255, 255, 255), undefined);
  const data = new Uint8ClampedArray(40 * 20 * 4);
  for (let i = 0; i < data.length; i += 4) data.set([52, 168, 83, 255], i);
  for (let y = 7; y < 12; y++) for (let x = 10; x < 25; x++) data.set([0, 0, 0, 255], (y * 40 + x) * 4);
  assert.equal(cellSector({ data, width: 40, height: 20 }, { x0: 0, y0: 0, x1: 40, y1: 20 }), "cocina");
});

test("sector metadata survives table parsing and JSON persistence", () => {
  const words = table([["Nombre", "2026-09-07"], ["Ana", "9 a 16/18 a 20"]]);
  words.at(-1)!.sector = "cafeteria";
  const result = parseSchedule(words, 2026);
  const persisted = JSON.parse(JSON.stringify(result));
  assert.deepEqual(persisted.rows[0].shifts["2026-09-07"], parseShift("9 a 16/18 a 20", "cafeteria"));
});

test("an invalid date cannot move its hours into an adjacent valid day", () => {
  const result = parseSchedule(table([["Febrero 2026"], ["Fecha", "28", "30"], ["Colaborador", "Sábado", "Lunes"], ["Ana", "8-16", "10-18"]]), 2026);
  assert.equal(result.rows.length, 0);
  assert.equal(result.warnings.length, 1);
});

test("trailing totals do not become part of the last shift", () => {
  const result = parseSchedule(table([["Nombre", "2026-09-07", "2026-09-08", "Total"], ["Ana", "8-16", "9-17", "16"]]), 2026);
  assert.deepEqual(result.rows[0].shifts["2026-09-08"], { from: "09:00", to: "17:00" });
});

test("September example: centered headings, left-aligned full names, two groups and totals", () => {
  // Manually transcribed from the user's image; positions model its uneven columns.
  // This checks table interpretation, not the OCR engine's recognition accuracy.
  const words: Word[] = [];
  const put = (text: string, x: number, y: number, width = text.length * 7) => {
    words.push({ text, bbox: { x0: x, x1: x + width, y0: y, y1: y + 12 } });
  };
  const centers = [315, 433, 551, 652, 753, 853, 953];
  const days = ["LUNES", "MARTES", "MIERCOLES", "JUEVES", "VIERNES", "SABADO", "DOMINGO"];
  const roster = [
    ["NAHIARA ARCE", "Franco", "10 A 15", "10 A 16", "Franco", "09 a 16", "19 a 00", "18 a 23"],
    ["VALENTINO POLIDONI", "10 a 15", "17 A 23", "17 a 23", "18 A 23", "16 A 23", "16 a 23", "Franco"],
    ["NAHIARA FURTADO", "18 a 23", "Franco", "Franco", "10 A 16", "18 A 00", "12 a 19", "09 a 15"],
    ["ROCIO ARREJIN", "15 a 23", "15 a 23", "Franco", "REUNION", "9 a 18", "08 a 17", "15 a 23"],
    ["CAMILA CELESTINO", "Franco", "09 a 17", "8 a 17", "09 a 18", "15 A 00", "17 a 00", "12 a 21"],
    ["HEIDI CASTRO", "09 A 18", "Franco", "16 a 23", "16 a 23", "Franco", "09 a 16", "09 a 18"],
  ];
  put("SEPTIEMBRE", 53, 26);
  for (let group = 0; group < 2; group++) {
    const y = group ? 166 : 46;
    put("FECHA", 135, y);
    put("COLABORADOR", 107, y + 20);
    put("HS SEMAN", 1015, y);
    centers.forEach((x, index) => {
      put(String(index + 7), x - 4, y, 8);
      put(days[index], x - days[index].length * 3.5, y + 20);
    });
    roster.slice(group * 3, group * 3 + 3).forEach((row, index) => {
      const rowY = y + 40 + index * 20;
      let nameX = 53;
      row[0].split(" ").forEach(part => { put(part, nameX, rowY); nameX += (part.length + 1) * 7; });
      row.slice(1).forEach((cell, col) => {
        let x = centers[col] - cell.length * 3.5;
        cell.split(" ").forEach(part => { put(part, x, rowY); x += (part.length + 1) * 7; });
      });
    });
  }
  put("CANTIDAD DE HORAS POR DIA", 53, 266);
  [28, 28, 28, 28, 36, 45, 37].forEach((n, col) => put(String(n), centers[col], 266));
  put("Total de horas :", 910, 286);
  const result = parseSchedule(words, 2026);
  assert.deepEqual(result.rows.map(r => r.excelName), roster.map(r => r[0]));
  assert.deepEqual(result.dates, centers.map((_, i) => `2026-09-${String(i + 7).padStart(2, "0")}`));
  result.rows.forEach((row, index) => {
    assert.equal(Object.keys(row.shifts).length, 7);
    roster[index].slice(1).forEach((cell, col) => assert.deepEqual(row.shifts[result.dates[col]], parseShift(cell)));
  });
  assert.deepEqual(result.rows[0].shifts["2026-09-12"], { from: "19:00", to: "00:00" });
  assert.deepEqual(result.rows[3].shifts["2026-09-10"], { from: "REUNION", to: "" });
  assert.equal(result.warnings.length, 1); // No year printed in the example.
});
