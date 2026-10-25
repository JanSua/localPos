"use client";

import { Download, Printer } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { openReceiptPrint } from "@/lib/print";

export function ReceiptActions({ invoiceId, className }: { invoiceId: number; className?: string }) {
  return (
    <div className={`flex flex-wrap gap-2 ${className || ""}`}>
      <Button type="button" variant="secondary" onClick={() => openReceiptPrint(invoiceId)}>
        <Printer className="h-4 w-4" aria-hidden="true" />
        Imprimir
      </Button>
      <a href={`/api/print/${invoiceId}/pdf`} download className="contents">
        <Button type="button" variant="secondary">
          <Download className="h-4 w-4" aria-hidden="true" />
          Descargar PDF
        </Button>
      </a>
    </div>
  );
}
