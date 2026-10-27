"use client";

import { useMemo, useState } from "react";
import { Search, Undo2, X } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { ReceiptActions } from "@/components/ReceiptActions";
import { useInvoices, useInvoice, useVoidInvoice } from "@/hooks/useInvoices";
import { useCreateReturn, useReturnsForInvoice } from "@/hooks/useReturns";
import { useShopSettings } from "@/hooks/useShopSettings";
import { useMe } from "@/hooks/useAuth";
import { useToast } from "@/components/Toast";
import { formatMoney } from "@/lib/format";
import { formatColombiaDate, formatColombiaDateTime } from "@/lib/colombia-time";
import { ApiError } from "@/lib/api";
import type { RefundMethod } from "@/lib/types";

export default function SalesPage() {
  const [search, setSearch] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const { data: invoices, isLoading } = useInvoices(search, from, to);
  const { data: user } = useMe();
  const { data: shop } = useShopSettings();
  const sym = shop?.currencySymbol || "Rs.";

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Ventas</h1>
        <p className="text-sm text-foreground/60">
          Facturas anteriores — haz clic en una para ver o reimprimir.
        </p>
      </div>

      <Card className="p-5">
        <div className="mb-4 flex flex-wrap gap-3">
          <div className="flex min-w-60 flex-1 items-center gap-2 rounded-lg border border-border px-3 py-2">
            <Search className="h-4 w-4 text-foreground/40" aria-hidden="true" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por # de factura, cliente o teléfono…"
              aria-label="Buscar facturas"
              className="w-full bg-transparent text-sm text-foreground outline-none placeholder:text-foreground/40"
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-foreground/60">
            Desde
            <input
              type="date"
              value={from}
              max={to || undefined}
              onChange={(e) => setFrom(e.target.value)}
              aria-label="Filtrar ventas desde la fecha"
              className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground"
            />
          </label>
          <label className="flex items-center gap-2 text-sm text-foreground/60">
            Hasta
            <input
              type="date"
              value={to}
              min={from || undefined}
              onChange={(e) => setTo(e.target.value)}
              aria-label="Filtrar ventas hasta la fecha"
              className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground"
            />
          </label>
        </div>

        {isLoading ? (
          <p className="py-10 text-center text-sm text-foreground/50">
            Cargando…
          </p>
        ) : !invoices || invoices.length === 0 ? (
          <p className="py-10 text-center text-sm text-foreground/50">
            Aún no hay ventas registradas.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-max text-left text-sm">
              <thead>
                <tr className="text-xs uppercase text-foreground/50">
                  <th className="py-2 pr-4">Factura #</th>
                  <th className="py-2 pr-4">Fecha</th>
                  <th className="py-2 pr-4">Cliente</th>
                  <th className="py-2 pr-4">Pago</th>
                  <th className="py-2 text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {invoices.map((inv) => (
                  <tr
                    key={inv.id}
                    onClick={() => setSelectedId(inv.id)}
                    className={`cursor-pointer hover:bg-surface-muted ${inv.status === "VOIDED" ? "opacity-60" : ""}`}
                  >
                    <td className="py-2.5 pr-4 font-medium text-brand">
                      {inv.invoiceNumber}
                      {inv.status === "VOIDED" && (
                        <span className="ml-2 rounded-full bg-danger/10 px-2 py-0.5 text-[10px] font-semibold text-danger">
                          ANULADA
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 pr-4 text-foreground/70">
                      {formatColombiaDateTime(inv.createdAt)}
                    </td>
                    <td className="py-2.5 pr-4 text-foreground/70">
                      {displayCustomerName(inv.customerName)}
                    </td>
                    <td className="py-2.5 pr-4 text-foreground/70">
                      {paymentMethodLabel(inv.paymentMethod)}
                    </td>
                    <td className="py-2.5 text-right font-medium text-foreground">
                      {formatMoney(inv.totalAmount, sym)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {selectedId != null && (
        <InvoiceDrawer
          id={selectedId}
          sym={sym}
          isAdmin={user?.role === "admin"}
          onClose={() => setSelectedId(null)}
        />
      )}
    </div>
  );
}

function InvoiceDrawer({
  id,
  sym,
  isAdmin,
  onClose,
}: {
  id: number;
  sym: string;
  isAdmin: boolean;
  onClose: () => void;
}) {
  const { data: invoice, isLoading } = useInvoice(id);
  const { data: returns } = useReturnsForInvoice(id);
  const createReturn = useCreateReturn();
  const voidInvoice = useVoidInvoice();
  const { show } = useToast();
  const money = (n: number) => formatMoney(n, sym);

  const [returnQty, setReturnQty] = useState<Record<number, number>>({});
  const [refundMethod, setRefundMethod] = useState<RefundMethod>("CASH");
  const [showVoidModal, setShowVoidModal] = useState(false);
  const [voidReason, setVoidReason] = useState("");

  // Quantity already returned per invoice item, summed across every past
  // return — the same unit can't be selected again once it's fully returned.
  const returnedByItem = useMemo(() => {
    const map = new Map<number, number>();
    for (const r of returns ?? []) {
      for (const it of r.items) {
        map.set(
          it.invoiceItemId,
          (map.get(it.invoiceItemId) || 0) + it.quantity,
        );
      }
    }
    return map;
  }, [returns]);
  const isFullyReturned =
    Boolean(invoice && returns?.length) &&
    Boolean(
      invoice?.items.every(
        (item) => (returnedByItem.get(item.id) || 0) === item.quantity,
      ),
    );

  const returnPreview = useMemo(() => {
    if (!invoice) return { count: 0, amount: 0 };
    let count = 0;
    let amount = 0;
    for (const it of invoice.items) {
      const qty = returnQty[it.id] || 0;
      if (qty > 0) {
        count += qty;
        amount += (it.total / it.quantity) * qty;
      }
    }
    return { count, amount: Math.round((amount + Number.EPSILON) * 100) / 100 };
  }, [invoice, returnQty]);

  async function processReturn() {
    if (!invoice || returnPreview.count === 0) return;
    const items = invoice.items
      .filter((it) => (returnQty[it.id] || 0) > 0)
      .map((it) => ({ invoiceItemId: it.id, quantity: returnQty[it.id] }));
    try {
      await createReturn.mutateAsync({
        invoiceId: invoice.id,
        items,
        refundMethod,
      });
      setReturnQty({});
      show(
        `Devueltos ${returnPreview.count} artículo(s) — ${money(returnPreview.amount)} reembolsados`,
        "success",
      );
    } catch (err) {
      show(
        err instanceof ApiError ? err.message : "Error en la devolución",
        "error",
      );
    }
  }

  async function cancelInvoice(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!invoice || invoice.status !== "COMPLETED") return;
    try {
      const result = await voidInvoice.mutateAsync({
        id: invoice.id,
        reason: voidReason.trim(),
      });
      setShowVoidModal(false);
      setVoidReason("");
      show(result.message, "success");
    } catch (err) {
      show(
        err instanceof ApiError ? err.message : "No se pudo anular la venta",
        "error",
      );
    }
  }

  return (
    <div
      className="fixed inset-0 z-40 flex justify-end bg-black/50"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Detalles de factura"
        className="h-full w-full max-w-md overflow-y-auto bg-surface p-6 shadow-xl"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground">
            {invoice?.invoiceNumber || "Factura"}
          </h2>
          <button
            aria-label="Cerrar"
            onClick={onClose}
            className="text-foreground/40 hover:text-foreground"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        {isLoading || !invoice ? (
          <p className="text-sm text-foreground/50">Cargando…</p>
        ) : (
          <div className="flex flex-col gap-4 text-sm">
            <div className="text-foreground/60">
              <p>{formatColombiaDateTime(invoice.createdAt)}</p>
              {invoice.status === "VOIDED" && (
                <p className="font-semibold text-danger">
                  Venta anulada{invoice.voidedAt ? ` el ${formatColombiaDateTime(invoice.voidedAt)}` : ""}
                  {invoice.voidReason ? ` · Motivo: ${invoice.voidReason}` : ""}
                </p>
              )}
              <p>
                {invoice.customerName}
                {invoice.customerPhone ? ` · ${invoice.customerPhone}` : ""}
              </p>
            </div>

            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-left">
                <thead>
                  <tr className="text-xs uppercase text-foreground/50">
                    <th className="p-2">Artículo</th>
                    <th className="p-2 text-right">Cant.</th>
                    <th className="p-2 text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {invoice.items.map((it) => (
                    <tr key={it.id}>
                      <td className="p-2 text-foreground">{it.name}</td>
                      <td className="p-2 text-right text-foreground/70">
                        {it.quantity}
                        {it.unit ? ` ${it.unit}` : ""}
                      </td>
                      <td className="p-2 text-right text-foreground/70">
                        {money(it.total)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex flex-col gap-1">
              <Line label="Subtotal" value={money(invoice.subtotal)} />
              {invoice.discountAmount > 0 && (
                <Line
                  label="Descuento"
                  value={`- ${money(invoice.discountAmount)}`}
                />
              )}
              {invoice.taxAmount > 0 && (
                <Line label="GST (incluido)" value={money(invoice.taxAmount)} />
              )}
              {invoice.loyaltyDiscount > 0 && (
                <Line
                  label={`Lealtad (${invoice.pointsRedeemed} pts)`}
                  value={`- ${money(invoice.loyaltyDiscount)}`}
                />
              )}
              <div className="my-1 border-t border-border" />
              <div className="flex justify-between font-semibold text-foreground">
                <span>Total</span>
                <span>{money(invoice.totalAmount)}</span>
              </div>
              <Line
                label={`Pagado (${paymentMethodLabel(invoice.paymentMethod)})`}
                value={money(invoice.amountPaid)}
              />
              {invoice.changeDue > 0 && (
                <Line label="Cambio" value={money(invoice.changeDue)} />
              )}
              {invoice.pointsEarned > 0 && (
                <Line
                  label="Puntos ganados"
                  value={`${invoice.pointsEarned}`}
                />
              )}
            </div>

            <ReceiptActions invoiceId={id} />

            {isAdmin && invoice.status === "COMPLETED" && (
              <div className="rounded-lg border border-danger/30 p-4">
                <h3 className="text-sm font-semibold text-foreground">Anular venta</h3>
                <p className="mt-1 text-xs text-foreground/60">
                  {isFullyReturned
                    ? "La devolución ya repuso las existencias. La factura se marcará como anulada sin volver a modificar el inventario."
                    : "La factura se conservará como anulada y se repondrán solo las unidades que no se hayan devuelto."}
                  {" "}Se mantienen los pagos y devoluciones ya registrados; esta acción no genera otro reembolso.
                </p>
                <Button
                  type="button"
                  variant="danger"
                  className="mt-3 w-full"
                  onClick={() => setShowVoidModal(true)}
                  disabled={voidInvoice.isPending}
                >
                  {voidInvoice.isPending ? "Anulando…" : "Anular esta venta"}
                </Button>
              </div>
            )}

            {isAdmin && invoice.status === "COMPLETED" && (
              <div className="rounded-lg border border-border p-4">
              <h3 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-foreground">
                <Undo2 className="h-4 w-4" aria-hidden="true" />
                Devolver artículos
              </h3>
              <div className="flex flex-col gap-2">
                {invoice.items.map((it) => {
                  const returnable =
                    it.quantity - (returnedByItem.get(it.id) || 0);
                  if (returnable <= 0) {
                    return (
                      <div
                        key={it.id}
                        className="flex items-center justify-between text-xs text-foreground/40"
                      >
                        <span>{it.name}</span>
                        <span>Devuelto por completo</span>
                      </div>
                    );
                  }

                  return (
                    <div
                      key={it.id}
                      className="flex items-center justify-between gap-3"
                    >
                      <span className="flex-1 truncate text-foreground/80">
                        {it.name}
                      </span>
                      <span className="text-xs text-foreground/40">
                        de {returnable}
                      </span>
                      <input
                        type="number"
                        min={0}
                        max={returnable}
                        value={returnQty[it.id] || ""}
                        onChange={(e) => {
                          const v = Math.max(
                            0,
                            Math.min(returnable, Number(e.target.value) || 0),
                          );
                          setReturnQty((prev) => ({ ...prev, [it.id]: v }));
                        }}
                        placeholder="0"
                        aria-label={`Cantidad a devolver para ${it.name}`}
                        className="w-16 rounded-lg border border-border bg-surface px-2 py-1.5 text-right text-sm text-foreground"
                      />
                    </div>
                  );
                })}
              </div>

              {returnPreview.count > 0 && (
                <>
                  <div className="mt-3 flex items-center gap-2">
                    <select
                      aria-label="Método de reembolso"
                      value={refundMethod}
                      onChange={(e) =>
                        setRefundMethod(e.target.value as RefundMethod)
                      }
                      className="flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground"
                    >
                      <option value="CASH">Reembolso — Efectivo</option>
                      <option value="UPI">Reembolso — UPI</option>
                      <option value="CARD">Reembolso — Tarjeta</option>
                      <option value="DUE_ADJUST" disabled={!invoice.customerId}>
                        Ajustar contra deuda del cliente
                      </option>
                    </select>
                  </div>
                  <div className="mt-2 flex items-center justify-between text-sm">
                    <span className="text-foreground/60">
                      Total del reembolso
                    </span>
                    <span className="font-semibold text-foreground">
                      {money(returnPreview.amount)}
                    </span>
                  </div>
                  <Button
                    type="button"
                    variant="secondary"
                    className="mt-2 w-full"
                    onClick={processReturn}
                    disabled={createReturn.isPending}
                  >
                    {createReturn.isPending
                      ? "Procesando…"
                      : `Procesar devolución (${returnPreview.count})`}
                  </Button>
                </>
              )}

              {returns && returns.length > 0 && (
                <div className="mt-4 flex flex-col gap-1.5 border-t border-border pt-3">
                  <p className="text-xs font-medium uppercase text-foreground/40">
                    Devoluciones anteriores
                  </p>
                  {returns.map((r) => (
                    <div
                      key={r.id}
                      className="flex items-center justify-between text-xs text-foreground/60"
                    >
                      <span>
                        {formatColombiaDate(r.createdAt, { dateStyle: "short" })} ·{" "}
                        {r.items.reduce((s, i) => s + i.quantity, 0)}{" "}
                        artículo(s) ·{" "}
                        {r.refundMethod === "DUE_ADJUST"
                          ? "deuda ajustada"
                          : r.refundMethod === "CASH"
                            ? "efectivo"
                            : r.refundMethod === "UPI"
                              ? "UPI"
                              : r.refundMethod === "CARD"
                                ? "tarjeta"
                                : String(r.refundMethod).toLowerCase()}
                      </span>
                      <span>{money(r.totalRefund)}</span>
                    </div>
                  ))}
                </div>
              )}
              </div>
            )}
          </div>
        )}
      </div>
      {showVoidModal && invoice?.status === "COMPLETED" && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !voidInvoice.isPending) {
              setShowVoidModal(false);
            }
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="void-invoice-title"
            className="w-full max-w-sm rounded-xl bg-surface p-6 shadow-xl"
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 id="void-invoice-title" className="text-lg font-semibold text-foreground">
                Anular venta
              </h2>
              <button
                type="button"
                aria-label="Cerrar diálogo"
                onClick={() => setShowVoidModal(false)}
                disabled={voidInvoice.isPending}
                className="text-foreground/40 hover:text-foreground disabled:opacity-50"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>
            <p className="mb-4 text-sm text-foreground/70">
              Factura <span className="font-semibold text-foreground">{invoice.invoiceNumber}</span>.
              {isFullyReturned
                ? " La devolución ya repuso las existencias; no se modificarán de nuevo ni se hará otro reembolso."
                : " Se repondrán las existencias y no se hará un reembolso de dinero."}
              {" "}La factura se conservará como anulada.
            </p>
            <form onSubmit={cancelInvoice} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label htmlFor="void-reason" className="text-sm font-medium text-foreground">
                  Motivo <span className="font-normal text-foreground/50">(opcional)</span>
                </label>
                <textarea
                  id="void-reason"
                  value={voidReason}
                  onChange={(e) => setVoidReason(e.target.value)}
                  maxLength={200}
                  rows={2}
                  placeholder="Escribe un motivo si lo deseas"
                  className="resize-y rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-foreground placeholder:text-foreground/40 focus:outline-none focus:ring-2 focus:ring-brand"
                />
              </div>
              <div className="flex justify-end gap-3">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setShowVoidModal(false)}
                  disabled={voidInvoice.isPending}
                >
                  Cancelar
                </Button>
                <Button type="submit" variant="danger" disabled={voidInvoice.isPending}>
                  {voidInvoice.isPending ? "Anulando…" : "Confirmar anulación"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function paymentMethodLabel(method: "CASH" | "UPI" | "TRANSFER" | "CARD") {
  return {
    CASH: "Efectivo",
    UPI: "UPI",
    TRANSFER: "Transferencia",
    CARD: "Tarjeta",
  }[method];
}

function displayCustomerName(name: string) {
  return !name || name === "Walk-in Customer" ? "Cliente ocasional" : name;
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-foreground/60">{label}</span>
      <span className="text-foreground">{value}</span>
    </div>
  );
}
