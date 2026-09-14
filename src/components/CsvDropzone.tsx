"use client";

import { useState } from "react";
import { UploadCloud, FileCheck2 } from "lucide-react";

export default function CsvDropzone({
  file,
  onFileChange,
  label = "Invitee list (CSV: id, name, phone, email)",
}: {
  file: File | null;
  onFileChange: (file: File | null) => void;
  label?: string;
}) {
  const [dragOver, setDragOver] = useState(false);

  return (
    <div>
      <span className="mb-1.5 block text-xs font-medium text-slate-600">
        {label}
      </span>
      <label
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const f = e.dataTransfer.files?.[0];
          if (f) onFileChange(f);
        }}
        className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-4 py-8 text-center transition-colors ${
          dragOver
            ? "border-accent bg-accent-soft"
            : file
              ? "border-emerald-300 bg-emerald-50"
              : "border-border bg-slate-50 hover:border-accent/50 hover:bg-accent-soft/50"
        }`}
      >
        {file ? (
          <>
            <FileCheck2 className="h-6 w-6 text-emerald-600" />
            <span className="text-sm font-medium text-emerald-800">
              {file.name}
            </span>
            <span className="text-xs text-emerald-700/80">
              Click to choose a different file
            </span>
          </>
        ) : (
          <>
            <UploadCloud className="h-6 w-6 text-slate-400" />
            <span className="text-sm font-medium text-slate-600">
              Drag & drop your CSV, or click to browse
            </span>
            <span className="text-xs text-muted">
              Header row required: id,name,phone,email
            </span>
          </>
        )}
        <input
          required
          type="file"
          accept=".csv,text/csv"
          onChange={(e) => onFileChange(e.target.files?.[0] ?? null)}
          className="sr-only"
        />
      </label>
    </div>
  );
}
