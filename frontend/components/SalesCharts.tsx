"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { TooltipContentProps } from "recharts";
import type {
  NameType,
  ValueType,
} from "recharts/types/component/DefaultTooltipContent";
import { useMemo, useState } from "react";
import { Card } from "@/components/ui/Card";
import { useSalesAnalytics } from "@/hooks/useInvoices";
import { formatMoney } from "@/lib/format";
import { ApiError } from "@/lib/api";
import {
  addDaysToDateInput,
  dateInputValue,
  formatColombiaCalendarDate,
} from "@/lib/colombia-time";

type Period = "yesterday" | "last7" | "last14" | "thisMonth" | "lastMonth" | "lastYear" | "custom";

function initialRange() {
  const today = dateInputValue();
  return { from: addDaysToDateInput(today, -13), to: today };
}

function getPresetRange(period: Exclude<Period, "custom">) {
  const today = dateInputValue();
  let from = today;
  let to = today;
  const [year, month] = today.split("-").map(Number);

  switch (period) {
    case "yesterday":
      from = addDaysToDateInput(today, -1);
      to = from;
      break;
    case "last7":
      from = addDaysToDateInput(today, -6);
      break;
    case "last14":
      from = addDaysToDateInput(today, -13);
      break;
    case "thisMonth":
      from = `${year}-${String(month).padStart(2, "0")}-01`;
      break;
    case "lastMonth":
      from = month === 1
        ? `${year - 1}-12-01`
        : `${year}-${String(month - 1).padStart(2, "0")}-01`;
      to = addDaysToDateInput(`${year}-${String(month).padStart(2, "0")}-01`, -1);
      break;
    case "lastYear":
      from = `${year - 1}-${String(month).padStart(2, "0")}-${today.slice(8)}`;
      break;
  }
  return { from, to };
}

function displayDate(value: string, options: Intl.DateTimeFormatOptions) {
  return formatColombiaCalendarDate(value, options);
}

const PAYMENT_COLORS: Record<string, string> = {
  CASH: "var(--color-warning)",
  UPI: "var(--color-success)",
  TRANSFER: "var(--color-success)",
  CARD: "var(--color-brand)",
};
const FALLBACK_COLORS = [
  "var(--color-brand)",
  "var(--color-success)",
  "var(--color-warning)",
];
const PAYMENT_LABELS: Record<string, string> = {
  CASH: "Efectivo",
  UPI: "UPI",
  TRANSFER: "Transferencia",
  CARD: "Tarjeta",
};

function RevenueTooltip({
  active,
  payload,
  money,
  granularity,
}: TooltipContentProps<ValueType, NameType> & {
  money: (n: number) => string;
  granularity: "day" | "month";
}) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload as {
    date: string;
    revenue: number;
    count: number;
  };
  return (
    <div className="glass-panel rounded-xl bg-surface-elevated px-3.5 py-2.5 text-xs shadow-2xl">
      <p className="mb-1.5 font-medium text-foreground">
        {formatColombiaCalendarDate(point.date, {
          ...(granularity === "month"
            ? { month: "long", year: "numeric" }
            : { day: "numeric", month: "long", year: "numeric" }),
        })}
      </p>
      <div className="flex items-center justify-between gap-6">
        <span className="text-foreground-muted">Ventas totales</span>
        <span className="font-medium text-foreground">{point.count}</span>
      </div>
      <div className="flex items-center justify-between gap-6">
        <span className="text-foreground-muted">Total vendido</span>
        <span className="font-medium text-foreground">
          {money(point.revenue)}
        </span>
      </div>
    </div>
  );
}

