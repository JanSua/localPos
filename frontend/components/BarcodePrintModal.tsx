"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { useShopSettings } from "@/hooks/useShopSettings";
import { useToast } from "@/components/Toast";
import { Button } from "@/components/ui/Button";
import {
  printBarcodeLabel,
} from "@/lib/printBarcode";

export function BarcodePrintModal({
  name,
  value,
  printerName,
  onClose,
}: {
  name: string;
  value: string;
  printerName: string;
  onClose: () => void;
}) {
  const { refetch } = useShopSettings();
  const { show } = useToast();
  const [copies, setCopies] = useState(1);
  const [printing, setPrinting] = useState(false);

  async function print() {
    if (!Number.isInteger(copies) || copies < 1 || copies > 6) return;
    setPrinting(true);
    try {
      const { data: settings, error } = await refetch();
      if (error) throw error;
      if (!settings) throw new Error("No se pudo cargar la configuración de la tienda.");

      await printBarcodeLabel(
        name,
        value,
        (printError) => show(printError.message, "error"),
        (connectedPrinter) => {
          show(`${copies} etiqueta(s) enviada(s) a ${connectedPrinter}`, "success");
          onClose();
        },
        undefined,
        settings.barcodeLabelShowProductName,
        copies,
        printerName,
      );
    } catch (error) {
      show(
        error instanceof Error
          ? error.message
          : "No se pudo preparar la impresión",
        "error",
      );
    } finally {
      setPrinting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="barcode-print-title"
    >
      <div className="w-full max-w-sm rounded-xl bg-surface p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2
            id="barcode-print-title"
            className="text-lg font-semibold text-foreground"
          >
            Imprimir código de barras
          </h2>
          <button
            type="button"
            aria-label="Cerrar diálogo"
            onClick={onClose}
            disabled={printing}
            className="text-foreground/40 hover:text-foreground"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
        <div className="flex flex-col gap-4">
          <p className="text-sm text-foreground/70">
            Imprimirás el código de barras de <strong>{name}</strong>.
          </p>
          <p className="text-sm text-foreground/70">
            Impresora conectada: <strong>{printerName}</strong>
          </p>
          <label className="flex flex-col gap-1 text-sm font-medium text-foreground">
            ¿Cuántas etiquetas deseas imprimir? (1–6)
            <input
              type="number"
              min={1}
              max={6}
              step={1}
              value={copies}
              onChange={(event) => setCopies(Number(event.target.value))}
              className="rounded-lg border border-border bg-surface px-3 py-2"
            />
          </label>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={onClose}
              disabled={printing}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={print}
              disabled={printing || !Number.isInteger(copies) || copies < 1 || copies > 6}
            >
              {printing ? "Imprimiendo…" : `Imprimir ${copies}`}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
