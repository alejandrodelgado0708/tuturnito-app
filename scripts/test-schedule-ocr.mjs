// Regression for the user's three-row September screenshot. The image stays local.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { createWorker, PSM } from "tesseract.js";
import { readGrid } from "../.tmp-schedule-tests/schedule-grid.js";
import { parseSchedule } from "../.tmp-schedule-tests/schedule-import.js";

async function main() {
  const file = process.env.SCHEDULE_OCR_IMAGE || process.argv[2];
  if (!file) throw new Error("Indicá la ruta a la captura de tres filas (Fecha, Colaborador, Nahiara Arce).");
  const cachePath = path.resolve(".tmp-schedule-tests");
  fs.mkdirSync(cachePath, { recursive: true });
  const { data, info } = await sharp(file).flatten({ background: "white" }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const source = { data: new Uint8ClampedArray(data), width: info.width, height: info.height };
  const worker = await createWorker(["spa", "eng"], undefined, { cachePath });
  try {
    const words = await readGrid(source, async (pixels, numeric, mode) => {
      const input = await sharp(Buffer.from(pixels.data), { raw: { width: pixels.width, height: pixels.height, channels: 4 } }).png().toBuffer();
      await worker.setParameters({ tessedit_pageseg_mode: mode === "7" ? PSM.SINGLE_LINE : PSM.SINGLE_BLOCK, tessedit_char_whitelist: numeric ? "0123456789/-" : "", user_defined_dpi: "300" });
      return (await worker.recognize(input)).data.text;
    });
    const result = parseSchedule(words, 2026, 9);
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
