"use client";

import { useRef, useState } from "react";
import { AssetEntry, MovementEntry } from "@/types/database";
import { parsePortfolioCsv, parseMovementsCsv } from "./helpers";

type Props =
  | {
      kind: "portfolio";
      onParsed: (rows: AssetEntry[]) => void;
      onError: (msg: string) => void;
    }
  | {
      kind: "movement";
      defaultType: "Income" | "Expense";
      onParsed: (rows: MovementEntry[]) => void;
      onError: (msg: string) => void;
    };

export default function CsvImportPanel(props: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);

  const handleFile = async (file: File) => {
    setFileName(file.name);
    try {
      const text = await file.text();
      if (props.kind === "portfolio") {
        const result = parsePortfolioCsv(text);
        if (!result.ok) {
          props.onError(result.error);
          return;
        }
        props.onParsed(result.rows);
      } else {
        const result = parseMovementsCsv(text, props.defaultType);
        if (!result.ok) {
          props.onError(result.error);
          return;
        }
        props.onParsed(result.rows);
      }
    } catch {
      props.onError("Não foi possível ler o arquivo.");
    }
  };

  return (
    <div className="space-y-3">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const f = e.dataTransfer.files?.[0];
          if (f) void handleFile(f);
        }}
        onClick={() => inputRef.current?.click()}
        className={`cursor-pointer rounded-2xl border-2 border-dashed p-6 text-center transition-colors ${
          dragOver
            ? "border-primary bg-primary/5"
            : "border-slate-200 dark:border-slate-700 hover:border-primary/50"
        }`}
      >
        <span className="material-symbols-outlined text-3xl text-primary mb-2 block">upload_file</span>
        <p className="text-sm font-bold text-foreground">
          {props.kind === "portfolio"
            ? "CSV ou JSON do Financial Reader"
            : "CSV ou JSON de movimentações"}
        </p>
        <p className="text-xs text-slate-500 mt-1">
          {props.kind === "portfolio"
            ? "Colunas: Date, Classification, Institution, Asset, Value"
            : "Colunas: Date, Description, Category, Type, Value"}
        </p>
        {fileName && (
          <p className="text-xs font-medium text-primary mt-3 truncate">{fileName}</p>
        )}
        <input
          ref={inputRef}
          type="file"
          accept=".csv,.json,text/csv,application/json"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void handleFile(f);
          }}
        />
      </div>
    </div>
  );
}
