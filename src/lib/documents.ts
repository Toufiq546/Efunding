import { DOC_MAX_BYTES, DOC_MIME } from "./types";

export const DEFAULT_MIME_ERROR = "Upload a PDF, JPG, PNG or WebP file.";

/** Checks a file before upload (the storage bucket enforces the same limits). */
export function validateDocument(file: File, title: string, maxBytes = DOC_MAX_BYTES): string | null {
  if (!title.trim()) return "Give the document a title, e.g. \"Audited accounts 2025\".";
  if (!DOC_MIME.includes(file.type)) return DEFAULT_MIME_ERROR;
  if (file.size > maxBytes) return `The file is too large. The limit is ${Math.round(maxBytes / 1024 / 1024 * 10) / 10} MB.`;
  return null;
}

/** Storage path: "<campaign id>/<random>-<safe file name>" (the folder decides who may read and write it). */
export function docPath(campaignId: string, fileName: string) {
  const safe = fileName.toLowerCase().replace(/[^a-z0-9.]+/g, "-").replace(/^-+|-+$/g, "").slice(-80) || "file";
  return `${campaignId}/${Math.random().toString(36).slice(2, 10)}-${safe}`;
}

export const formatBytes = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
