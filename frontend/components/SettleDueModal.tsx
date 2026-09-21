"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { useSettleDue } from "@/hooks/useCustomers";
import { useToast } from "@/components/Toast";
import { ApiError } from "@/lib/api";
import { formatMoney } from "@/lib/format";
import type { Customer } from "@/lib/types";

export function SettleDueModal({
  customer,
  sym,
  onClose,
}: {
  customer: Customer;
  sym: string;
  onClose: () => void;
}) {
  const [amount, setAmount] = useState(String(customer.totalDue));
  const settleDue = useSettleDue();
  const { show } = useToast();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const n = Number(amount);
    if (!Number.isFinite(n) || n <= 0) {
      show("Ingresa un monto mayor a 0", "error");
      return;
    }
    try {
      await settleDue.mutateAsync({ id: customer.id, amount: n });
      show(`Pago registrado para ${customer.name}`, "success");
      onClose();
    } catch (err) {
      show(
        err instanceof ApiError ? err.message : "No se pudo registrar el pago",
        "error",
      );
    }
  }

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="settle-due-title"
        className="w-full max-w-sm rounded-xl bg-surface p-6 shadow-xl"
      >
        <div className="mb-5 flex items-center justify-between">
          <h2
            id="settle-due-title"
            className="text-lg font-semibold text-foreground"
          >
            Registrar pago de deuda
          </h2>
          <button
            type="button"
            aria-label="Cerrar diálogo"
            onClick={onClose}
            className="text-foreground/40 hover:text-foreground"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
        <p className="mb-4 text-sm text-foreground/70">
          {customer.name} actualmente debe{" "}
          <span className="font-semibold text-foreground">
            {formatMoney(customer.totalDue, sym)}
          </span>
        </p>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <Field
            label="Monto recibido"
            type="number"
            min={0}
            max={customer.totalDue}
            step="0.01"
            autoFocus
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
          <div className="flex justify-end gap-3">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={settleDue.isPending}>
              Registrar pago
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
