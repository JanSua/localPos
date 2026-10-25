"use client";

import { useEffect, useRef } from "react";
import JsBarcode from "jsbarcode";
import QRCode from "qrcode";

export function BarcodeCanvas({
  value,
  format,
  id,
  className,
}: {
  value: string;
  format: "CODE128" | "QR";
  id: string;
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !value) return;

    if (format === "QR") {
      QRCode.toCanvas(canvas, value, { width: 220, margin: 1 });
      return;
    }

    JsBarcode(canvas, value, { format: "CODE128", width: 2, height: 70, displayValue: true, margin: 8 });
  }, [value, format]);

  return <canvas ref={canvasRef} id={id} className={className} />;
}
