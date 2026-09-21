"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Camera,
  Minus,
  Plus,
  ScanBarcode,
  Trash2,
  Search,
  Star,
  CheckCircle2,
  X,
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { ReceiptActions } from "@/components/ReceiptActions";
import { ReturnPanel, type ReturnDraftLine } from "@/components/ReturnPanel";
import { CameraScannerModal } from "@/components/CameraScannerModal";
import { useBarcodeScanner } from "@/hooks/useBarcodeScanner";
import { useProducts } from "@/hooks/useProducts";
import { useShopSettings } from "@/hooks/useShopSettings";
import { useToast } from "@/components/Toast";
import { usePasswordConfirm } from "@/components/PasswordConfirm";
import { api, ApiError, describeApiError } from "@/lib/api";
import { formatMoney, round2 } from "@/lib/format";
import { openReceiptPrint } from "@/lib/print";
import { effectivePrice, quoteSale } from "@/lib/quote";
import type {
  CartItem,
  Customer,
  Invoice,
  PaymentMethod,
  Product,
} from "@/lib/types";

export default function PosPage() {
  const { data: shop } = useShopSettings();
  const { show } = useToast();
  const { withPasswordConfirm } = usePasswordConfirm();
  const queryClient = useQueryClient();

  const [cart, setCart] = useState<CartItem[]>([]);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [duePaid, setDuePaid] = useState("");
  const [returnLines, setReturnLines] = useState<ReturnDraftLine[]>([]);
  const [refundMode, setRefundMode] = useState<"CASH" | "CREDIT">("CASH");
  const [useCredit, setUseCredit] = useState(false);
  const [discountType, setDiscountType] = useState<"percent" | "amount" | null>(
    null,
  );
  const [discountValue, setDiscountValue] = useState(0);
  const [pointsRedeemed, setPointsRedeemed] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("CASH");
  const [amountPaid, setAmountPaid] = useState("");
  const [isCheckingOut, setIsCheckingOut] = useState(false);
  const [completedSale, setCompletedSale] = useState<{
    id: number;
    invoiceNumber: string;
    totalAmount: number;
  } | null>(null);
  const [cameraScannerOpen, setCameraScannerOpen] = useState(false);

  // Manual add — the fallback for when the barcode scanner isn't working: type
  // a product name or barcode and pick from the matches. Debounced so we don't
  // hit the API on every keystroke; setState lives in the timeout callback (not
  // the effect body) to satisfy the React Compiler lint rules.
  const [manualQuery, setManualQuery] = useState("");
  const [committedQuery, setCommittedQuery] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setCommittedQuery(manualQuery.trim()), 200);
    return () => clearTimeout(t);
  }, [manualQuery]);
  const { data: manualResults } = useProducts(committedQuery);

  const sym = shop?.currencySymbol || "Rs.";
  const money = (n: number) => formatMoney(n, sym);

  const quote = useMemo(
    () =>
      quoteSale({
        cart,
        discountType,
        discountValue,
        pointsRedeemed,
        settings: shop,
      }),
    [cart, discountType, discountValue, pointsRedeemed, shop],
  );

  // Old due the cashier is folding into this bill (capped at what's owed).
  const dueToClear = customer
    ? Math.min(Math.max(0, Number(duePaid) || 0), customer.totalDue)
    : 0;

  // Returns queued on this bill and their refund value.
  const returnTotal = round2(
    returnLines.reduce((s, l) => s + l.refundAmount, 0),
  );
  const creditAvail = customer?.creditBalance ?? 0;
  // Store credit only ever reduces what's payable — never enough to create a
  // refund on its own — so cap it at the sale-minus-returns amount.
  const creditUse = useCredit
    ? round2(Math.min(creditAvail, Math.max(0, quote.total - returnTotal)))
    : 0;

  // Net the returns and credit against the sale. Positive → the customer pays;
  // negative → the shop owes them (refund).
  const netBill = round2(quote.total - returnTotal - creditUse);
  const payable = Math.max(0, netBill);
  const grossRefund = Math.max(0, round2(-netBill));

  // Mirrors backend/src/routes/invoices.js exactly: every source of money on
  // this bill (tendered cash, and any gross refund from returns/credit) goes
  // into one pool, allocated goods first, then the old due, then whatever's
  // left is change/refund. Without pooling the refund in here too, this
  // preview showed the FULL return value as "refund" even when some of it
  // was about to go straight to clearing the customer's due — a cashier
  // reading that number had no way to tell the due-clear had actually worked.
  const tenderedCash =
    paymentMethod === "CASH" ? Number(amountPaid) || 0 : payable + dueToClear;
  const pool = round2(tenderedCash + grossRefund);
  const amountAppliedToGoods = round2(Math.min(pool, payable));
  const afterGoods = round2(Math.max(0, pool - amountAppliedToGoods));
  const duePaidFinal = round2(Math.min(dueToClear, afterGoods));
  const leftover = round2(Math.max(0, afterGoods - duePaidFinal));
  const changeDue = grossRefund > 0 ? 0 : leftover;
  const refundValue = grossRefund > 0 ? leftover : 0;

  // "Paid in full" convenience total: goods + due, assuming the cashier
  // brings fresh cash rather than drawing the due-clear out of a refund.
  const collectTotal = round2(payable + dueToClear);
  const shortNow =
    paymentMethod === "CASH" && Number(amountPaid) > 0 && grossRefund === 0
      ? Math.max(0, round2(collectTotal - (Number(amountPaid) || 0)))
      : 0;

  const addToCart = useCallback(
    (product: Product) => {
      setCompletedSale(null);
      setCart((prev) => {
        const existing = prev.find((item) => item.product.id === product.id);
        if (!existing) return [...prev, { product, quantity: 1 }];
        if (existing.quantity >= product.stock) {
          show(
            `Solo ${product.stock} en stock para "${product.name}"`,
            "error",
          );
          return prev;
        }
        return prev.map((item) =>
          item.product.id === product.id
            ? { ...item, quantity: item.quantity + 1 }
            : item,
        );
      });
    },
    [show],
  );

  const handleScan = useCallback(
    async (code: string) => {
      try {
        const product = await api.get<Product>(
          `/products/barcode/${encodeURIComponent(code)}`,
        );
        addToCart(product);
      } catch (err) {
        if (err instanceof ApiError && err.status === 404)
          show("Producto no encontrado. Agréguelo al inventario.", "error");
        else show("Error al buscar código de barras", "error");
      }
    },
    [addToCart, show],
  );

  async function lookupCustomer(phoneOverride?: string) {
    const phone = (phoneOverride ?? customerPhone).trim();
    if (!phone) return;
    try {
      const c = await api.get<Customer>(
        `/customers/phone/${encodeURIComponent(phone)}`,
      );
      setCustomer(c);
      setCustomerName(c.name);
      setDuePaid("");
      show(`${c.name} — ${c.loyaltyPoints} puntos`, "success");
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        setCustomer(null);
        show("Nuevo cliente — se creará al finalizar la compra", "info");
      } else {
        show("Error al buscar cliente", "error");
      }
    }
  }

  // A return is often the FIRST thing typed on a bill — the cashier may
  // never touch the phone field at all. Without this, "Store credit" and
  // "Use store credit" stay silently disabled (no customer attached) and
  // look like the app just isn't responding to the click.
  function onReturnInvoiceFound(info: {
    customerPhone: string | null;
    customerName: string;
  }) {
    if (!info.customerPhone) return;
    setCustomerPhone(info.customerPhone);
    setCustomerName(info.customerName);
    if (customer?.phone !== info.customerPhone)
      lookupCustomer(info.customerPhone);
  }

  const resetSale = () => {
    setCart([]);
    setCustomer(null);
    setCustomerName("");
    setCustomerPhone("");
    setDuePaid("");
    setReturnLines([]);
    setRefundMode("CASH");
    setUseCredit(false);
    setDiscountType(null);
    setDiscountValue(0);
    setPointsRedeemed(0);
    setPaymentMethod("CASH");
    setAmountPaid("");
  };

  // A bill is submittable if it sells something, returns something, or
  // collects a previous due — the last case lets a customer walk in only to
  // pay off their udhaar, with no purchase, straight from the register.
  const canFinalize =
    cart.length > 0 || returnLines.length > 0 || dueToClear > 0;

  const finalizeSale = useCallback(async () => {
    if (!canFinalize || isCheckingOut) return;
    setIsCheckingOut(true);
    try {
      // Group the flat return lines back by their original invoice.
      const returnsPayload = Object.values(
        returnLines.reduce(
          (acc, l) => {
            (acc[l.invoiceId] ??= {
              invoiceId: l.invoiceId,
              items: [],
            }).items.push({
              invoiceItemId: l.invoiceItemId,
              quantity: l.quantity,
              refundAmount: l.refundAmount,
            });
            return acc;
          },
          {} as Record<
            number,
            {
              invoiceId: number;
              items: {
                invoiceItemId: number;
                quantity: number;
                refundAmount: number;
              }[];
            }
          >,
        ),
      );

      const submitCheckout = (confirmPassword?: string) =>
        api.post<Invoice>("/invoices", {
          customerName,
          customerPhone,
          items: cart.map((item) => ({
            productId: item.product.id,
            quantity: item.quantity,
          })),
          discountType,
          discountValue: Number(discountValue) || 0,
          pointsRedeemed: Number(pointsRedeemed) || 0,
          paymentMethod,
          amountPaid: paymentMethod === "CASH" ? Number(amountPaid) || 0 : 0,
          duePaid: dueToClear,
          returns: returnsPayload,
          refundMode,
          creditApplied: creditUse,
          confirmPassword,
        });

      // A return/refund needs the password re-confirmed (see backend's
      // requirePasswordConfirm on POST /invoices) — a plain sale does not,
      // so this only prompts when returnsPayload actually has lines in it.
      const invoice =
        returnsPayload.length > 0
          ? await withPasswordConfirm(
              "process this refund",
              (confirmPassword) => submitCheckout(confirmPassword),
            )
          : await submitCheckout();
      if (!invoice) return; // cancelled the password prompt

      const parts = [
        `${invoice.invoiceNumber} · ${money(invoice.totalAmount)}`,
      ];
      if (invoice.previousDuePaid > 0)
        parts.push(`${money(invoice.previousDuePaid)} deuda saldada`);
      if (invoice.refundValue > 0)
        parts.push(
          `${money(invoice.refundValue)} reembolsado (${invoice.refundMode === "CREDIT" ? "crédito en tienda" : "efectivo"})`,
        );
      show(`Hecho — ${parts.join(" · ")}`, "success");
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      setCompletedSale({
        id: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        totalAmount: invoice.totalAmount,
      });
      resetSale();
      if (shop?.autoPrintReceipt) {
        if (shop.autoPrintMethod === "usb") {
          // Send straight to the USB thermal printer — a plain async request,
          // NOT the modal window.print() dialog. On a Debian till with no
          // browser-configured printer that dialog has nothing to open and
          // freezes the screen after every sale (which showed up as checkout
          // "hanging", especially on store-credit/refund bills); the USB path
          // has no dialog to hang on. Fire-and-forget with a toast on failure
          // so a printer problem never blocks the next customer.
          api
            .post(`/print/${invoice.id}/usb`)
            .catch((err) =>
              show(
                err instanceof ApiError
                  ? err.message
                  : "Error al imprimir automáticamente en impresora USB",
                "error",
              ),
            );
        } else {
          // Deferred one tick so the "Sale complete" card is definitely
          // painted before the OS print dialog opens — window.print() is
          // modal in most browsers and pauses the tab, which otherwise can
          // read as the app having frozen mid-checkout instead of having
          // already finished.
          setTimeout(() => openReceiptPrint(invoice.id), 0);
        }
      }
    } catch (err) {
      show(describeApiError(err, "Error al finalizar la venta"), "error");
    } finally {
      setIsCheckingOut(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    cart,
    returnLines,
    refundMode,
    creditUse,
    customerName,
    customerPhone,
    discountType,
    discountValue,
    pointsRedeemed,
    paymentMethod,
    amountPaid,
    dueToClear,
    canFinalize,
    isCheckingOut,
    queryClient,
    show,
    withPasswordConfirm,
    shop?.autoPrintReceipt,
    shop?.autoPrintMethod,
  ]);

  useBarcodeScanner({
    onScan: handleScan,
    onManualEnter: (event) => {
      const target = event.target as HTMLElement | null;
      const editable =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.isContentEditable;
      if (editable) return;
      finalizeSale();
    },
  });

  function updateQuantity(productId: number, delta: number) {
    setCart((prev) =>
      prev
        .map((item) => {
          if (item.product.id !== productId) return item;
          const nextQty = item.quantity + delta;
          if (nextQty > item.product.stock) {
            show(
              `Solo ${item.product.stock} en stock para "${item.product.name}"`,
              "error",
            );
            return item;
          }
          return { ...item, quantity: nextQty };
        })
        .filter((item) => item.quantity > 0),
    );
  }

  const maxRedeemable =
    customer && shop?.loyaltyEnabled ? customer.loyaltyPoints : 0;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">
            Punto de Venta
          </h1>
          <p className="flex items-center gap-1.5 text-sm text-foreground/60">
            <ScanBarcode className="h-4 w-4" aria-hidden="true" />
            Escanea un código de barras para agregar artículos. Presiona Enter
            para finalizar.
          </p>
        </div>
        <Button
          type="button"
          variant="secondary"
          onClick={() => setCameraScannerOpen(true)}
          className="shrink-0"
        >
          <Camera className="h-4 w-4" aria-hidden="true" />
          Escanear con cámara
        </Button>
      </div>

      {cameraScannerOpen && (
        <CameraScannerModal
          onClose={() => setCameraScannerOpen(false)}
          onScan={(code) => {
            setCameraScannerOpen(false);
            handleScan(code);
          }}
        />
      )}

      {completedSale && (
        <Card className="flex flex-wrap items-center justify-between gap-4 border-brand/30 bg-brand/5 p-5">
          <div className="flex items-center gap-3">
            <CheckCircle2
              className="h-6 w-6 shrink-0 text-brand"
              aria-hidden="true"
            />
            <div>
              <p className="text-sm font-semibold text-foreground">
                {completedSale.invoiceNumber} ·{" "}
                {money(completedSale.totalAmount)}
              </p>
              <p className="text-xs text-foreground/60">
                {shop?.autoPrintReceipt
                  ? "Venta completada — recibo enviado a imprimir."
                  : "Venta completada — imprime o descarga el recibo a continuación."}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <ReceiptActions invoiceId={completedSale.id} />
            <Button
              type="button"
              variant="ghost"
              onClick={() => setCompletedSale(null)}
            >
              Descartar
            </Button>
          </div>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Cart */}
        <Card className="p-5 lg:col-span-2">
          <h2 className="mb-4 text-base font-semibold text-foreground">
            Carrito
          </h2>

          {/* Manual add — the scanner fallback. Always visible so a cashier can
              still bill by typing a product name or barcode when the barcode
              scanner is unplugged, dead, or the code won't scan. */}
          <div className="relative mb-4">
            <div className="flex items-center gap-2 rounded-lg border border-border px-3 py-2">
              <Search
                className="h-4 w-4 shrink-0 text-foreground/40"
                aria-hidden="true"
              />
              <input
                type="text"
                value={manualQuery}
                onChange={(e) => setManualQuery(e.target.value)}
                placeholder="¿Escáner no funciona? Escribe un nombre de producto o código de barras para agregar…"
                aria-label="Agregar producto manualmente"
                className="w-full bg-transparent text-sm text-foreground outline-none placeholder:text-foreground/40"
              />
              {manualQuery && (
                <button
                  type="button"
                  aria-label="Limpiar búsqueda"
                  onClick={() => setManualQuery("")}
                  className="text-foreground/40 hover:text-foreground"
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              )}
            </div>
            {committedQuery && (
              <div className="absolute z-20 mt-1 max-h-72 w-full overflow-auto rounded-lg border border-border bg-surface shadow-lg">
                {!manualResults ? (
                  <p className="px-3 py-2.5 text-sm text-foreground/50">
                    Buscando…
                  </p>
                ) : manualResults.length === 0 ? (
                  <p className="px-3 py-2.5 text-sm text-foreground/50">
                    Ningún producto coincide con &ldquo;{committedQuery}&rdquo;.
                  </p>
                ) : (
                  manualResults.slice(0, 8).map((p) => {
                    const outOfStock =
                      p.stock <= 0 && !shop?.allowNegativeStock;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        disabled={outOfStock}
                        onClick={() => {
                          addToCart(p);
                          setManualQuery("");
                          setCommittedQuery("");
                        }}
                        className="flex w-full items-center justify-between gap-3 border-b border-border px-3 py-2.5 text-left text-sm last:border-b-0 hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <span className="min-w-0 flex-1 truncate font-medium text-foreground">
                          {p.name}
                          {p.barcode && (
                            <span className="ml-1.5 font-normal text-foreground/40">
                              · {p.barcode}
                            </span>
                          )}
                        </span>
                        <span className="shrink-0 text-foreground/70">
                          {money(effectivePrice(p))}
                        </span>
                        <span
                          className={`shrink-0 text-xs ${outOfStock ? "text-danger" : "text-foreground/40"}`}
                        >
                          {outOfStock ? "Sin stock" : `${p.stock} en stock`}
                        </span>
                      </button>
                    );
                  })
                )}
              </div>
            )}
          </div>

          {cart.length === 0 ? (
            <p className="py-10 text-center text-sm text-foreground/50">
              El carrito está vacío. Escanea un producto para comenzar.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-max text-left text-sm">
                <thead>
                  <tr className="text-xs uppercase text-foreground/50">
                    <th className="py-2 pr-4">Artículo</th>
                    <th className="py-2 pr-4">Cant.</th>
                    <th className="py-2 pr-4 text-right">Precio</th>
                    {shop?.gstEnabled && (
                      <th className="py-2 pr-4 text-right">GST</th>
                    )}
                    <th className="py-2 pr-4 text-right">Total</th>
                    <th className="py-2" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {cart.map((item) => (
                    <tr key={item.product.id}>
                      <td className="py-2.5 pr-4 font-medium text-foreground">
                        {item.product.name}
                        {item.product.unit && (
                          <span className="ml-1.5 font-normal text-foreground/40">
                            ({item.product.unit})
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 pr-4">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            aria-label={`Disminuir ${item.product.name}`}
                            onClick={() => updateQuantity(item.product.id, -1)}
                            className="flex h-7 w-7 items-center justify-center rounded-md border border-border hover:bg-surface-muted"
                          >
                            <Minus className="h-3.5 w-3.5" aria-hidden="true" />
                          </button>
                          <span className="w-6 text-center">
                            {item.quantity}
                          </span>
                          <button
                            type="button"
                            aria-label={`Aumentar ${item.product.name}`}
                            onClick={() => updateQuantity(item.product.id, 1)}
                            className="flex h-7 w-7 items-center justify-center rounded-md border border-border hover:bg-surface-muted"
                          >
                            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                          </button>
                        </div>
                      </td>
                      <td className="py-2.5 pr-4 text-right text-foreground/70">
                        {money(effectivePrice(item.product))}
                        {item.product.discountType &&
                          item.product.discountValue > 0 && (
                            <div className="text-xs text-success">
                              -
                              {item.product.discountType === "percent"
                                ? `${item.product.discountValue}%`
                                : money(item.product.discountValue)}
                            </div>
                          )}
                      </td>
                      {shop?.gstEnabled && (
                        <td className="py-2.5 pr-4 text-right text-foreground/50">
                          {item.product.taxRate}%
                        </td>
                      )}
                      <td className="py-2.5 pr-4 text-right font-medium text-foreground">
                        {money(effectivePrice(item.product) * item.quantity)}
                      </td>
                      <td className="py-2.5 text-right">
                        <button
                          type="button"
                          aria-label={`Eliminar ${item.product.name}`}
                          onClick={() =>
                            setCart((p) =>
                              p.filter((i) => i.product.id !== item.product.id),
                            )
                          }
                          className="text-foreground/40 hover:text-danger"
                        >
                          <Trash2 className="h-4 w-4" aria-hidden="true" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        {/* Checkout panel */}
        <div className="flex flex-col gap-4">
          {/* Customer */}
          <Card className="flex flex-col gap-3 p-5">
            <h2 className="text-base font-semibold text-foreground">Cliente</h2>
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <Field
                  label="Teléfono"
                  value={customerPhone}
                  onChange={(e) => {
                    setCustomerPhone(e.target.value);
                    setCustomer(null);
                    setPointsRedeemed(0);
                  }}
                  placeholder="Para lealtad"
                />
              </div>
              <Button
                type="button"
                variant="secondary"
                onClick={() => lookupCustomer()}
                aria-label="Buscar cliente"
              >
                <Search className="h-4 w-4" aria-hidden="true" />
              </Button>
            </div>
            <Field
              label="Nombre (opcional)"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder="Cliente ocasional"
            />
            {customer && customer.totalDue >= 0.01 && (
              <div className="rounded-lg bg-danger/10 p-3">
                <p className="text-sm font-medium text-danger">
                  Debe {money(customer.totalDue)} de antes
                </p>
                <p className="mt-0.5 text-xs text-foreground/60">
                  Agrega cualquier monto a esta factura para saldarla — el
                  cliente la paga junto con la venta.
                </p>
                <div className="mt-2 flex items-end gap-2">
                  <div className="flex-1">
                    <Field
                      label="Saldar deuda anterior (se suma a la factura)"
                      type="number"
                      min={0}
                      max={customer.totalDue}
                      step="0.01"
                      value={duePaid}
                      onChange={(e) =>
                        setDuePaid(
                          e.target.value === ""
                            ? ""
                            : String(
                                Math.min(
                                  Math.max(0, Number(e.target.value) || 0),
                                  customer.totalDue,
                                ),
                              ),
                        )
                      }
                      placeholder="0.00"
                    />
                  </div>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => setDuePaid(String(customer.totalDue))}
                  >
                    Deuda total
                  </Button>
                </div>
              </div>
            )}
            {customer && creditAvail >= 0.01 && (
              <label className="flex items-center gap-2 rounded-lg bg-success/10 p-3 text-sm">
                <input
                  type="checkbox"
                  checked={useCredit}
                  onChange={(e) => setUseCredit(e.target.checked)}
                />
                <span className="font-medium text-success">
                  Usar crédito en tienda ({money(creditAvail)})
                </span>
              </label>
            )}
            {customer && shop?.loyaltyEnabled && (
              <div className="rounded-lg bg-brand/5 p-3">
                <p className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                  <Star className="h-4 w-4 text-warning" aria-hidden="true" />
                  {customer.loyaltyPoints} puntos disponibles
                </p>
                {maxRedeemable > 0 ? (
                  <>
                    <div className="mt-2 flex items-end gap-2">
                      <div className="flex-1">
                        <Field
                          label={`Canjear puntos (1 pt = ${money(shop.pointValue).replace(sym + " ", sym)})`}
                          type="number"
                          min={0}
                          max={maxRedeemable}
                          value={pointsRedeemed || ""}
                          onChange={(e) =>
                            setPointsRedeemed(
                              Math.min(
                                Number(e.target.value) || 0,
                                maxRedeemable,
                              ),
                            )
                          }
                        />
                      </div>
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => setPointsRedeemed(maxRedeemable)}
                      >
                        Usar todos
                      </Button>
                    </div>
                    {pointsRedeemed > 0 && (
                      <p className="mt-1.5 text-xs text-success">
                        {pointsRedeemed} pts ={" "}
                        {money(pointsRedeemed * shop.pointValue)} de descuento
                        en esta venta
                      </p>
                    )}
                  </>
                ) : (
                  <p className="mt-1 text-xs text-foreground/50">
                    Aún no hay suficientes puntos para canjear.
                  </p>
                )}
              </div>
            )}
          </Card>

          {/* Returns / exchange */}
          <Card className="flex flex-col gap-3 p-5">
            <h2 className="text-base font-semibold text-foreground">
              Devolución / Cambio
            </h2>
            <ReturnPanel
              sym={sym}
              drafted={returnLines}
              onAdd={(lines) => setReturnLines((prev) => [...prev, ...lines])}
              onInvoiceFound={onReturnInvoiceFound}
            />
            {returnLines.length > 0 && (
              <div className="flex flex-col gap-1.5 border-t border-border pt-3">
                {returnLines.map((l) => (
                  <div
                    key={`${l.invoiceId}:${l.invoiceItemId}`}
                    className="flex items-center justify-between gap-2 text-sm"
                  >
                    <span className="flex-1 truncate text-foreground/80">
                      {l.quantity}× {l.name}
                      <span className="ml-1 text-xs text-foreground/40">
                        ({l.invoiceNumber})
                      </span>
                    </span>
                    <span className="text-foreground">
                      - {money(l.refundAmount)}
                    </span>
                    <button
                      type="button"
                      aria-label={`Eliminar devolución de ${l.name}`}
                      onClick={() =>
                        setReturnLines((prev) =>
                          prev.filter(
                            (x) =>
                              !(
                                x.invoiceId === l.invoiceId &&
                                x.invoiceItemId === l.invoiceItemId
                              ),
                          ),
                        )
                      }
                      className="text-foreground/40 hover:text-danger"
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </div>
                ))}
                <div className="flex items-center justify-between pt-1 text-sm font-medium">
                  <span className="text-foreground/60">Total devolución</span>
                  <span className="text-foreground">
                    - {money(returnTotal)}
                  </span>
                </div>
              </div>
            )}
            {refundValue > 0 && (
              <div className="rounded-lg bg-warning/10 p-3">
                <p className="text-sm font-medium text-warning">
                  Reembolso al cliente: {money(refundValue)}
                </p>
                <p className="mb-2 mt-0.5 text-xs text-foreground/60">
                  La devolución vale más que la compra — liquida la diferencia:
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setRefundMode("CASH")}
                    className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                      refundMode === "CASH"
                        ? "border-brand bg-brand text-brand-foreground"
                        : "border-border text-foreground/70 hover:bg-surface-muted"
                    }`}
                  >
                    Reembolso en efectivo
                  </button>
                  <button
                    type="button"
                    disabled={!customer}
                    onClick={() => setRefundMode("CREDIT")}
                    title={
                      !customer
                        ? "Agrega un cliente para crédito en tienda"
                        : undefined
                    }
                    className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors disabled:opacity-50 ${
                      refundMode === "CREDIT"
                        ? "border-brand bg-brand text-brand-foreground"
                        : "border-border text-foreground/70 hover:bg-surface-muted"
                    }`}
                  >
                    Crédito en tienda
                  </button>
                </div>
              </div>
            )}
          </Card>

          {/* Discount + payment */}
          <Card className="flex flex-col gap-3 p-5">
            <h2 className="text-base font-semibold text-foreground">
              Descuento
            </h2>
            <div className="flex gap-2">
              <select
                aria-label="Tipo de descuento"
                value={discountType ?? ""}
                onChange={(e) =>
                  setDiscountType(
                    (e.target.value || null) as "percent" | "amount" | null,
                  )
                }
                className="rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-foreground"
              >
                <option value="">Ninguno</option>
                <option value="percent">%</option>
                <option value="amount">{sym}</option>
              </select>
              <input
                type="number"
                min={0}
                step="0.01"
                disabled={!discountType}
                value={discountValue || ""}
                onChange={(e) => setDiscountValue(Number(e.target.value) || 0)}
                placeholder="Valor del descuento"
                aria-label="Valor del descuento"
                className="w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-foreground disabled:opacity-50"
              />
            </div>

            <h2 className="mt-2 text-base font-semibold text-foreground">
              Pago
            </h2>
            <div className="grid grid-cols-3 gap-2">
              {(["CASH", "UPI", "CARD"] as PaymentMethod[]).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setPaymentMethod(m)}
                  className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                    paymentMethod === m
                      ? "border-brand bg-brand text-brand-foreground"
                      : "border-border text-foreground/70 hover:bg-surface-muted"
                  }`}
                >
                  {m === "CASH"
                    ? "Efectivo"
                    : m === "UPI"
                      ? "UPI"
                      : m === "CARD"
                        ? "Tarjeta"
                        : m}
                </button>
              ))}
            </div>
            {paymentMethod === "CASH" && (
              <div className="flex items-end gap-2">
                <div className="flex-1">
                  <Field
                    label="Monto recibido"
                    type="number"
                    min={0}
                    step="0.01"
                    value={amountPaid}
                    onChange={(e) => setAmountPaid(e.target.value)}
                  />
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  className="whitespace-nowrap"
                  onClick={() => setAmountPaid(String(collectTotal))}
                  disabled={collectTotal === 0}
                >
                  Pagado completo
                </Button>
              </div>
            )}
          </Card>

          {/* Totals */}
          <Card className="flex flex-col gap-2 p-5">
            {(() => {
              const adjusted =
                returnTotal > 0 || creditUse > 0 || dueToClear > 0;
              return (
                <>
                  <Row
                    label={adjusted ? "Esta venta" : "Subtotal"}
                    value={money(adjusted ? quote.total : quote.subtotal)}
                  />
                  {!adjusted && quote.discountAmount > 0 && (
                    <Row
                      label="Descuento"
                      value={`- ${money(quote.discountAmount)}`}
                    />
                  )}
                  {!adjusted && shop?.gstEnabled && quote.taxAmount > 0 && (
                    <Row
                      label="GST (incluido)"
                      value={money(quote.taxAmount)}
                    />
                  )}
                  {!adjusted && quote.loyaltyDiscount > 0 && (
                    <Row
                      label="Lealtad"
                      value={`- ${money(quote.loyaltyDiscount)}`}
                    />
                  )}
                  {returnTotal > 0 && (
                    <Row
                      label="Devoluciones"
                      value={`- ${money(returnTotal)}`}
                    />
                  )}
                  {creditUse > 0 && (
                    <Row
                      label="Crédito en tienda usado"
                      value={`- ${money(creditUse)}`}
                    />
                  )}
                  {/* Show what will ACTUALLY clear given the tender so far
                      (duePaidFinal), not the intended amount (dueToClear) —
                      on a cash bill that's still short, the due hasn't been
                      funded yet, and claiming it's cleared here is exactly
                      what made cashiers think a due had been paid when the
                      backend correctly left it standing. */}
                  {dueToClear > 0 && (
                    <Row
                      label={
                        duePaidFinal < dueToClear
                          ? "Deuda a saldar (requiere pago completo)"
                          : "Deuda anterior saldada"
                      }
                      value={money(duePaidFinal)}
                    />
                  )}
                </>
              );
            })()}
            <div className="my-1 border-t border-border" />
            {refundValue > 0 ? (
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-warning">
                  Reembolso (
                  {refundMode === "CREDIT" ? "crédito en tienda" : "efectivo"})
                </span>
                <span className="text-xl font-semibold text-warning">
                  {money(refundValue)}
                </span>
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-foreground/70">
                  {returnTotal > 0 || creditUse > 0 || dueToClear > 0
                    ? "A Cobrar"
                    : "Total General"}
                </span>
                <span className="text-xl font-semibold text-foreground">
                  {money(collectTotal)}
                </span>
              </div>
            )}
            {paymentMethod === "CASH" &&
              Number(amountPaid) > 0 &&
              changeDue > 0 && <Row label="Cambio" value={money(changeDue)} />}
            {shortNow > 0 && (
              <p
                className={`rounded-lg px-3 py-2 text-xs font-medium ${customer ? "bg-warning/10 text-warning" : "bg-danger/10 text-danger"}`}
              >
                {customer
                  ? `${money(shortNow)} faltante — la parte impaga queda en el saldo deudor de ${customer.name}`
                  : `${money(shortNow)} faltante — agrega un cliente (teléfono) para registrar esto como deuda, o cobra el monto completo`}
              </p>
            )}
            {shop?.loyaltyEnabled && customer && quote.pointsEarned > 0 && (
              <p className="text-xs text-foreground/50">
                Gana {quote.pointsEarned} puntos
              </p>
            )}
            <Button
              onClick={finalizeSale}
              disabled={!canFinalize || isCheckingOut}
              className="mt-2 w-full"
            >
              {isCheckingOut
                ? "Procesando…"
                : refundValue > 0 && cart.length === 0
                  ? "Procesar Devolución (Enter)"
                  : cart.length === 0 &&
                      returnLines.length === 0 &&
                      dueToClear > 0
                    ? "Cobrar Deuda (Enter)"
                    : "Finalizar Venta (Enter)"}
            </Button>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-foreground/60">{label}</span>
      <span className="text-foreground">{value}</span>
    </div>
  );
}
