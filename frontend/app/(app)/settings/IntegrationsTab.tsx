"use client";

import { useState } from "react";
import { Copy, Check, Plus, KeyRound } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Field } from "@/components/ui/Field";
import { Toggle } from "@/components/ui/Toggle";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/Toast";
import { usePasswordConfirm } from "@/components/PasswordConfirm";
import { useApiKeys, useCreateApiKey, useUpdateApiKey, useDeleteApiKey } from "@/hooks/useApiKeys";
import { describeApiError } from "@/lib/api";
import type { ApiKey, ApiKeyWithSecrets } from "@/lib/types";

export function IntegrationsTab() {
  const { data: keys, isLoading } = useApiKeys();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ApiKey | null>(null);
  const [revealed, setRevealed] = useState<ApiKeyWithSecrets | null>(null);

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <Card className="p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-foreground">External Stock API</h2>
            <p className="mt-1 text-sm text-foreground/60">
              Lets another system — e.g. an e-commerce storefront — read live stock for products you link by SKU,
              and (if the key allows it) report its own sales back so stock stays in sync automatically. Products are
              matched by the SKU field on each product (Inventory → edit product); a product with no SKU is never
              exposed here.
            </p>
          </div>
          <KeyRound className="h-5 w-5 shrink-0 text-foreground/30" aria-hidden="true" />
        </div>
        <Button
          className="mt-4"
          onClick={() => {
            setEditing(null);
            setFormOpen(true);
          }}
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          New API key
        </Button>

        {isLoading ? (
          <p className="mt-4 text-sm text-foreground/50">Loading…</p>
        ) : !keys || keys.length === 0 ? (
          <p className="mt-4 text-sm text-foreground/50">No integrations yet.</p>
        ) : (
          <ul className="mt-4 flex flex-col divide-y divide-border">
            {keys.map((k) => (
              <ApiKeyRow
                key={k.id}
                apiKey={k}
                onEdit={() => {
                  setEditing(k);
                  setFormOpen(true);
                }}
                onRevealed={setRevealed}
              />
            ))}
          </ul>
        )}
      </Card>

      {formOpen && (
        <ApiKeyFormModal
          editing={editing}
          onClose={() => setFormOpen(false)}
          onCreated={(result) => {
            setFormOpen(false);
            setRevealed(result);
          }}
        />
      )}
      {revealed && <SecretRevealModal result={revealed} onClose={() => setRevealed(null)} />}
    </div>
  );
}

