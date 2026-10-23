import { useCallback, useEffect, useState } from "react";
import type { Parcel } from "../api/types";
import { useApi } from "../api/ApiContext";
import { ApiError } from "../api/client";
import { parseParcelCsv, type CsvProblem } from "../lib/parcelCsv";

export interface ParcelSet {
  parcels: Parcel[];
  source: "sample" | "upload";
  name: string;
  description?: string;
}

export type ParcelSetStatus =
  | { kind: "idle" }
  | { kind: "loading"; what: "sample" | "file" }
  | { kind: "error"; message: string; problems: CsvProblem[]; fileName?: string }
  | { kind: "notice"; message: string; problems: CsvProblem[]; fileName?: string };

const STORAGE_KEY = "parcel-rates:parcel-set:v1";
export const MAX_FILE_BYTES = 5 * 1024 * 1024;

function readStored(): ParcelSet | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as ParcelSet;
    return Array.isArray(value?.parcels) && value.parcels.length > 0 ? value : null;
  } catch {
    return null;
  }
}

function store(set: ParcelSet | null) {
  try {
    if (set) sessionStorage.setItem(STORAGE_KEY, JSON.stringify(set));
    else sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage full or blocked (private mode): the set stays in memory only.
  }
}

export function useParcelSet() {
  const api = useApi();
  const [set, setSet] = useState<ParcelSet | null>(readStored);
  const [status, setStatus] = useState<ParcelSetStatus>({ kind: "idle" });

  useEffect(() => store(set), [set]);

  const loadSample = useCallback(async () => {
    setStatus({ kind: "loading", what: "sample" });
    try {
      const sample = await api.sampleParcels();
      setSet({ parcels: sample.parcels, source: "sample", name: "Sample mix", description: sample.description });
      setStatus({ kind: "idle" });
    } catch (err) {
      const message =
        err instanceof ApiError ? err.message : "The sample mix could not be loaded. Try again in a moment.";
      setStatus({ kind: "error", message, problems: [] });
    }
  }, [api]);

  const loadFile = useCallback(async (file: File) => {
    if (file.size > MAX_FILE_BYTES) {
      setStatus({
        kind: "error",
        message: `${file.name} is larger than 5 MB. Group identical parcels with the quantity column.`,
        problems: [],
        fileName: file.name,
      });
      return;
    }
    setStatus({ kind: "loading", what: "file" });
    let text: string;
    try {
      text = await file.text();
    } catch {
      setStatus({ kind: "error", message: `${file.name} could not be read.`, problems: [], fileName: file.name });
      return;
    }
    const result = parseParcelCsv(text);
    if (result.errors.length > 0) {
      setStatus({
        kind: "error",
        message: `${file.name} was not loaded: ${result.errors.length} problem${result.errors.length > 1 ? "s" : ""} to fix.`,
        problems: result.errors,
        fileName: file.name,
      });
      return;
    }
    setSet({ parcels: result.parcels, source: "upload", name: file.name });
    setStatus(
      result.warnings.length > 0
        ? { kind: "notice", message: `${file.name} loaded, with notes:`, problems: result.warnings, fileName: file.name }
        : { kind: "idle" },
    );
  }, []);

  const clear = useCallback(() => {
    setSet(null);
    setStatus({ kind: "idle" });
  }, []);

  return { set, status, loadSample, loadFile, clear };
}
