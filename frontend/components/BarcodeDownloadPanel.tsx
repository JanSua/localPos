"use client";

import { useId, useState } from "react";
import { Download, Printer } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { BarcodeCanvas } from "@/components/BarcodeCanvas";
import { useToast } from "@/components/Toast";
import { printBarcodeLabel } from "@/lib/printBarcode";

// Shared by BarcodeLabelModal (Inventory row, after a product is saved) and
// ProductModal (right where the barcode is generated, before saving) — one
// implementation so a fix here applies everywhere the barcode can be
// downloaded. Keeps the browser print and image-download paths in one panel.
export function BarcodeDownloadPanel({
  value,
  name = "",
  showPrintButton = true,
}: {
  value: string;
  name?: string;
  showPrintButton?: boolean;
}) {
  const canvasId = useId();
  const [format, setFormat] = useState<"CODE128" | "QR">("CODE128");
  const [imageType, setImageType] = useState<"png" | "jpg">("png");

  function getCanvas() {
    return document.getElementById(canvasId) as HTMLCanvasElement | null;
  }

  function download() {
    const canvas = getCanvas();
    if (!canvas) return;
    const link = document.createElement("a");
    if (imageType === "jpg") {
      // Canvases are transparent by default and JPEG has no alpha channel,
      // so flatten onto a white background first or the "transparent"
      // areas render black in most viewers.
      const flat = document.createElement("canvas");
      flat.width = canvas.width;
      flat.height = canvas.height;
      const ctx = flat.getContext("2d")!;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, flat.width, flat.height);
      ctx.drawImage(canvas, 0, 0);
      link.download = `${value}.jpg`;
      link.href = flat.toDataURL("image/jpeg", 0.95);
    } else {
      link.download = `${value}.png`;
      link.href = canvas.toDataURL("image/png");
    }
    link.click();
  }

  if (!value) return null;

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => setFormat("CODE128")}
          className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
            format === "CODE128" ? "border-brand bg-brand text-brand-foreground" : "border-border text-foreground/70 hover:bg-surface-muted"
          }`}
        >
          Code128
        </button>
        <button
          type="button"
          onClick={() => setFormat("QR")}
          className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
            format === "QR" ? "border-brand bg-brand text-brand-foreground" : "border-border text-foreground/70 hover:bg-surface-muted"
          }`}
        >
          Código QR
        </button>
      </div>

      <div className="flex justify-center rounded-lg border border-border bg-white p-4">
        <BarcodeCanvas value={value} format={format} id={canvasId} />
      </div>

      <div className="flex items-center justify-center gap-3 text-sm">
        <span className="text-foreground/60">Descargar como</span>
        <label className="flex items-center gap-1.5">
          <input type="radio" name={`${canvasId}-image-type`} checked={imageType === "png"} onChange={() => setImageType("png")} />
          PNG
        </label>
        <label className="flex items-center gap-1.5">
          <input type="radio" name={`${canvasId}-image-type`} checked={imageType === "jpg"} onChange={() => setImageType("jpg")} />
          JPG
        </label>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Button type="button" variant="secondary" onClick={download}>
          <Download className="h-4 w-4" aria-hidden="true" />
          Descargar {imageType.toUpperCase()}
        </Button>
        {showPrintButton && <BarcodePrintButton name={name} value={value} />}
      </div>
    </div>
  );
}

export function BarcodePrintButton({
  name,
  value,
}: {
  name: string;
  value: string;
}) {
  const { show } = useToast();

  async function print() {
    try {
      await printBarcodeLabel(
        name,
        value,
        (error) => {
          show(error.message, "error");
        },
        (printerName) => {
          show(`Etiqueta enviada a ${printerName}`, "success");
        },
      );
    } catch (error) {
      show(
        error instanceof Error
          ? error.message
          : "No se pudo preparar la etiqueta para imprimir",
        "error",
      );
    }
  }

  return (
    <Button
      type="button"
      variant="secondary"
      onClick={print}
      disabled={!name.trim()}
      title={!name.trim() ? "Escribe el nombre del producto para imprimir" : undefined}
    >
      <Printer className="h-4 w-4" aria-hidden="true" />
      Imprimir código de barras
    </Button>
  );
}