function ApiKeyRow({
  apiKey,
  onEdit,
  onRevealed,
}: {
  apiKey: ApiKey;
  onEdit: () => void;
  onRevealed: (r: ApiKeyWithSecrets) => void;
}) {
  const { show } = useToast();
  const { withPasswordConfirm } = usePasswordConfirm();
  const update = useUpdateApiKey();
  const del = useDeleteApiKey();

  async function toggleRevoke() {
    const result = await withPasswordConfirm(apiKey.revoked ? "re-enable this key" : "revoke this key", (confirmPassword) =>
      update.mutateAsync({ id: apiKey.id, revoked: !apiKey.revoked, confirmPassword })
    );
    if (result) show(apiKey.revoked ? "Key re-enabled" : "Key revoked", "success");
  }

  async function remove() {
    if (!window.confirm(`Delete "${apiKey.name}"? Anything using this key will stop working immediately.`)) return;
    const result = await withPasswordConfirm("delete this API key", (confirmPassword) =>
      del.mutateAsync({ id: apiKey.id, confirmPassword })
    );
    if (result !== undefined) show("Key deleted", "success");
  }

  void onRevealed; // reserved for a future "rotate" action on this row

  return (
    <li className="flex flex-wrap items-center justify-between gap-3 py-3">
      <div>
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium text-foreground">{apiKey.name}</p>
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-medium ${
              apiKey.canWrite ? "bg-brand/10 text-brand" : "bg-surface-muted text-foreground/60"
            }`}
          >
            {apiKey.canWrite ? "Read + write" : "Read-only"}
          </span>
          {apiKey.revoked && (
            <span className="rounded-full bg-danger/10 px-2 py-0.5 text-xs font-medium text-danger">Revoked</span>
          )}
        </div>
        <p className="mt-0.5 text-xs text-foreground/50">
          nk_live_{apiKey.keyPrefix}… · {apiKey.webhookUrl ? "webhook configured" : "no webhook"} ·{" "}
          {apiKey.lastUsedAt ? `last used ${new Date(apiKey.lastUsedAt).toLocaleString()}` : "never used"}
        </p>
      </div>
      <div className="flex gap-2">
        <Button variant="secondary" onClick={onEdit}>
          Edit
        </Button>
        <Button variant="secondary" onClick={toggleRevoke} disabled={update.isPending}>
          {apiKey.revoked ? "Re-enable" : "Revoke"}
        </Button>
        <Button variant="danger" onClick={remove} disabled={del.isPending}>
          Delete
        </Button>
      </div>
    </li>
  );
}

// Conditionally mounted by the parent instead of taking an `open` prop —
// see feedback memory on this app's react-hooks/set-state-in-effect rule:
// initializing state from props needs a clean mount, not an effect that
// resets on every open.
function ApiKeyFormModal({
  editing,
  onClose,
  onCreated,
}: {
  editing: ApiKey | null;
  onClose: () => void;
  onCreated: (result: ApiKeyWithSecrets) => void;
}) {
  const { show } = useToast();
  const { withPasswordConfirm } = usePasswordConfirm();
  const create = useCreateApiKey();
  const update = useUpdateApiKey();
  const [name, setName] = useState(editing?.name ?? "");
  const [canWrite, setCanWrite] = useState(editing?.canWrite ?? false);
  const [webhookUrl, setWebhookUrl] = useState(editing?.webhookUrl ?? "");
  const [error, setError] = useState<string | null>(null);
  const busy = create.isPending || update.isPending;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      if (editing) {
        // Only send `webhookUrl` when it actually changed — the backend
        // rotates the webhook secret whenever that field is present in a
        // PUT, so including it unchanged on every rename/toggle edit would
        // silently invalidate a storefront's already-configured secret.
        const webhookChanged = webhookUrl !== (editing.webhookUrl ?? "");
        const result = await withPasswordConfirm("update this API key", (confirmPassword) =>
          update.mutateAsync({
            id: editing.id,
            name,
            canWrite,
            confirmPassword,
            ...(webhookChanged ? { webhookUrl } : {}),
          })
        );
        if (result) {
          if (result.webhookSecret) {
            onCreated(result); // webhook URL changed — new secret to show once
          } else {
            show("API key updated", "success");
            onClose();
          }
        }
      } else {
        const result = await withPasswordConfirm("create this API key", (confirmPassword) =>
          create.mutateAsync({ name, canWrite, webhookUrl, confirmPassword })
        );
        if (result) onCreated(result);
      }
    } catch (err) {
      setError(describeApiError(err, "Could not save this API key"));
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 px-4" role="dialog" aria-modal="true">
      <Card className="w-full max-w-md p-6">
        <h2 className="text-base font-semibold text-foreground">{editing ? "Edit API key" : "New API key"}</h2>
        <form onSubmit={submit} className="mt-4 flex flex-col gap-4">
          <Field
            label="Name"
            placeholder="e.g. Photorbit.in storefront"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
          <Toggle
            label="Allow write access"
            description="Lets this key adjust stock (e.g. report a sale). Off = read-only stock lookups."
            checked={canWrite}
            onChange={setCanWrite}
          />
          <div>
            <Field
              label="Webhook URL (optional)"
              type="url"
              placeholder="https://your-storefront.com/api/webhooks/nodedr-pos"
              value={webhookUrl}
              onChange={(e) => setWebhookUrl(e.target.value)}
            />
            <p className="mt-1 text-xs text-foreground/50">
              If set, this shop notifies that URL (HTTPS only, signed) whenever a linked product&apos;s stock
              changes — a sale, a return, or a manual edit.
            </p>
          </div>
          {error && <p className="text-sm text-danger">{error}</p>}
          <div className="mt-1 flex gap-3">
            <Button type="button" variant="secondary" className="flex-1" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" className="flex-1" disabled={busy || !name}>
              {busy ? "Saving…" : editing ? "Save changes" : "Create key"}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}

function SecretRevealModal({ result, onClose }: { result: ApiKeyWithSecrets; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4" role="dialog" aria-modal="true">
      <Card className="w-full max-w-lg p-6">
        <h2 className="text-base font-semibold text-foreground">
          {result.apiKey ? "API key created" : "Webhook secret rotated"}
        </h2>
        <p className="mt-1 text-sm text-warning">
          Copy these now — for your security, they are shown only once and cannot be retrieved again.
        </p>
        <div className="mt-4 flex flex-col gap-3">
          {result.apiKey && <SecretField label="API key" value={result.apiKey} />}
          {result.webhookSecret && <SecretField label="Webhook signing secret" value={result.webhookSecret} />}
        </div>
        {result.apiKey && (
          <p className="mt-3 text-xs text-foreground/50">
            Send it as <code className="rounded bg-surface-muted px-1 py-0.5">Authorization: Bearer &lt;key&gt;</code> on
            every call to <code className="rounded bg-surface-muted px-1 py-0.5">/api/external/...</code>.
          </p>
        )}
        {result.webhookSecret && (
          <p className="mt-1 text-xs text-foreground/50">
            Verify each webhook delivery&apos;s{" "}
            <code className="rounded bg-surface-muted px-1 py-0.5">X-Nodedr-Signature</code> header — it&apos;s an
            HMAC-SHA256 of the raw request body using this secret, formatted as{" "}
            <code className="rounded bg-surface-muted px-1 py-0.5">sha256=&lt;hex&gt;</code>.
          </p>
        )}
        <Button className="mt-5 w-full" onClick={onClose}>
          I&apos;ve copied these — close
        </Button>
      </Card>
    </div>
  );
}

function SecretField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-sm font-medium text-foreground">{label}</label>
      <div className="flex items-center gap-2">
        <code className="flex-1 overflow-x-auto rounded-lg border border-border bg-surface-muted px-3 py-2.5 text-xs text-foreground">
          {value}
        </code>
        <Button type="button" variant="secondary" onClick={copy} aria-label={`Copy ${label}`}>
          {copied ? <Check className="h-4 w-4" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
        </Button>
      </div>
    </div>
  );
}
