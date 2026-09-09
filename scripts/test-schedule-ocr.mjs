// Regression for the user's three-row September screenshot. The image stays local.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { createWorker, PSM } from "tesseract.js";
import { readGrid } from "../.tmp-schedule-tests/schedule-grid.js";
import { parseSchedule, parseShift } from "../.tmp-schedule-tests/schedule-import.js";

async function main() {
  const file = process.env.SCHEDULE_OCR_IMAGE || process.argv[2];
  if (!file) throw new Error("Indicá la ruta a la captura de tres filas (Fecha, Colaborador, Nahiara Arce).");
  const cachePath = path.resolve(".tmp-schedule-tests");
  fs.mkdirSync(cachePath, { recursive: true });
  const { data, info } = await sharp(file).flatten({ background: "white" }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const source = { data: new Uint8ClampedArray(data), width: info.width, height: info.height };
  const worker = await createWorker(["spa", "eng"], undefined, { cachePath });
  try {
    const words = await readGrid(source, async (pixels, numeric, mode, whitelist) => {
      const input = await sharp(Buffer.from(pixels.data), { raw: { width: pixels.width, height: pixels.height, channels: 4 } }).png().toBuffer();
      await worker.setParameters({ tessedit_pageseg_mode: mode === "7" ? PSM.SINGLE_LINE : PSM.SINGLE_BLOCK, tessedit_char_whitelist: whitelist ?? (numeric ? "0123456789/-" : ""), user_defined_dpi: "300" });
      return (await worker.recognize(input)).data.text;
    });
    const result = parseSchedule(words, 2026, 9);
    if (process.env.SCHEDULE_OCR_CASE === "sectors") {
      const roster = [
        ["AYLIN", "PLANTA / local", "PLANTA / local", "PLANTA / local", "PLANTA / local", "FRANCO", "9 a 16/18 a 20", "15 a 22"],
        ["KAREN", "9 a 18", "FRANCO", "10 A 18", "9 a 15", "16 a 23", "12 a 20", "15 a 22"],
        ["AGOSTINA", "15 a 22", "10 A 18", "FRANCO", "12 A 19", "9 a 16/18 a 20", "16 A 23", "9 a 15/18 a 20"],
        ["VICTORIA", "15 A 22", "FRANCO", "15 A 22", "FRANCO", "16 a 23", "10 a 16/18 a 20", "15 a 22"],
        ["LORENA", "FRANCO", "FRANCO", "10 a 15", "15 A 22", "FRANCO", "9 a 16/18 a 20", "15 a 22"],
        ["YANINA", "10 A 15", "15 A 22", "FRANCO", "15 A 22", "10 a 16/18 a 20", "16 a 23", "17 A 22"],
        ["JOAQUIN", "9 a 15", "10 a 15", "FRANCO", "9 a 15", "9 a 16/18 a 20", "16 a 23", "9 a 15/18 a 20"],
        ["LUDMILA", "FRANCO", "15 A 22", "15 A 22", "FRANCO", "16 A 23", "17 A 23", "10 A 15/18 A 20"],
      ];
      const sectors = [
        ["apoyo", "apoyo", "apoyo", "apoyo", null, "caja", "caja"],
        ["caja", null, "caja", "caja", "caja", "caja", "caja"],
        ["cocina", "caja", null, "apoyo", "caja", "apoyo", "caja"],
        ["salon", null, "salon", null, "salon", "salon", "salon"],
        [null, null, "cocina", "cocina", null, "cocina", "cocina"],
        ["salon", "salon", null, "salon", "salon", "salon", "salon"],
        ["cocina", "cocina", null, "cocina", "cocina", "cocina", "cocina"],
        [null, "cocina", "cocina", null, "cocina", "salon", "salon"],
      ];
      assert.deepEqual(result.rows.map(r => r.excelName), roster.map(r => r[0]));
      roster.forEach((row, index) => {
        assert.equal(Object.keys(result.rows[index].shifts).length, 7, row[0]);
        row.slice(1).forEach((text, col) => assert.deepEqual(result.rows[index].shifts[`2026-09-${String(col + 7).padStart(2, "0")}`], parseShift(text, sectors[index][col] ?? undefined), `${row[0]} día ${col + 7}`));
      });
      assert.equal(result.warnings.length, 1);
      console.log("OCR real: 8 personas, 56 casilleros, turnos cortados y sectores verificados.");
      return;
    }
    assert.equal(result.rows.length, 1);
    assert.equal(result.rows[0].excelName, "NAHIARA ARCE");
    assert.deepEqual(result.rows[0].shifts, {
      "2026-09-07": null,
      "2026-09-08": { from: "10:00", to: "15:00" },
      "2026-09-09": { from: "10:00", to: "16:00" },
      "2026-09-10": null,
      "2026-09-11": { from: "09:00", to: "16:00" },
      "2026-09-12": { from: "19:00", to: "00:00" },
      "2026-09-13": { from: "18:00", to: "23:00" },
    });
    assert.equal(result.warnings.length, 2); // Calendar month and year are explicit assumptions.
    console.log(JSON.stringify(result, null, 2));
    console.log("OCR real: nombre completo y los 7 casilleros verificados.");
  } finally { await worker.terminate(); }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
