"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { UserPlus } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Field } from "@/components/ui/Field";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/Toast";
import { usePasswordConfirm } from "@/components/PasswordConfirm";
import { useUsers, useCreateUser, useUpdateUser } from "@/hooks/useAuth";
import { useMe } from "@/hooks/useAuth";

const createSchema = z.object({
  name: z.string().trim().min(1, "El nombre es obligatorio"),
  email: z.string().trim().toLowerCase().email("Ingresa un correo electrónico válido"),
  password: z.string().min(8, "Debe tener al menos 8 caracteres"),
  role: z.enum(["admin", "cashier"]),
});
type CreateForm = z.infer<typeof createSchema>;

export function UsersPanel() {
  const { data: users } = useUsers();
  const { data: me } = useMe();
  const createUser = useCreateUser();
  const updateUser = useUpdateUser();
  const { show } = useToast();
  const { withPasswordConfirm } = usePasswordConfirm();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CreateForm>({ resolver: zodResolver(createSchema), defaultValues: { role: "cashier" } });

  const [showForm, setShowForm] = useState(false);

  async function onCreate(values: CreateForm) {
    const result = await withPasswordConfirm("crear este acceso de personal", (confirmPassword) =>
      createUser.mutateAsync({ ...values, confirmPassword })
    );
    if (result) {
      show("Cuenta de personal creada", "success");
      reset({ role: "cashier" });
      setShowForm(false);
    }
  }

  async function toggleActive(id: number, active: boolean) {
    const result = await withPasswordConfirm(active ? "activar este usuario" : "desactivar este usuario", (confirmPassword) =>
      updateUser.mutateAsync({ id, data: { active, confirmPassword } })
    );
    if (result) show(active ? "Usuario activado" : "Usuario desactivado", "success");
  }

  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-foreground">Cuentas del personal</h2>
        <Button onClick={() => setShowForm((s) => !s)}>
          <UserPlus className="h-4 w-4" aria-hidden="true" />
          Agregar personal
        </Button>
      </div>

      {showForm && (
        <Card className="p-6">
          <form onSubmit={handleSubmit(onCreate)} noValidate className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Nombre" error={errors.name?.message} {...register("name")} />
            <Field label="Correo electrónico" type="email" error={errors.email?.message} {...register("email")} />
            <Field label="Contraseña" type="password" error={errors.password?.message} {...register("password")} />
            <Select
              label="Rol"
              options={[
                { value: "cashier", label: "Cajero" },
                { value: "admin", label: "Administrador" },
              ]}
              {...register("role")}
            />
            <div className="sm:col-span-2">
              <Button type="submit" disabled={isSubmitting}>Crear cuenta</Button>
            </div>
          </form>
        </Card>
      )}

      <Card className="p-5">
        <div className="overflow-x-auto">
          <table className="w-full min-w-max text-left text-sm">
            <thead>
              <tr className="text-xs uppercase text-foreground/50">
                <th className="py-2 pr-4">Nombre</th>
                <th className="py-2 pr-4">Correo electrónico</th>
                <th className="py-2 pr-4">Rol</th>
                <th className="py-2 pr-4">Estado</th>
                <th className="py-2 text-right">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {users?.map((u) => (
                <tr key={u.id}>
                  <td className="py-2.5 pr-4 font-medium text-foreground">
                    {u.name}
                    {u.id === me?.id && <span className="ml-2 text-xs text-foreground/40">(tú)</span>}
                  </td>
                  <td className="py-2.5 pr-4 text-foreground/70">{u.email}</td>
                  <td className="py-2.5 pr-4 text-foreground/70">
                    {u.role === "admin" ? "Administrador" : "Cajero"}
                  </td>
                  <td className="py-2.5 pr-4">
                    <span
                      className={
                        u.active
                          ? "rounded-full bg-success/10 px-2.5 py-1 text-xs font-semibold text-success"
                          : "rounded-full bg-foreground/10 px-2.5 py-1 text-xs font-semibold text-foreground/50"
                      }
                    >
                      {u.active ? "Activo" : "Desactivado"}
                    </span>
                  </td>
                  <td className="py-2.5 text-right">
                    {u.id !== me?.id && (
                      <button
                        onClick={() => toggleActive(u.id, !u.active)}
                        className="text-sm font-medium text-brand hover:underline"
                      >
                        {u.active ? "Desactivar" : "Activar"}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
