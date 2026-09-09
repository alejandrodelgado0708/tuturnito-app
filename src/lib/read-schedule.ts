import * as XLSX from "xlsx";
import { mergeImports, parseSchedule, type ImportResult, type Word } from "./schedule-import";
import { readGrid, detectGrid, cellSector } from "./schedule-grid";
import { sectorFromRgb } from "./shift-sectors";

export async function readSchedule(file: File, year: number, month?: number): Promise<ImportResult> {
  if (/\.(xlsx|xls)$/i.test(file.name)) {
    const workbook = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true, cellStyles: true });
    return mergeImports(workbook.SheetNames.map(name => {
      const rows = XLSX.utils.sheet_to_json<(string | number | Date)[]>(workbook.Sheets[name], { header: 1, defval: "" });
      const words: Word[] = rows.flatMap((row, y) => row.flatMap((value, x) => {
        const text = value instanceof Date ? `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}` : String(value).trim();
        const style = workbook.Sheets[name][XLSX.utils.encode_cell({ r: y, c: x })]?.s as { fgColor?: { rgb?: string } } | undefined;
        const rgb = style?.fgColor?.rgb?.slice(-6);
        const sector = rgb && /^[\da-f]{6}$/i.test(rgb) ? sectorFromRgb(parseInt(rgb.slice(0, 2), 16), parseInt(rgb.slice(2, 4), 16), parseInt(rgb.slice(4, 6), 16)) : undefined;
        return text ? [{ text, ...(sector ? { sector } : {}), bbox: { x0: x * 300, x1: x * 300 + 100, y0: y * 30, y1: y * 30 + 20 } }] : [];
      }));
      // A month/year in the sheet title is also a valid table heading.
      words.unshift({ text: name, bbox: { x0: 0, x1: 100, y0: -30, y1: -10 } });
      return parseSchedule(words, year, month);
    }));
  }
  const { createWorker, PSM } = await import("tesseract.js");
  let worker: Awaited<ReturnType<typeof createWorker>> | undefined;
  const recognize = async (canvas: HTMLCanvasElement) => {
    worker ??= await createWorker(["spa", "eng"]);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("No se pudo procesar la imagen.");
    const gridWords = await readGrid(context.getImageData(0, 0, canvas.width, canvas.height), async (pixels, numeric, mode, whitelist) => {
      const cell = document.createElement("canvas");
      cell.width = pixels.width; cell.height = pixels.height;
      const cellContext = cell.getContext("2d")!;
      const frame = cellContext.createImageData(pixels.width, pixels.height);
      frame.data.set(pixels.data);
      cellContext.putImageData(frame, 0, 0);
      await worker!.setParameters({ tessedit_pageseg_mode: mode === "7" ? PSM.SINGLE_LINE : PSM.SINGLE_BLOCK, tessedit_char_whitelist: whitelist ?? (numeric ? "0123456789/-" : ""), user_defined_dpi: "300" });
      return (await worker!.recognize(cell)).data.text;
    });
    if (gridWords.some(w => /colaborador|empleado|nombre/i.test(w.text))) return gridWords;
    await worker.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT, preserve_interword_spaces: "1", tessedit_char_whitelist: "" });
    const { data } = await worker.recognize(canvas, {}, { blocks: true, text: true });
    const words = (data.blocks ?? []).flatMap(b => b.paragraphs.flatMap(p => p.lines.flatMap(l => l.words)));
    return words;
  };
  try {
    if (file.type === "application/pdf" || /\.pdf$/i.test(file.name)) {
      const pdfjs = await import("pdfjs-dist");
      pdfjs.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.mjs`;
      const loadingTask = pdfjs.getDocument({ data: await file.arrayBuffer() });
      const pdf = await loadingTask.promise;
      try {
        const documentWords: Word[] = [];
        let pageOffset = 0;
        for (let n = 1; n <= pdf.numPages; n++) {
          const page = await pdf.getPage(n);
          const viewport = page.getViewport({ scale: 2 });
          const content = await page.getTextContent();
          let words: Word[] = content.items.flatMap(item => {
            if (!("str" in item) || !item.str.trim()) return [];
            const tx = pdfjs.Util.transform(viewport.transform, item.transform);
            const height = Math.max(8, Math.hypot(tx[2], tx[3]));
            const width = item.width * viewport.scale;
            return [...item.str.matchAll(/\S+/g)].map(match => ({ text: match[0], bbox: {
              x0: tx[4] + width * match.index / item.str.length,
              x1: tx[4] + width * (match.index + match[0].length) / item.str.length,
              y0: tx[5] - height, y1: tx[5],
            } }));
          });
          const canvas = document.createElement("canvas");
          canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
          await page.render({ canvas, viewport }).promise;
          if (!words.some(w => /colaborador|empleado|nombre/i.test(w.text))) {
            words = await recognize(canvas);
          } else {
            const pixels = canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height);
            const cells = detectGrid(pixels).flat();
            words = words.map(word => {
              const x = (word.bbox.x0 + word.bbox.x1) / 2, y = (word.bbox.y0 + word.bbox.y1) / 2;
              const cell = cells.find(c => x >= c.x0 && x < c.x1 && y >= c.y0 && y < c.y1);
              const sector = cell ? cellSector(pixels, cell) : undefined;
              return sector ? { ...word, sector } : word;
            });
          }
          documentWords.push(...words.map(w => ({ ...w, bbox: { ...w.bbox, y0: w.bbox.y0 + pageOffset, y1: w.bbox.y1 + pageOffset } })));
          pageOffset += viewport.height + 100;
          page.cleanup();
        }
        return parseSchedule(documentWords, year, month);
      } finally { await loadingTask.destroy(); }
    }
    const url = URL.createObjectURL(file);
    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const image = new Image(); image.onload = () => resolve(image); image.onerror = () => reject(new Error("No se pudo abrir la imagen.")); image.src = url;
      });
      const canvas = document.createElement("canvas");
      // Preserve original rule positions; individual cells are enlarged by readGrid.
      canvas.width = img.width; canvas.height = img.height;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("No se pudo procesar la imagen.");
      context.fillStyle = "white"; context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(img, 0, 0, canvas.width, canvas.height);
      return parseSchedule(await recognize(canvas), year, month);
    } finally { URL.revokeObjectURL(url); }
  } finally { await worker?.terminate(); }
}
