"use client";

import { useCallback, useMemo, useState } from "react";
import {
  BarChart3,
  ChevronDown,
  ChevronUp,
  Barcode as BarcodeIcon,
  PackagePlus,
  Pencil,
  Plus,
  ScanBarcode,
  Search,
  Trash2,
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { ProductModal } from "@/components/ProductModal";
import { StockAdjustModal } from "@/components/StockAdjustModal";
import { BarcodeLabelModal } from "@/components/BarcodeLabelModal";
import { InventorySummaryModal } from "@/components/InventorySummaryModal";
import { useBarcodeScanner } from "@/hooks/useBarcodeScanner";
import { useDeleteProduct, useProducts } from "@/hooks/useProducts";
import { useShopSettings } from "@/hooks/useShopSettings";
import { useMe } from "@/hooks/useAuth";
import { useToast } from "@/components/Toast";
import { api, ApiError } from "@/lib/api";
import { formatMoney } from "@/lib/format";
import { effectivePrice } from "@/lib/quote";
import type { Product } from "@/lib/types";

type ModalState =
  | { mode: "add"; initialBarcode?: string }
  | { mode: "edit"; product: Product }
  | null;
type SortKey =
  | "name"
  | "barcode"
  | "category"
  | "taxRate"
  | "purchasePrice"
  | "sellingPrice"
  | "stock";
type SortDirection = "asc" | "desc";

export default function InventoryPage() {
  const [search, setSearch] = useState("");
  const [modal, setModal] = useState<ModalState>(null);
  const [stockTarget, setStockTarget] = useState<Product | null>(null);
  const [labelTarget, setLabelTarget] = useState<Product | null>(null);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const { data: shop } = useShopSettings();
  const { data: user } = useMe();
  const isAdmin = user?.role === "admin";
  const { data: products, isLoading } = useProducts(search);
  const deleteProduct = useDeleteProduct();
  const { show } = useToast();

  const sym = shop?.currencySymbol || "Rs.";
  const money = (n: number) => formatMoney(n, sym);
  const lowStockThreshold = shop?.lowStockAlert ?? 5;
  const sortedProducts = useMemo(() => {
    if (!products) return [];
    return [...products].sort((a, b) => {
      const comparison =
        sortKey === "name" || sortKey === "barcode" || sortKey === "category"
          ? (a[sortKey] ?? "").localeCompare(b[sortKey] ?? "", "es", {
              sensitivity: "base",
              numeric: sortKey === "barcode",
            })
          : (a[sortKey] ?? 0) - (b[sortKey] ?? 0);
      return sortDirection === "asc" ? comparison : -comparison;
    });
  }, [products, sortDirection, sortKey]);

  function changeSort(key: SortKey) {
    if (sortKey === key) {
      setSortDirection((direction) => (direction === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(key);
    setSortDirection("asc");
  }

  function sortHeader(label: string, key: SortKey, alignRight = false) {
    const active = sortKey === key;
    const SortIcon = sortDirection === "asc" ? ChevronUp : ChevronDown;
    return (
      <th
        className={`py-2 pr-4 ${alignRight ? "text-right" : ""}`}
        aria-sort={
          active
            ? sortDirection === "asc"
              ? "ascending"
              : "descending"
            : "none"
        }
      >
        <button
          type="button"
          onClick={() => changeSort(key)}
          className={`inline-flex items-center gap-1 hover:text-foreground ${
            alignRight ? "justify-end" : ""
          } ${active ? "text-foreground" : ""}`}
        >
          {label}
          {active && <SortIcon className="h-3.5 w-3.5" aria-hidden="true" />}
        </button>
      </th>
    );
  }

  const handleScan = useCallback(
    async (code: string) => {
      try {
        const product = await api.get<Product>(
          `/products/barcode/${encodeURIComponent(code)}`,
        );
        setModal({ mode: "edit", product });
      } catch (err) {
        if (err instanceof ApiError && err.status === 404)
          setModal({ mode: "add", initialBarcode: code });
        else show("Error al buscar código de barras", "error");
      }
    },
    [show],
  );

  useBarcodeScanner({
    onScan: handleScan,
    enabled:
      isAdmin && modal === null && stockTarget === null && !summaryOpen,
  });

  async function handleDelete(product: Product) {
    if (
      !window.confirm(
        `¿Eliminar "${product.name}"? Esta acción no se puede deshacer.`,
      )
    )
      return;
    try {
      await deleteProduct.mutateAsync(product.id);
      show("Producto eliminado", "success");
    } catch (err) {
      show(
        err instanceof ApiError
          ? err.message
          : "No se pudo eliminar el producto",
        "error",
      );
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold text-foreground">
              Inventario
            </h1>
            {isAdmin && (
              <Button variant="secondary" onClick={() => setSummaryOpen(true)}>
                <BarChart3 className="h-4 w-4" aria-hidden="true" />
                Resúmenes de inventario
              </Button>
            )}
          </div>
          <p className="flex items-center gap-1.5 text-sm text-foreground/60">
            <ScanBarcode className="h-4 w-4 shrink-0" aria-hidden="true" />
            {isAdmin
              ? "Escanea un código de barras para ir a un producto, o usa los iconos de edición y stock en cada fila."
              : "Consulta productos y existencias, o imprime etiquetas de código de barras."}
          </p>
        </div>
        {isAdmin && (
          <Button onClick={() => setModal({ mode: "add" })}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            Agregar producto
          </Button>
        )}
      </div>

      <Card className="p-5">
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-border px-3 py-2">
          <Search className="h-4 w-4 text-foreground/40" aria-hidden="true" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nombre, código de barras o categoría…"
            aria-label="Buscar productos"
            className="w-full bg-transparent text-sm text-foreground outline-none placeholder:text-foreground/40"
          />
        </div>

        {isLoading ? (
          <p className="py-10 text-center text-sm text-foreground/50">
            Cargando productos…
          </p>
        ) : !products || products.length === 0 ? (
          <p className="py-10 text-center text-sm text-foreground/50">
            {isAdmin
              ? "Aún no hay productos. Escanea un código de barras o haz clic en “Agregar producto” para comenzar."
              : "Aún no hay productos."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-max text-left text-sm">
              <thead>
                <tr className="text-xs uppercase text-foreground/50">
                  {sortHeader("Producto", "name")}
                  {sortHeader("Código de barras", "barcode")}
                  {sortHeader("Categoría", "category")}
                  {isAdmin && shop?.gstEnabled && (
                    sortHeader("GST", "taxRate", true)
                  )}
                  {isAdmin && sortHeader("Costo", "purchasePrice", true)}
                  {sortHeader("Precio", "sellingPrice", true)}
                  {sortHeader("Stock", "stock", true)}
                  {isAdmin && <th className="py-2" />}
                  {!isAdmin && <th className="py-2 text-right">Etiquetas</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {sortedProducts.map((product) => {
                  const low = product.stock <= lowStockThreshold;
                  return (
                    <tr key={product.id}>
                      <td className="py-2.5 pr-4">
                        {isAdmin ? (
                          <button
                            type="button"
                            onClick={() => setModal({ mode: "edit", product })}
                            className="font-medium text-foreground hover:text-brand hover:underline"
                          >
                            {product.name}
                          </button>
                        ) : (
                          <span className="font-medium text-foreground">
                            {product.name}
                          </span>
                        )}
                        {product.sku && (
                          <span
                            className="ml-1.5 rounded-full bg-brand/10 px-1.5 py-0.5 text-[10px] font-medium text-brand"
                            title="Vinculado a un sistema externo por este SKU"
                          >
                            SKU {product.sku}
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 pr-4 font-mono text-xs text-foreground/60">
                        {product.barcode}
                      </td>
                      <td className="py-2.5 pr-4 text-foreground/60">
                        {product.category || "—"}
                      </td>
                      {isAdmin && shop?.gstEnabled && (
                        <td className="py-2.5 pr-4 text-right text-foreground/60">
                          {product.taxRate}%
                        </td>
                      )}
                      {isAdmin && (
                        <td className="py-2.5 pr-4 text-right text-foreground/70">
                          {money(product.purchasePrice ?? 0)}
                        </td>
                      )}
                      <td className="py-2.5 pr-4 text-right text-foreground/70">
                        {product.discountType && product.discountValue > 0 ? (
                          <>
                            <span className="text-xs text-foreground/40 line-through">
                              {money(product.sellingPrice)}
                            </span>{" "}
                            <span className="text-success">
                              {money(effectivePrice(product))}
                            </span>
                          </>
                        ) : (
                          money(product.sellingPrice)
                        )}
                      </td>
                      <td className="py-2.5 pr-4 text-right">
                        {isAdmin ? (
                          <button
                            type="button"
                            onClick={() => setStockTarget(product)}
                            title="Ajustar stock"
                            className={
                              low
                                ? "rounded-full bg-warning/10 px-2.5 py-1 text-xs font-semibold text-warning hover:bg-warning/20"
                                : "rounded-full px-2.5 py-1 text-foreground/70 hover:bg-surface-muted"
                            }
                          >
                            {product.stock}
                          </button>
                        ) : (
                          <span
                            className={
                              low
                                ? "rounded-full bg-warning/10 px-2.5 py-1 text-xs font-semibold text-warning"
                                : "text-foreground/70"
                            }
                          >
                            {product.stock}
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            aria-label={`Etiqueta de código de barras para ${product.name}`}
                            title="Etiqueta de código de barras / QR"
                            onClick={() => setLabelTarget(product)}
                            className="flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-surface-muted text-foreground/70 transition-colors hover:border-brand/40 hover:bg-brand/10 hover:text-brand"
                          >
                            <BarcodeIcon
                              className="h-5 w-5"
                              aria-hidden="true"
                            />
                          </button>
                          {isAdmin && <button
                            type="button"
                            aria-label={`Ajustar stock para ${product.name}`}
                            title="Ajustar stock"
                            onClick={() => setStockTarget(product)}
                            className="flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-surface-muted text-foreground/70 transition-colors hover:border-brand/40 hover:bg-brand/10 hover:text-brand"
                          >
                            <PackagePlus
                              className="h-5 w-5"
                              aria-hidden="true"
                            />
                          </button>}
                          {isAdmin && <button
                            type="button"
                            aria-label={`Editar ${product.name}`}
                            title="Editar producto"
                            onClick={() => setModal({ mode: "edit", product })}
                            className="flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-surface-muted text-foreground/70 transition-colors hover:border-brand/40 hover:bg-brand/10 hover:text-brand"
                          >
                            <Pencil className="h-5 w-5" aria-hidden="true" />
                          </button>}
                          {isAdmin && <button
                            type="button"
                            aria-label={`Eliminar ${product.name}`}
                            title="Eliminar producto"
                            onClick={() => handleDelete(product)}
                            className="flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-surface-muted text-foreground/70 transition-colors hover:border-danger/40 hover:bg-danger/10 hover:text-danger"
                          >
                            <Trash2 className="h-5 w-5" aria-hidden="true" />
                          </button>}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {modal?.mode === "add" && (
        <ProductModal
          mode="add"
          initialBarcode={modal.initialBarcode}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.mode === "edit" && (
        <ProductModal
          mode="edit"
          product={modal.product}
          onClose={() => setModal(null)}
        />
      )}
      {stockTarget && (
        <StockAdjustModal
          product={stockTarget}
          onClose={() => setStockTarget(null)}
        />
      )}
      {isAdmin && summaryOpen && (
        <InventorySummaryModal
          currencySymbol={sym}
          onClose={() => setSummaryOpen(false)}
        />
      )}
      {labelTarget && (
        <BarcodeLabelModal
          product={labelTarget}
          onClose={() => setLabelTarget(null)}
        />
      )}
    </div>
  );
}
