/**
 * Parseo de CSV/Excel e importación de productos de tienda por código.
 * - CSV: usa delimitador elegido (, ; |) y respeta comillas cuando el delimitador es ",".
 * - Excel (.xlsx/.xls): ignora delimitador; cada celda es una columna.
 */
import * as XLSX from "xlsx";
import {
  PRODUCT_IMPORT_OPTIONAL_FIELD_LABELS,
  type ProductImportCsvDelimiter,
  type ProductImportOptionalField,
  type ProductImportOptionalMapping,
} from "@shared/store-product-import";

export type {
  ProductImportCsvDelimiter,
  ProductImportOptionalField,
  ProductImportOptionalMapping,
} from "@shared/store-product-import";

export {
  normalizeProductImportOptionals,
  parseProductImportCsvDelimiter,
  PRODUCT_IMPORT_OPTIONAL_FIELDS,
  PRODUCT_IMPORT_OPTIONAL_FIELD_LABELS,
  PRODUCT_IMPORT_CSV_DELIMITERS,
  isProductImportOptionalField,
} from "@shared/store-product-import";

export type ProductImportColumnMap = {
  codigo: string;
  nombre: string;
  precio: string;
  optionals: ProductImportOptionalMapping[];
};

export type ProductImportRow = {
  rowNumber: number;
  codigo: string;
  name: string;
  price: number;
  description: string | null;
  hasStock: boolean;
  stock: number | null;
  imageUrl: string | null;
  categoryName: string | null;
  subcategoryName: string | null;
  ingredientNames: string[];
  hasWeight: boolean;
  weight: number | null;
};

export type ProductImportParseResult = {
  rows: ProductImportRow[];
  errors: { rowNumber: number; message: string }[];
  headers: string[];
};

