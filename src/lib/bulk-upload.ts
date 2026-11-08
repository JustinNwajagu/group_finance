import "server-only";
import * as XLSX from "xlsx";
import { memberSortKey } from "./member-sort";
import type { MemberRow } from "./store";

export type BulkSheet = {
  /** Filename stem — used as contribution/dues title. */
  title: string;
  headers: string[];
  rows: Record<string, string>[];
};

export type BulkValidationIssue = {
  row: number;
  message: string;
};

function normalizeHeader(h: string): string {
  return h.trim().toLowerCase().replace(/[\s_]+/g, " ");
}

const HEADER_ALIASES: Record<string, string[]> = {
  member: ["member", "name", "full name", "member name"],
  amount: ["amount", "amount paid", "paid", "naira", "ngn"],
  status: ["status"],
  payment_date: ["payment date", "date", "paid date", "payment_date"],
  notes: ["notes", "note", "remark", "remarks", "comment"],
};

function mapHeader(raw: string): string | null {
  const key = normalizeHeader(raw);
  for (const [canonical, aliases] of Object.entries(HEADER_ALIASES)) {
    if (aliases.includes(key)) return canonical;
  }
  return null;
}

export function documentTitleFromFilename(filename: string): string {
  const base = filename.split(/[/\\]/).pop() ?? filename;
  return base.replace(/\.[^.]+$/, "").replace(/[_]+/g, " ").trim();
}

export function yearFromTitle(title: string): number | null {
  const match = title.match(/\b(20\d{2})\b/);
  if (!match) return null;
  const year = Number(match[1]);
  return Number.isFinite(year) ? year : null;
}

export async function parseUploadedSheet(
  file: File,
): Promise<BulkSheet | { error: string }> {
  const filename = file.name?.trim() || "upload";
  const title = documentTitleFromFilename(filename);
  if (!title) {
    return { error: "Upload a file with a name to use as the title." };
  }

  const lower = filename.toLowerCase();
  if (
    !lower.endsWith(".csv") &&
    !lower.endsWith(".xlsx") &&
    !lower.endsWith(".xls")
  ) {
    return {
      error: "Upload a CSV or Excel file (.csv, .xlsx, .xls).",
    };
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  if (buffer.byteLength === 0) {
    return { error: "The uploaded file is empty." };
  }

  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
  } catch {
    return { error: "Could not read that spreadsheet. Check the file format." };
  }

  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return { error: "The spreadsheet has no sheets." };
  const sheet = workbook.Sheets[sheetName];
  const matrix = XLSX.utils.sheet_to_json<(string | number | Date | null)[]>(
    sheet,
    {
      header: 1,
      defval: "",
      raw: false,
    },
  ) as unknown as Array<Array<string | number | Date | null>>;

  if (matrix.length < 2) {
    return {
      error: "The sheet needs a header row and at least one data row.",
    };
  }

  const headerCells = (matrix[0] ?? []).map((c) => String(c ?? "").trim());
  if (headerCells.every((h) => !h)) {
    return { error: "The first row must contain column headers." };
  }

  const headers = headerCells.map((h) => mapHeader(h));
  const mappedNames = headers.filter((h): h is string => Boolean(h));
  const rows: Record<string, string>[] = [];

  for (let i = 1; i < matrix.length; i += 1) {
    const line = matrix[i] ?? [];
    const empty = line.every((c) => String(c ?? "").trim() === "");
    if (empty) continue;
    const row: Record<string, string> = {};
    headerCells.forEach((original, idx) => {
      const mapped = headers[idx];
      if (!mapped) return;
      const cell = line[idx];
      let value = "";
      if (cell instanceof Date) {
        value = cell.toISOString().slice(0, 10);
      } else {
        value = String(cell ?? "").trim();
      }
      row[mapped] = value;
    });
    rows.push(row);
  }

  return {
    title,
    headers: mappedNames,
    rows,
  };
}

export function requireColumns(
  sheet: BulkSheet,
  required: string[],
): BulkValidationIssue[] {
  const have = new Set(sheet.headers);
  const missing = required.filter((c) => !have.has(c));
  if (missing.length === 0) return [];
  return [
    {
      row: 0,
      message: `Missing required column(s): ${missing
        .map((c) => c.replace("_", " "))
        .join(", ")}. Found: ${
        sheet.headers.length
          ? sheet.headers.map((h) => h.replace("_", " ")).join(", ")
          : "(none)"
      }.`,
    },
  ];
}

export function matchMember(
  members: MemberRow[],
  rawName: string,
): MemberRow | null {
  const needle = rawName.trim();
  if (!needle) return null;
  const exact = members.find(
    (m) => m.name.localeCompare(needle, undefined, { sensitivity: "base" }) === 0,
  );
  if (exact) return exact;
  const key = memberSortKey(needle).toLowerCase();
  const byKey = members.filter(
    (m) => memberSortKey(m.name).toLowerCase() === key,
  );
  if (byKey.length === 1) return byKey[0];
  return null;
}

export function parseMoneyCell(raw: string): number | null {
  const cleaned = raw.replace(/[₦,\s]/g, "").trim();
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

export function parseStatusCell(raw: string): "paid" | "pledge" | null {
  const v = raw.trim().toLowerCase();
  if (!v) return "paid";
  if (v === "paid" || v === "pay" || v === "complete") return "paid";
  if (v === "pledge" || v === "pledged" || v === "promise") return "pledge";
  return null;
}

export function parseDateCell(raw: string): string | null {
  const v = raw.trim();
  if (!v) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}
