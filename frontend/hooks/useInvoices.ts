"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { Invoice } from "@/lib/types";

export interface SalesSummary {
  todaysCount: number;
  todaysRevenue: number;
  totalSales: number;
  totalRevenue: number;
}

export interface SalesAnalytics {
  trend: { date: string; revenue: number; count: number }[];
  topProducts: { name: string; quantity: number; revenue: number }[];
  paymentMethods: { method: string; count: number; revenue: number }[];
  granularity: "day" | "month";
}

export function useInvoices(search = "") {
  return useQuery({
    queryKey: ["invoices", search],
    queryFn: () => api.get<Invoice[]>(`/invoices${search ? `?q=${encodeURIComponent(search)}` : ""}`),
  });
}

export function useSalesSummary() {
  return useQuery({
    queryKey: ["invoices", "summary"],
    queryFn: () => api.get<SalesSummary>("/invoices/summary"),
    refetchInterval: 30_000,
  });
}

export function useInvoice(id: number | null) {
  return useQuery({
    queryKey: ["invoice", id],
    queryFn: () => api.get<Invoice>(`/invoices/${id}`),
    enabled: id != null,
  });
}

export function useVoidInvoice() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      reason,
    }: {
      id: number;
      reason: string;
    }) => api.post<{ message: string }>(`/invoices/${id}/void`, { reason }),
    onSuccess: (_result, variables) => {
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      queryClient.invalidateQueries({ queryKey: ["invoice", variables.id] });
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["returns"] });
    },
  });
}

export function useSalesAnalytics(from?: string, to?: string) {
  const query = new URLSearchParams();
  if (from) query.set("from", from);
  if (to) query.set("to", to);
  const search = query.toString();

  return useQuery({
    queryKey: ["invoices", "analytics", from, to],
    queryFn: () =>
      api.get<SalesAnalytics>(
        `/invoices/analytics${search ? `?${search}` : ""}`,
      ),
    refetchInterval: 60_000,
    enabled: Boolean(from) === Boolean(to),
  });
}