function normalizeHeaderKey(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function findColumnIndex(headers: string[], wanted: string): number {
  const target = normalizeHeaderKey(wanted);
  if (!target) return -1;
  return headers.findIndex((h) => normalizeHeaderKey(h) === target);
}

function parsePriceCell(raw: unknown): number | null {
  if (raw == null || raw === "") return null;
  if (typeof raw === "number" && Number.isFinite(raw)) return raw > 0 ? raw : null;
  let s = String(raw).trim();
  if (!s) return null;
  if (s.startsWith('"') && s.endsWith('"') && s.length >= 2) {
    s = s.slice(1, -1).replace(/""/g, '"').trim();
  }
  s = s.replace(/[^\d,.\-]/g, "");
  if (s.includes(",") && s.includes(".")) {
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (s.includes(",")) {
    s = s.replace(",", ".");
  }
  const n = Number(s);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 100) / 100;
}

function parseNonNegativeNumber(raw: unknown): number | null {
  if (raw == null || raw === "") return null;
  if (typeof raw === "number" && Number.isFinite(raw)) return raw >= 0 ? raw : null;
  let s = String(raw).trim();
  if (!s) return null;
  if (s.startsWith('"') && s.endsWith('"') && s.length >= 2) {
    s = s.slice(1, -1).replace(/""/g, '"').trim();
  }
  s = s.replace(/[^\d,.\-]/g, "");
  if (s.includes(",") && s.includes(".")) {
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (s.includes(",")) {
    s = s.replace(",", ".");
  }
  const n = Number(s);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

function parseStockCell(raw: unknown): number | null {
  const n = parseNonNegativeNumber(raw);
  if (n == null) return null;
  return Math.trunc(n);
}

function cellText(raw: unknown): string {
  if (raw == null) return "";
  return String(raw).trim();
}

/** Partir ingredientes dentro de una celda (siempre por coma). */
export function splitIngredientNames(raw: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const part of raw.split(",")) {
    const name = part.trim().replace(/^["']|["']$/g, "").trim();
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(name.slice(0, 120));
    if (out.length >= 80) break;
  }
  return out;
}

function isCsvFileName(fileName: string): boolean {
  return fileName.toLowerCase().endsWith(".csv");
}

/** Parte líneas CSV respetando comillas (permite saltos de línea dentro de "…"). */
function splitCsvRecords(text: string): string[] {
  const records: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (inQuotes) {
      cur += ch;
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cur += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      cur += ch;
      continue;
    }
    if (ch === "\r") continue;
    if (ch === "\n") {
      records.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  if (cur.length > 0) records.push(cur);
  return records;
}

/**
 * Parsea una línea CSV con delimitador.
 * Con "," respeta campos entre comillas dobles (precios/ingredientes con coma).
 */
export function parseCsvLine(line: string, delimiter: ProductImportCsvDelimiter): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      continue;
    }
    if (ch === delimiter) {
      out.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out.map((c) => c.trim());
}

function csvBufferToMatrix(buffer: Buffer, delimiter: ProductImportCsvDelimiter): string[][] {
  const text = buffer.toString("utf8").replace(/^\uFEFF/, "");
  const records = splitCsvRecords(text);
  return records
    .map((line) => parseCsvLine(line, delimiter))
    .filter((row) => row.some((c) => c.trim() !== ""));
}

function excelBufferToMatrix(buffer: Buffer): unknown[][] {
  const workbook = XLSX.read(buffer, { type: "buffer", raw: false });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error("El archivo no tiene hojas.");
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) throw new Error("No se pudo leer la hoja del archivo.");
  return XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: "",
    blankrows: false,
    raw: false,
  }) as unknown[][];
}

function fileToMatrix(
  fileName: string,
  buffer: Buffer,
  delimiter: ProductImportCsvDelimiter,
): unknown[][] {
  if (isCsvFileName(fileName)) {
    return csvBufferToMatrix(buffer, delimiter);
  }
  return excelBufferToMatrix(buffer);
}

export function parseProductImportFile(
  fileName: string,
  buffer: Buffer,
  columns: ProductImportColumnMap,
  delimiter: ProductImportCsvDelimiter = ",",
): ProductImportParseResult {
  let matrix: unknown[][];
  try {
    matrix = fileToMatrix(fileName, buffer, delimiter);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "No se pudo leer el archivo.";
    return { rows: [], errors: [{ rowNumber: 0, message: msg }], headers: [] };
  }

  if (matrix.length === 0) {
    return { rows: [], errors: [{ rowNumber: 0, message: "El archivo está vacío." }], headers: [] };
  }

  const headerRow = (matrix[0] ?? []).map((c) => String(c ?? "").trim());
  const codigoIdx = findColumnIndex(headerRow, columns.codigo);
  const nombreIdx = findColumnIndex(headerRow, columns.nombre);
  const priceIdx = findColumnIndex(headerRow, columns.precio);

  const optionalIdx = new Map<ProductImportOptionalField, number>();
  const missing: string[] = [];
  if (codigoIdx < 0) missing.push(`código «${columns.codigo}»`);
  if (nombreIdx < 0) missing.push(`nombre «${columns.nombre}»`);
  if (priceIdx < 0) missing.push(`precio «${columns.precio}»`);

  for (const opt of columns.optionals) {
    const idx = findColumnIndex(headerRow, opt.column);
    if (idx < 0) {
      missing.push(`${PRODUCT_IMPORT_OPTIONAL_FIELD_LABELS[opt.field]} «${opt.column}»`);
      continue;
    }
    optionalIdx.set(opt.field, idx);
  }

  if (missing.length > 0) {
    return {
      rows: [],
      headers: headerRow,
      errors: [
        {
          rowNumber: 1,
          message: `No se encontraron estas columnas en el archivo: ${missing.join(", ")}. Encabezados detectados: ${headerRow.filter(Boolean).join(", ") || "(ninguno)"}.`,
        },
      ],
    };
  }

  const rows: ProductImportRow[] = [];
  const errors: { rowNumber: number; message: string }[] = [];

  const readOpt = (row: unknown[], field: ProductImportOptionalField): string => {
    const idx = optionalIdx.get(field);
    if (idx == null) return "";
    return cellText(row[idx]);
  };

  for (let i = 1; i < matrix.length; i++) {
    const row = matrix[i] ?? [];
    const rowNumber = i + 1;
    const codigo = cellText(row[codigoIdx]);
    const name = cellText(row[nombreIdx]);
    const price = parsePriceCell(row[priceIdx]);

    const descriptionRaw = readOpt(row, "description");
    const stockRaw = readOpt(row, "stock");
    const imageRaw = readOpt(row, "imageUrl");
    const categoryRaw = readOpt(row, "category");
    const subcategoryRaw = readOpt(row, "subcategory");
    const ingredientsRaw = readOpt(row, "ingredients");
    const weightRaw = readOpt(row, "weight");

    const empty =
      !codigo &&
      !name &&
      (row[priceIdx] == null || cellText(row[priceIdx]) === "") &&
      !descriptionRaw &&
      !stockRaw &&
      !imageRaw &&
      !categoryRaw &&
      !subcategoryRaw &&
      !ingredientsRaw &&
      !weightRaw;
    if (empty) continue;

    if (!codigo) {
      errors.push({ rowNumber, message: "Falta el código." });
      continue;
    }
    if (!name) {
      errors.push({ rowNumber, message: `Falta el nombre (columna «${columns.nombre}»).` });
      continue;
    }
    if (price == null) {
      errors.push({ rowNumber, message: `Precio inválido o vacío (columna «${columns.precio}»).` });
      continue;
    }

    const hasStockMapped = optionalIdx.has("stock");
    let stock: number | null = null;
    if (hasStockMapped) {
      if (!stockRaw) {
        stock = 0;
      } else {
        const parsedStock = parseStockCell(stockRaw);
        if (parsedStock == null) {
          errors.push({ rowNumber, message: "Stock inválido (columna mapeada a stock)." });
          continue;
        }
        stock = parsedStock;
      }
    }

    const hasWeightMapped = optionalIdx.has("weight");
    let weight: number | null = null;
    if (hasWeightMapped) {
      if (!weightRaw) {
        weight = 0;
      } else {
        const parsedWeight = parseNonNegativeNumber(weightRaw);
        if (parsedWeight == null) {
          errors.push({ rowNumber, message: "Peso inválido (columna mapeada a peso)." });
          continue;
        }
        weight = Math.round(parsedWeight * 1000) / 1000;
      }
    }

    const imageUrl = imageRaw ? imageRaw.slice(0, 2000) : null;

    rows.push({
      rowNumber,
      codigo: codigo.slice(0, 120),
      name: name.slice(0, 200),
      price,
      description: descriptionRaw ? descriptionRaw.slice(0, 5000) : null,
      hasStock: hasStockMapped,
      stock: hasStockMapped ? stock : null,
      imageUrl,
      categoryName: categoryRaw ? categoryRaw.slice(0, 120) : null,
      subcategoryName: subcategoryRaw ? subcategoryRaw.slice(0, 120) : null,
      ingredientNames: ingredientsRaw ? splitIngredientNames(ingredientsRaw) : [],
      hasWeight: hasWeightMapped,
      weight: hasWeightMapped ? weight : null,
    });
  }

  return { rows, errors, headers: headerRow };
}