export function SalesCharts({ sym }: { sym: string }) {
  const initial = useMemo(initialRange, []);
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [period, setPeriod] = useState<Period>("last14");
  const { data, isLoading, isFetching, isError, error } = useSalesAnalytics(
    from,
    to,
  );
  const money = (n: number) => formatMoney(n, sym);
  const totalSold =
    data?.trend.reduce((sum, bucket) => sum + bucket.revenue, 0) ?? 0;
  const totalSales =
    data?.trend.reduce((sum, bucket) => sum + bucket.count, 0) ?? 0;
  const averageSale = totalSales > 0 ? totalSold / totalSales : 0;
  const metric = (value: string) =>
    isLoading ? "…" : isError || !from || !to ? "—" : value;

  const hasTrend = data?.trend.some((d) => d.revenue > 0 || d.count > 0);
  const hasProducts = data && data.topProducts.length > 0;
  const hasPayments = data && data.paymentMethods.length > 0;
  const paymentTotal =
    data?.paymentMethods.reduce((s, m) => s + m.revenue, 0) ?? 0;
  const maxQuantity = data
    ? Math.max(...data.topProducts.map((p) => p.quantity), 1)
    : 1;
  const rangeLabel =
    period === "custom"
      ? from && to
        ? `${displayDate(from, { day: "numeric", month: "short", year: "numeric" })} – ${displayDate(to, { day: "numeric", month: "short", year: "numeric" })}`
        : "Selecciona ambas fechas"
      : {
          yesterday: "Ayer",
          last7: "Últimos 7 días",
          last14: "Últimos 14 días",
          thisMonth: "Este mes",
          lastMonth: "Mes pasado",
          lastYear: "Último año",
        }[period];

  function selectPeriod(value: string) {
    if (value === "custom") {
      setPeriod("custom");
      return;
    }
    const nextPeriod = value as Exclude<Period, "custom">;
    const range = getPresetRange(nextPeriod);
    setPeriod(nextPeriod);
    setFrom(range.from);
    setTo(range.to);
  }

  return (
    <div className="flex flex-col gap-4">
      <Card className="p-5">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <h2 className="text-base font-semibold text-foreground">
              Resumen de ventas
            </h2>
            <p className="mt-1 text-sm text-foreground-muted">{rangeLabel}</p>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1.5 text-sm font-medium text-foreground">
              Periodo
              <select
                value={period}
                onChange={(event) => selectPeriod(event.target.value)}
                className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground"
              >
                <option value="yesterday">Ayer</option>
                <option value="last7">Últimos 7 días</option>
                <option value="last14">Últimos 14 días</option>
                <option value="thisMonth">Este mes</option>
                <option value="lastMonth">Mes pasado</option>
                <option value="lastYear">Último año</option>
                <option value="custom">Rango personalizado</option>
              </select>
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-medium text-foreground">
              Desde
              <input
                type="date"
                value={from}
                max={to}
                onChange={(event) => {
                  setFrom(event.target.value);
                  setPeriod("custom");
                }}
                className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground"
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-medium text-foreground">
              Hasta
              <input
                type="date"
                value={to}
                min={from}
                max={dateInputValue(new Date())}
                onChange={(event) => {
                  setTo(event.target.value);
                  setPeriod("custom");
                }}
                className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground"
              />
            </label>
          </div>
        </div>
        <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-lg bg-surface-muted p-3">
            <p className="text-xs text-foreground-muted">Total vendido</p>
            <p className="mt-1 text-lg font-semibold text-foreground">
              {metric(money(totalSold))}
            </p>
          </div>
          <div className="rounded-lg bg-surface-muted p-3">
            <p className="text-xs text-foreground-muted">Ventas realizadas</p>
            <p className="mt-1 text-lg font-semibold text-foreground">
              {metric(String(totalSales))}
            </p>
          </div>
          <div className="rounded-lg bg-surface-muted p-3">
            <p className="text-xs text-foreground-muted">Promedio por venta</p>
            <p className="mt-1 text-lg font-semibold text-foreground">
              {metric(money(averageSale))}
            </p>
          </div>
        </div>
        {isFetching && !isLoading && (
          <p className="mt-2 text-right text-xs text-foreground-muted">
            Actualizando periodo…
          </p>
        )}
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <Card className="p-5 lg:col-span-2">
        <h2 className="mb-4 text-base font-semibold text-foreground">
          Total vendido — {rangeLabel.toLowerCase()}
        </h2>
        {isLoading ? (
          <p className="py-16 text-center text-sm text-foreground-muted">
            Cargando…
          </p>
        ) : !from || !to ? (
          <p className="py-16 text-center text-sm text-foreground-muted">
            Selecciona las fechas de inicio y fin para consultar las ventas.
          </p>
        ) : isError ? (
          <p className="py-16 text-center text-sm text-danger">
            {error instanceof ApiError
              ? error.message
              : "No se pudo cargar el resumen de ventas."}
          </p>
        ) : !hasTrend ? (
          <p className="py-16 text-center text-sm text-foreground-muted">
            Aún no hay suficientes ventas para mostrar una tendencia.
          </p>
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart
              data={data!.trend}
              margin={{ left: -12, right: 8, top: 8 }}
            >
              <defs>
                <linearGradient id="revenueFill" x1="0" y1="0" x2="0" y2="1">
                  <stop
                    offset="0%"
                    stopColor="var(--color-brand)"
                    stopOpacity={0.32}
                  />
                  <stop
                    offset="100%"
                    stopColor="var(--color-brand)"
                    stopOpacity={0.01}
                  />
                </linearGradient>
              </defs>
              <CartesianGrid
                vertical={false}
                stroke="var(--color-border-subtle)"
              />
              <XAxis
                dataKey="date"
                tickFormatter={(d: string) =>
                  displayDate(
                    d,
                    data?.granularity === "month"
                      ? { month: "short", year: "2-digit" }
                      : { day: "numeric", month: "short" },
                  )
                }
                tick={{ fontSize: 11, fill: "var(--color-foreground-muted)" }}
                axisLine={{ stroke: "var(--color-border-subtle)" }}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 11, fill: "var(--color-foreground-muted)" }}
                axisLine={false}
                tickLine={false}
                width={48}
              />
              <Tooltip
                cursor={{
                  stroke: "var(--color-border)",
                  strokeDasharray: "3 3",
                }}
                content={(props) => (
                  <RevenueTooltip
                    {...props}
                    money={money}
                    granularity={data!.granularity}
                  />
                )}
              />
              <Area
                type="monotone"
                dataKey="revenue"
                stroke="var(--color-brand)"
                strokeWidth={2}
                fill="url(#revenueFill)"
                dot={false}
                activeDot={{
                  r: 5,
                  fill: "var(--color-brand)",
                  stroke: "var(--color-surface-elevated)",
                  strokeWidth: 2,
                }}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </Card>

      <Card className="p-5">
        <h2 className="mb-4 text-base font-semibold text-foreground">
          Métodos de pago
        </h2>
        {isLoading ? (
          <p className="py-16 text-center text-sm text-foreground-muted">
            Cargando…
          </p>
        ) : isError ? (
          <p className="py-16 text-center text-sm text-danger">
            No se pudo cargar el resumen de pagos.
          </p>
        ) : !hasPayments ? (
          <p className="py-16 text-center text-sm text-foreground-muted">
            Aún no hay ventas registradas.
          </p>
        ) : (
          <div>
            <div className="relative mx-auto h-[180px] w-[180px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={data!.paymentMethods}
                    dataKey="revenue"
                    nameKey="method"
                    innerRadius={62}
                    outerRadius={88}
                    paddingAngle={3}
                    stroke="none"
                  >
                    {data!.paymentMethods.map((entry, i) => (
                      <Cell
                        key={entry.method}
                        fill={
                          PAYMENT_COLORS[entry.method] ??
                          FALLBACK_COLORS[i % FALLBACK_COLORS.length]
                        }
                      />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value) => money(Number(value))}
                    contentStyle={{
                      background: "var(--color-surface-elevated)",
                      border: "1px solid var(--color-border-subtle)",
                      borderRadius: 10,
                      fontSize: 12,
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <p className="text-[11px] text-foreground-muted">Total</p>
                <p className="text-base font-bold text-foreground">
                  {money(paymentTotal)}
                </p>
              </div>
            </div>

            <div className="mt-5 flex flex-col gap-3">
              {data!.paymentMethods.map((m, i) => {
                const pct =
                  paymentTotal > 0 ? (m.revenue / paymentTotal) * 100 : 0;
                return (
                  <div
                    key={m.method}
                    className="flex items-center gap-3 text-sm"
                  >
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{
                        background:
                          PAYMENT_COLORS[m.method] ??
                          FALLBACK_COLORS[i % FALLBACK_COLORS.length],
                      }}
                    />
                    <span className="min-w-0 flex-1 truncate font-medium capitalize text-foreground">
                      {PAYMENT_LABELS[m.method] ?? m.method.toLowerCase()}
                    </span>
                    <span className="shrink-0 text-foreground-muted">
                      {m.count}×
                    </span>
                    <span className="w-11 shrink-0 text-right text-foreground-muted">
                      {pct.toFixed(0)}%
                    </span>
                    <span className="w-20 shrink-0 text-right font-medium text-foreground">
                      {money(m.revenue)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </Card>

      <Card className="p-5 lg:col-span-3">
        <h2 className="mb-4 text-base font-semibold text-foreground">
          Productos más vendidos — {rangeLabel.toLowerCase()}
        </h2>
        {isLoading ? (
          <p className="py-16 text-center text-sm text-foreground-muted">
            Cargando…
          </p>
        ) : isError ? (
          <p className="py-16 text-center text-sm text-danger">
            No se pudo cargar el resumen de productos.
          </p>
        ) : !hasProducts ? (
          <p className="py-16 text-center text-sm text-foreground-muted">
            Aún no hay ventas registradas.
          </p>
        ) : (
          <div className="flex flex-col gap-1">
            {data!.topProducts.map((p, i) => (
              <div
                key={p.name}
                className="group flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg px-2 py-2.5 transition-colors hover:bg-surface-muted sm:flex-nowrap"
              >
                <span className="order-1 w-4 shrink-0 text-xs font-medium text-foreground-muted sm:order-1">
                  {i + 1}
                </span>
                <span className="order-2 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-soft text-xs font-semibold text-brand sm:order-2">
                  {p.name.trim().slice(0, 1).toUpperCase()}
                </span>
                <span className="order-3 min-w-0 flex-1 truncate text-sm font-medium text-foreground sm:order-3 sm:w-48 sm:flex-none">
                  {p.name}
                </span>
                <span className="order-4 shrink-0 text-right text-sm text-foreground-muted sm:order-5 sm:w-20">
                  {p.quantity} vendidos
                </span>
                <span className="order-5 shrink-0 text-right text-sm font-semibold text-foreground sm:order-6 sm:w-24">
                  {money(p.revenue)}
                </span>
                <div className="order-6 h-1.5 w-full shrink-0 overflow-hidden rounded-full bg-surface-muted sm:order-4 sm:w-auto sm:flex-1">
                  <div
                    className="h-full rounded-full bg-brand transition-all duration-500"
                    style={{
                      width: `${Math.max(4, (p.quantity / maxQuantity) * 100)}%`,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
      </div>
    </div>
  );
}
