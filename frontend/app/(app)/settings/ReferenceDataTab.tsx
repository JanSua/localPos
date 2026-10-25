"use client";

import { useState } from "react";
import { Search, Upload } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Field } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/Toast";
import { ApiError, api } from "@/lib/api";
import {
  useImportIfsc,
  useImportPincodes,
  useImportTaxCodes,
  useMastersSummary,
  type IfscRecord,
} from "@/hooks/useMasters";

// Los catálogos de referencia HSN/SAC, códigos PIN e IFSC no se incluyen
// con la aplicación porque son grandes y se actualizan con frecuencia.
// Importa los archivos CSV vigentes cuando los tengas disponibles.
export function ReferenceDataTab() {
  const { data: summary } = useMastersSummary();

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <TaxCodeImportCard count={summary} />
      <PinCodeImportCard count={summary?.pincodes} />
      <IfscCard count={summary?.ifsc} />
    </div>
  );
}

function ImportRow({
  label,
  hint,
  onImport,
  isPending,
}: {
  label: string;
  hint: string;
  onImport: (file: File) => void;
  isPending: boolean;
}) {
  const [file, setFile] = useState<File | null>(null);
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border p-3">
      <p className="text-sm font-medium text-foreground">{label}</p>
      <p className="text-xs text-foreground/50">{hint}</p>
      <div className="flex items-center gap-2">
        <input
          type="file"
          accept=".csv,text/csv"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="flex-1 text-xs text-foreground/70 file:mr-3 file:rounded-md file:border-0 file:bg-surface-muted file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-foreground"
        />
        <Button
          type="button"
          variant="secondary"
          disabled={!file || isPending}
          onClick={() => file && onImport(file)}
        >
          <Upload className="h-4 w-4" aria-hidden="true" />
          Importar
        </Button>
      </div>
    </div>
  );
}

function TaxCodeImportCard({ count }: { count?: { hsn: number; sac: number } }) {
  const { show } = useToast();
  const importTaxCodes = useImportTaxCodes();

  async function handle(type: "HSN" | "SAC", file: File) {
    try {
      const res = await importTaxCodes.mutateAsync({ type, file });
      show(`Se importaron ${res.imported} códigos ${type}`, "success");
    } catch (err) {
      show(err instanceof ApiError ? err.message : `No se pudieron importar los códigos ${type}`, "error");
    }
  }

  return (
    <Card className="p-6">
      <h2 className="mb-1 text-base font-semibold text-foreground">Códigos HSN / SAC</h2>
      <p className="mb-4 text-sm text-foreground/60">
        {count
          ? `${count.hsn} códigos HSN + ${count.sac} códigos SAC cargados`
          : "Aún no hay datos cargados"} — habilita
        las sugerencias del campo HSN/SAC de los productos.
      </p>
      <div className="flex flex-col gap-3">
        <ImportRow
          label="Códigos HSN"
          hint='Encabezados CSV: code, description, gstRate (opcional; deben conservarse en inglés). Fuente: directorio HSN del CBIC.'
          onImport={(f) => handle("HSN", f)}
          isPending={importTaxCodes.isPending}
        />
        <ImportRow
          label="Códigos SAC"
          hint='Encabezados CSV: code, description, gstRate (opcional; deben conservarse en inglés). Fuente: directorio SAC del CBIC.'
          onImport={(f) => handle("SAC", f)}
          isPending={importTaxCodes.isPending}
        />
      </div>
    </Card>
  );
}

function PinCodeImportCard({ count }: { count?: number }) {
  const { show } = useToast();
  const importPincodes = useImportPincodes();

  async function handle(file: File) {
    try {
      const res = await importPincodes.mutateAsync(file);
      show(`Se importaron ${res.imported} códigos PIN`, "success");
    } catch (err) {
      show(err instanceof ApiError ? err.message : "No se pudieron importar los códigos PIN", "error");
    }
  }

  return (
    <Card className="p-6">
      <h2 className="mb-1 text-base font-semibold text-foreground">Códigos PIN</h2>
      <p className="mb-4 text-sm text-foreground/60">
        {count ? `${count} códigos PIN cargados` : "Aún no hay datos cargados"} — permite completar automáticamente
        la ciudad y el estado a partir del código PIN en la configuración de empresa.
      </p>
      <ImportRow
        label="Directorio de códigos PIN"
        hint="Encabezados CSV: pincode, area, district, state (deben conservarse en inglés). Fuente: directorio de códigos PIN de India Post / data.gov.in."
        onImport={handle}
        isPending={importPincodes.isPending}
      />
    </Card>
  );
}

function IfscCard({ count }: { count?: number }) {
  const { show } = useToast();
  const importIfsc = useImportIfsc();
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<IfscRecord | null>(null);
  const [searching, setSearching] = useState(false);

  async function handleImport(file: File) {
    try {
      const res = await importIfsc.mutateAsync(file);
      show(`Se importaron ${res.imported} códigos IFSC`, "success");
    } catch (err) {
      show(err instanceof ApiError ? err.message : "No se pudieron importar los códigos IFSC", "error");
    }
  }

  async function lookup() {
    if (!query.trim()) return;
    setSearching(true);
    setResult(null);
    try {
      const record = await api.get<IfscRecord>(`/masters/ifsc/${encodeURIComponent(query.trim().toUpperCase())}`);
      setResult(record);
    } catch (err) {
      show(err instanceof ApiError ? err.message : "No se encontró el código IFSC", "info");
    } finally {
      setSearching(false);
    }
  }

  return (
    <Card className="p-6">
      <h2 className="mb-1 text-base font-semibold text-foreground">Códigos IFSC</h2>
      <p className="mb-4 text-sm text-foreground/60">
        {count ? `${count} códigos IFSC cargados` : "Aún no hay datos cargados"} — herramienta para consultar bancos y sucursales.
      </p>
      <ImportRow
        label="Directorio IFSC"
        hint="Encabezados CSV: ifsc, bank, branch, address, district, state (deben conservarse en inglés). Fuente: directorio IFSC del RBI."
        onImport={handleImport}
        isPending={importIfsc.isPending}
      />
      <div className="mt-4 flex items-end gap-2">
        <div className="flex-1">
          <Field
            label="Consultar un código IFSC"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Por ejemplo, SBIN0001234"
          />
        </div>
        <Button type="button" variant="secondary" onClick={lookup} disabled={searching} aria-label="Buscar código IFSC">
          <Search className="h-4 w-4" aria-hidden="true" />
        </Button>
      </div>
      {result && (
        <div className="mt-3 rounded-lg bg-surface-muted p-3 text-sm text-foreground/80">
          <p className="font-medium text-foreground">{result.bank}</p>
          <p>{result.branch}</p>
          <p className="text-foreground/60">{result.address}</p>
          <p className="text-foreground/60">
            {[result.district, result.state].filter(Boolean).join(", ")}
          </p>
        </div>
      )}
    </Card>
  );
}
