"use client";

import { useEffect, useMemo } from "react";
import { X } from "lucide-react";
import { useProducts } from "@/hooks/useProducts";
import { formatMoney } from "@/lib/format";

// Valoración de todo el inventario (ignora la búsqueda de la página).
// La venta esperada usa el precio de lista sin descuentos, por eso la
// utilidad es bruta.
export function InventorySummaryModal({
  currencySymbol,
  onClose,
}: {
  currencySymbol: string;
  onClose: () => void;
}) {
  const { data: products, isLoading } = useProducts("");

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  const totals = useMemo(() => {
    let cost = 0;
    let sale = 0;
    let units = 0;
    let highestProfit:
      | { name: string; percentage: number; profit: number }
      | undefined;
    let lowestProfit:
      | { name: string; percentage: number; profit: number }
      | undefined;

    for (const p of products ?? []) {
      const stock = Math.max(0, p.stock);
      const productCost = (p.purchasePrice ?? 0) * stock;
      const productSale = p.sellingPrice * stock;
      const productProfit = productSale - productCost;
      const percentage =
        productCost > 0 ? (productProfit / productCost) * 100 : null;

      cost += productCost;
      sale += productSale;
      units += stock;

      if (stock > 0 && percentage !== null) {
        const candidate = {
          name: p.name,
          percentage,
          profit: productProfit,
        };
        if (!highestProfit || percentage > highestProfit.percentage) {
          highestProfit = candidate;
        }
        if (!lowestProfit || percentage < lowestProfit.percentage) {
          lowestProfit = candidate;
        }
      }
    }

    return {
      cost,
      sale,
      units,
      profit: sale - cost,
      highestProfit,
      lowestProfit,
    };
  }, [products]);

  const margin = totals.sale > 0 ? (totals.profit / totals.sale) * 100 : 0;
  const markup = totals.cost > 0 ? (totals.profit / totals.cost) * 100 : 0;
  const money = (n: number) => formatMoney(n, currencySymbol);

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
        aria-labelledby="inventory-summary-title"
        className="w-full max-w-lg rounded-xl bg-surface p-6 shadow-xl"
      >
        <div className="mb-5 flex items-center justify-between">
          <h2
            id="inventory-summary-title"
            className="text-lg font-semibold text-foreground"
          >
            Resúmenes de inventario
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="text-foreground/50 hover:text-foreground"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        {isLoading ? (
          <p className="py-10 text-center text-sm text-foreground/50">
            Calculando…
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-border p-4">
              <p className="text-xs uppercase text-foreground/50">
                Valor del inventario a costo
              </p>
              <p className="mt-1 text-xl font-semibold text-foreground">
                {money(totals.cost)}
              </p>
              <p className="mt-1 text-sm text-foreground/60">
                Base de costo para el inventario.
              </p>
            </div>
            <div className="rounded-lg border border-border p-4">
              <p className="text-xs uppercase text-foreground/50">
                Venta esperada a precio de venta
              </p>
              <p className="mt-1 text-xl font-semibold text-foreground">
                {money(totals.sale)}
              </p>
              <p className="mt-1 text-sm text-foreground/60">
                Margen bruto: {margin.toFixed(1)}% de la venta
              </p>
            </div>
            <div className="rounded-lg border border-border p-4 sm:col-span-2">
              <p className="text-xs uppercase text-foreground/50">
                Utilidad bruta estimada
              </p>
              <p className="mt-1 text-2xl font-semibold text-foreground">
                {money(totals.profit)}
              </p>
              <p className="mt-1 text-sm text-foreground/60">
                {markup.toFixed(1)}% sobre el costo (recargo bruto).
              </p>
            </div>
            <div className="rounded-lg border border-border p-4">
              <p className="text-xs uppercase text-foreground/50">
                Producto con utilidad más alta
              </p>
              {totals.highestProfit ? (
                <>
                  <p className="mt-1 font-semibold text-foreground">
                    {totals.highestProfit.name}
                  </p>
                  <p className="text-sm text-foreground/60">
                    {totals.highestProfit.percentage.toFixed(1)}% sobre costo
                    ({money(totals.highestProfit.profit)} por existencias)
                  </p>
                </>
              ) : (
                <p className="mt-1 text-sm text-foreground/60">
                  Sin datos de costo para calcular el porcentaje.
                </p>
              )}
            </div>
            <div className="rounded-lg border border-border p-4">
              <p className="text-xs uppercase text-foreground/50">
                Producto con utilidad más baja
              </p>
              {totals.lowestProfit ? (
                <>
                  <p className="mt-1 font-semibold text-foreground">
                    {totals.lowestProfit.name}
                  </p>
                  <p className="text-sm text-foreground/60">
                    {totals.lowestProfit.percentage.toFixed(1)}% sobre costo
                    ({money(totals.lowestProfit.profit)} por existencias)
                  </p>
                </>
              ) : (
                <p className="mt-1 text-sm text-foreground/60">
                  Sin datos de costo para calcular el porcentaje.
                </p>
              )}
            </div>
            <p className="text-xs text-foreground/60 sm:col-span-2">
              {totals.units} unidades en {products?.length ?? 0} productos.
              Utilidad bruta (venta menos costo de compra), sin descuentos y
              antes de gastos, impuestos y otros costos operativos; no es
              utilidad neta.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
