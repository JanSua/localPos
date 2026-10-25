"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Pencil, Plus, Search, Star, Trash2, X } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { useToast } from "@/components/Toast";
import {
  useCustomers,
  useCreateCustomer,
  useDeleteCustomer,
  useUpdateCustomer,
} from "@/hooks/useCustomers";
import { useMe } from "@/hooks/useAuth";
import { usePasswordConfirm } from "@/components/PasswordConfirm";
import { useShopSettings } from "@/hooks/useShopSettings";
import { formatColombiaDateTime } from "@/lib/colombia-time";
import { formatMoney } from "@/lib/format";
import { ApiError } from "@/lib/api";
import type { Customer } from "@/lib/types";

const schema = z.object({
  name: z.string().trim().min(1, "El nombre es obligatorio"),
  phone: z.string().trim().min(3, "El teléfono es obligatorio"),
  email: z.string().trim().optional(),
});
type Form = z.infer<typeof schema>;

export default function CustomersPage() {
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const { data: customers, isLoading } = useCustomers(search);
  const { data: user } = useMe();
  const { data: shop } = useShopSettings();
  const createCustomer = useCreateCustomer();
  const updateCustomer = useUpdateCustomer();
  const deleteCustomer = useDeleteCustomer();
  const { show } = useToast();
  const { withPasswordConfirm } = usePasswordConfirm();
  const isAdmin = user?.role === "admin";
  const sym = shop?.currencySymbol || "Rs.";

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<Form>({ resolver: zodResolver(schema) });

  function openCreateForm() {
    setEditingCustomer(null);
    reset({ name: "", phone: "", email: "" });
    setShowForm(true);
  }

  function openEditForm(customer: Customer) {
    setEditingCustomer(customer);
    reset({ name: customer.name, phone: customer.phone, email: customer.email ?? "" });
    setShowForm(true);
  }

  async function onSave(values: Form) {
    try {
      if (editingCustomer) {
        await updateCustomer.mutateAsync({ id: editingCustomer.id, data: values });
        show("Cliente actualizado", "success");
      } else {
        await createCustomer.mutateAsync(values);
        show("Cliente agregado", "success");
      }
      reset();
      setShowForm(false);
      setEditingCustomer(null);
    } catch (err) {
      show(
        err instanceof ApiError ? err.message : "No se pudo guardar el cliente",
        "error",
      );
    }
  }

  async function removeCustomer(customer: Customer) {
    if (!window.confirm(`¿Eliminar a ${customer.name}? Las facturas y devoluciones históricas se conservarán.`)) return;
    try {
      const result = await withPasswordConfirm(
        `eliminar al cliente ${customer.name}`,
        async (confirmPassword) => {
          await deleteCustomer.mutateAsync({ id: customer.id, confirmPassword });
          return true;
        },
      );
      if (result) show("Cliente eliminado", "success");
    } catch (err) {
      show(
        err instanceof ApiError ? err.message : "No se pudo eliminar el cliente",
        "error",
      );
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Clientes</h1>
          <p className="text-sm text-foreground/60">
            {shop?.loyaltyEnabled
              ? "Miembros de lealtad y sus puntos."
              : "Tu directorio de clientes."}
          </p>
        </div>
        {!showForm && (
          <Button onClick={openCreateForm}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            Añadir cliente
          </Button>
        )}
      </div>

      {showForm && (
        <Card className="p-6">
          <form
            onSubmit={handleSubmit(onSave)}
            noValidate
            className="grid grid-cols-1 gap-4 sm:grid-cols-3"
          >
            <Field
              label="Nombre"
              error={errors.name?.message}
              {...register("name")}
            />
            <Field
              label="Teléfono"
              error={errors.phone?.message}
              {...register("phone")}
            />
            <Field
              label="Correo electrónico (opcional)"
              {...register("email")}
            />
            <div className="flex items-end gap-2 sm:col-span-3">
              <Button type="submit" disabled={isSubmitting}>
                {editingCustomer ? "Guardar cambios" : "Guardar cliente"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setShowForm(false);
                  setEditingCustomer(null);
                  reset();
                }}
              >
                <X className="h-4 w-4" aria-hidden="true" /> Cancelar
              </Button>
            </div>
          </form>
        </Card>
      )}

      <Card className="p-5">
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-border px-3 py-2">
          <Search className="h-4 w-4 text-foreground/40" aria-hidden="true" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nombre o teléfono…"
            aria-label="Buscar clientes"
            className="w-full bg-transparent text-sm text-foreground outline-none placeholder:text-foreground/40"
          />
        </div>

        {isLoading ? (
          <p className="py-10 text-center text-sm text-foreground/50">
            Cargando...
          </p>
        ) : !customers || customers.length === 0 ? (
          <p className="py-10 text-center text-sm text-foreground/50">
            Sin clientes aún.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-max text-left text-sm">
              <thead>
                <tr className="text-xs uppercase text-foreground/50">
                  <th className="py-2 pr-4">Nombre</th>
                  <th className="py-2 pr-4">Teléfono</th>
                  <th className="py-2 pr-4">Correo electrónico</th>
                  <th className="py-2 pr-4">Registro</th>
                  <th className="py-2 pr-4 text-right">Visitas</th>
                  <th className="py-2 pr-4 text-right">Total gastado</th>
                  {shop?.loyaltyEnabled && (
                    <th className="py-2 text-right">Puntos</th>
                  )}
                  <th className="py-2 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {customers.map((c) => (
                  <tr key={c.id}>
                    <td className="py-2.5 pr-4 font-medium text-foreground">
                      {c.name}
                    </td>
                    <td className="py-2.5 pr-4 text-foreground/70">
                      {c.phone}
                    </td>
                    <td className="py-2.5 pr-4 text-foreground/70">
                      {c.email || "—"}
                    </td>
                    <td className="py-2.5 pr-4 text-foreground/70">
                      {formatColombiaDateTime(c.createdAt)}
                    </td>
                    <td className="py-2.5 pr-4 text-right text-foreground/70">
                      {c.visits}
                    </td>
                    <td className="py-2.5 pr-4 text-right text-foreground/70">
                      {formatMoney(c.totalSpent, sym)}
                    </td>
                    {shop?.loyaltyEnabled && (
                      <td className="py-2.5 text-right">
                        <span className="inline-flex items-center gap-1 rounded-full bg-warning/10 px-2.5 py-1 text-xs font-semibold text-warning">
                          <Star className="h-3 w-3" aria-hidden="true" />
                          {c.loyaltyPoints}
                        </span>
                      </td>
                    )}
                    <td className="py-2.5 text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          type="button"
                          variant="secondary"
                          className="px-2.5 py-1.5"
                          aria-label={`Editar ${c.name}`}
                          title="Editar cliente"
                          onClick={() => openEditForm(c)}
                        >
                          <Pencil className="h-4 w-4" aria-hidden="true" />
                        </Button>
                        {isAdmin && (
                          <Button
                            type="button"
                            variant="danger"
                            className="px-2.5 py-1.5"
                            aria-label={`Eliminar ${c.name}`}
                            title="Eliminar cliente"
                            onClick={() => removeCustomer(c)}
                          >
                            <Trash2 className="h-4 w-4" aria-hidden="true" />
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

    </div>
  );
}
