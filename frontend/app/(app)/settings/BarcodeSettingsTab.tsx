"use client";

import { useEffect, useId, useState } from "react";
import { Printer } from "lucide-react";
import { BarcodeCanvas } from "@/components/BarcodeCanvas";
import { useToast } from "@/components/Toast";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import {
  BARCODE_LABEL_OPTIONS_STORAGE_KEY,
  DEFAULT_BARCODE_LABEL_OPTIONS,
  MAX_BARCODE_LABEL_FONT_SIZE,
  MAX_BARCODE_LABEL_WIDTH_MM,
  MIN_BARCODE_LABEL_FONT_SIZE,
  MIN_BARCODE_LABEL_WIDTH_MM,
  printBarcodeLabel,
  type BarcodeLabelOptions,
} from "@/lib/printBarcode";

const TEST_PRODUCT_NAME = "PRUEBA DE IMPRESIÓN";
const TEST_BARCODE = "123456789012";

function isBarcodeLabelOptions(value: unknown): value is BarcodeLabelOptions {
  if (!value || typeof value !== "object") return false;
  const options = value as Partial<BarcodeLabelOptions>;
  return (
    typeof options.widthMm === "number" &&
    options.widthMm >= MIN_BARCODE_LABEL_WIDTH_MM &&
    options.widthMm <= MAX_BARCODE_LABEL_WIDTH_MM &&
    typeof options.fontSize === "number" &&
    options.fontSize >= MIN_BARCODE_LABEL_FONT_SIZE &&
    options.fontSize <= MAX_BARCODE_LABEL_FONT_SIZE &&
    (options.showProductName === undefined ||
      typeof options.showProductName === "boolean")
  );
}

export function BarcodeSettingsTab() {
  const previewId = useId();
  const { show } = useToast();
  const [options, setOptions] = useState<BarcodeLabelOptions>(
    DEFAULT_BARCODE_LABEL_OPTIONS,
  );
  const [loaded, setLoaded] = useState(false);
  const [printing, setPrinting] = useState(false);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(
        BARCODE_LABEL_OPTIONS_STORAGE_KEY,
      );
      if (saved) {
        const parsed: unknown = JSON.parse(saved);
        if (!isBarcodeLabelOptions(parsed)) {
          throw new Error("Los ajustes guardados de etiqueta no son válidos");
        }
        setOptions({
          widthMm: parsed.widthMm,
          fontSize: parsed.fontSize,
          showProductName:
            parsed.showProductName ??
            DEFAULT_BARCODE_LABEL_OPTIONS.showProductName,
        });
      }
    } catch (error) {
      console.error("[Código de barras] No se pudieron cargar los ajustes", error);
      show("No se pudieron cargar los ajustes guardados de etiqueta", "error");
    } finally {
      setLoaded(true);
    }
  }, [show]);

  useEffect(() => {
    if (!loaded) return;
    try {
      window.localStorage.setItem(
        BARCODE_LABEL_OPTIONS_STORAGE_KEY,
        JSON.stringify(options),
      );
    } catch (error) {
      console.error("[Código de barras] No se pudieron guardar los ajustes", error);
      show("No se pudieron guardar los ajustes de etiqueta en este navegador", "error");
    }
  }, [loaded, options, show]);

  async function printTestLabel() {
    setPrinting(true);
    try {
      await printBarcodeLabel(
        TEST_PRODUCT_NAME,
        TEST_BARCODE,
        (error) => show(error.message, "error"),
        (printerName) => show(`Etiqueta enviada a ${printerName}`, "success"),
        options,
      );
    } finally {
      setPrinting(false);
    }
  }

  const previewWidth = `${options.widthMm * (96 / 25.4)}px`;

  return (
    <Card className="max-w-3xl p-6">
      <div className="flex flex-col gap-6">
        <div>
          <h2 className="text-lg font-semibold text-foreground">
            Etiquetas de código de barras
          </h2>
          <p className="mt-1 text-sm text-foreground/60">
            Ajusta la etiqueta DYMO y revisa el resultado antes de imprimir una
            prueba. Estos parámetros se guardan en este navegador.
          </p>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <label className="flex flex-col gap-2 text-sm font-medium text-foreground">
            <span className="flex justify-between gap-3">
              <span>Ancho de la etiqueta</span>
              <span>{options.widthMm} mm</span>
            </span>
            <input
              type="range"
              min={MIN_BARCODE_LABEL_WIDTH_MM}
              max={MAX_BARCODE_LABEL_WIDTH_MM}
              step="1"
              value={options.widthMm}
              onChange={(event) =>
                setOptions((current) => ({
                  ...current,
                  widthMm: Number(event.target.value),
                }))
              }
              aria-label="Ancho de la etiqueta en milímetros"
            />
            <span className="text-xs font-normal text-foreground/60">
              En cinta de 9 mm, este valor cambia el largo de impresión; el
              ancho físico de la cinta no cambia.
            </span>
          </label>

          <label className="flex flex-col gap-2 text-sm font-medium text-foreground">
            <span className="flex justify-between gap-3">
              <span>Tamaño de letra</span>
              <span>{options.fontSize} pt</span>
            </span>
            <input
              type="range"
              min={MIN_BARCODE_LABEL_FONT_SIZE}
              max={MAX_BARCODE_LABEL_FONT_SIZE}
              step="0.2"
              value={options.fontSize}
              onChange={(event) =>
                setOptions((current) => ({
                  ...current,
                  fontSize: Number(event.target.value),
                }))
              }
              aria-label="Tamaño de letra en puntos"
            />
          </label>
        </div>

        <label className="flex items-center gap-2 text-sm text-foreground/70">
          <input
            type="checkbox"
            checked={options.showProductName}
            onChange={(event) =>
              setOptions((current) => ({
                ...current,
                showProductName: event.target.checked,
              }))
            }
          />
          Imprimir el nombre del producto al lado del código
        </label>

        <div>
          <h3 className="mb-2 text-sm font-medium text-foreground">
            Vista previa (cinta de 9 mm)
          </h3>
          <div className="overflow-x-auto rounded-lg border border-border bg-surface-muted p-4">
            <div
              className="flex items-center gap-2 overflow-hidden bg-white px-2 text-black"
              style={{ width: previewWidth, height: "9mm" }}
            >
              <div className="flex min-w-0 flex-[2] justify-center overflow-hidden">
                <BarcodeCanvas
                  id={previewId}
                  value={TEST_BARCODE}
                  format="CODE128"
                  className="max-h-[8mm] max-w-full object-contain"
                />
              </div>
              {options.showProductName && <span
                className="min-w-0 flex-1 truncate text-center leading-none"
                style={{ fontSize: `${options.fontSize}pt` }}
              >
                {TEST_PRODUCT_NAME}
              </span>}
            </div>
          </div>
        </div>

        <Button
          type="button"
          onClick={printTestLabel}
          disabled={printing}
          className="self-start"
        >
          <Printer className="h-4 w-4" aria-hidden="true" />
          {printing ? "Enviando prueba…" : "Imprimir etiqueta de prueba"}
        </Button>
      </div>
    </Card>
  );
}
