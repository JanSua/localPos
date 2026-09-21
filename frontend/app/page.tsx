import type { Metadata } from "next";
import Link from "next/link";
import {
  WifiOff,
  Lock,
  Receipt,
  ScanBarcode,
  Users,
  GitFork,
  ChevronDown,
} from "lucide-react";
import { BrandFooter } from "@/components/BrandFooter";
import { HomeAuthRedirect } from "@/components/HomeAuthRedirect";
import { QuickstartCommand } from "@/components/QuickstartCommand";
import { ReceiptHero } from "@/components/ReceiptHero";

const title =
  "Software POS gratis – Sin conexión, código abierto, sin suscripción";
const description =
  "nodedr-pos es un software de punto de venta gratuito y de código abierto para pequeñas tiendas minoristas. Funciona totalmente sin conexión, autoalojado en tu propia máquina, sin suscripción ni comisiones por venta, con facturación compatible con GST para India.";

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: "/" },
  openGraph: { title, description, url: "/" },
  twitter: { title, description },
};

const GITHUB_URL = "https://github.com/Raktim94/nodedr-pos";

const FEATURES = [
  {
    icon: WifiOff,
    title: "Funciona totalmente sin conexión",
    body: "Las ventas, el inventario y la impresión de recibos se ejecutan en tu propia máquina mediante Docker o un instalador nativo para Windows/Debian — no se necesita conexión a internet para realizar una venta.",
  },
  {
    icon: Lock,
    title: "Autoalojado, tus datos se quedan contigo",
    body: "No hay cuenta en la nube ni nada que sincronizar. Los datos de ventas y clientes viven en una base de datos local en hardware que tú controlas.",
  },
  {
    icon: Receipt,
    title: "Facturación compatible con GST para India",
    body: "Precios MRP con GST incluido, códigos HSN/SAC por producto y desglose CGST/SGST en cada recibo impreso o PDF.",
  },
  {
    icon: ScanBarcode,
    title: "Escaneo de códigos de barras y etiquetas",
    body: "Escanea para cobrar con un lector de códigos de barras USB, además de un generador integrado para imprimir etiquetas en artículos que aún no las tienen.",
  },
  {
    icon: Users,
    title: "Clientes, deudas y lealtad",
    body: "Controla las deudas de clientes, el crédito en tienda y un programa de lealtad por puntos sin una suscripción a un CRM externo.",
  },
  {
    icon: GitFork,
    title: "Código abierto, licencia AGPL-3.0",
    body: "El código fuente completo es público en GitHub. Audita exactamente cómo funcionan los precios, la autenticación y los recibos — sin dependencia de proveedores de código cerrado.",
  },
];

const COMPARISON_ROWS: [string, string, string][] = [
  [
    "Suscripción mensual",
    "Ninguna — gratis para siempre",
    "Habitual, por terminal/ubicación",
  ],
  [
    "Funciona sin internet",
    "Sí, totalmente sin conexión",
    "Normalmente requiere conexión en vivo",
  ],
  [
    "Dónde viven tus datos",
    "En tu propia máquina",
    "En los servidores en la nube del proveedor",
  ],
  ["Código fuente", "Código abierto (AGPL-3.0), auditable", "Código cerrado"],
  [
    "Precios indios con GST incluido",
    "Integrado por defecto",
    "Varía, a menudo es un complemento",
  ],
];

const FAQS = [
  {
    q: "¿nodedr-pos es realmente gratis, sin suscripción ni cargos ocultos?",
    a: "Sí. Tiene licencia AGPL-3.0 y es de código abierto — sin suscripción, sin comisión por transacción y sin plan de pago. Lo autoalojas en hardware que ya tienes o en un VPS de bajo costo, así que no hay costo de software recurrente.",
  },
  {
    q: "¿Este software POS gratuito funciona sin internet?",
    a: "Sí. nodedr-pos funciona totalmente sin conexión una vez instalado. La aplicación y su base de datos se ejecutan localmente mediante Docker Compose o un instalador nativo para Windows/Debian, así que el cobro y la impresión de recibos siguen funcionando sin conexión a internet.",
  },
  {
    q: "¿Es seguro el software POS de código abierto para manejar datos de ventas y clientes?",
    a: "Tus datos nunca salen de tus instalaciones a menos que tú decidas alojarlos en otro lugar. Como el código es de código abierto, tú (o cualquiera) puede auditar exactamente cómo maneja contraseñas, precios y registros de clientes, en lugar de confiar en un proveedor en la nube de código cerrado.",
  },
  {
    q: "¿nodedr-pos admite facturación con GST para minoristas indios?",
    a: "Sí. Los precios incluyen GST por defecto, cumpliendo las normas MRP de Metrología Legal de India, con códigos HSN/SAC por producto y un desglose CGST/SGST mostrado en cada recibo.",
  },
  {
    q: "¿Qué necesito para ejecutar este sistema POS gratuito?",
    a: "Cualquier máquina que pueda ejecutar Docker Compose, o un instalador nativo para Windows 10/11 y Debian/Ubuntu. Un lector de códigos de barras USB y una impresora térmica ESC/POS son compatibles pero opcionales.",
  },
];

const faqSchema = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: FAQS.map((f) => ({
    "@type": "Question",
    name: f.q,
    acceptedAnswer: { "@type": "Answer", text: f.a },
  })),
};

export default function HomePage() {
  return (
    <>
      <HomeAuthRedirect />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
      />
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-20 px-4 py-12 sm:py-16">
        <section className="flex flex-col items-center gap-10 lg:flex-row lg:items-center lg:gap-14">
          <div className="flex flex-col items-center gap-6 text-center lg:items-start lg:text-left">
            <h1 className="max-w-xl text-3xl font-bold tracking-tight text-foreground sm:text-5xl">
              Software POS gratis que funciona completamente sin conexión
            </h1>
            <p className="max-w-lg text-balance text-base text-foreground/70 sm:text-lg">
              nodedr-pos es un software de punto de venta e inventario de código
              abierto para pequeñas tiendas minoristas. Autoalojado en tu propia
              máquina, sin suscripción, sin comisión por venta y sin necesidad
              de conexión a internet para realizar una venta.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3 lg:justify-start">
              <Link
                href="/onboarding"
                className="inline-flex items-center gap-2 rounded-lg bg-brand px-5 py-2.5 text-sm font-semibold text-brand-foreground shadow-sm transition-all hover:-translate-y-px hover:opacity-90 hover:shadow-lg hover:shadow-brand/20"
              >
                Comenzar — gratis
              </Link>
              <Link
                href="/login"
                className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface-muted px-5 py-2.5 text-sm font-semibold text-foreground transition-colors hover:bg-border"
              >
                Iniciar sesión
              </Link>
            </div>
            <a
              href={GITHUB_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm text-foreground/60 underline-offset-2 hover:text-foreground hover:underline"
            >
              <GitFork className="h-3.5 w-3.5" aria-hidden="true" />
              Ver código fuente en GitHub
            </a>
          </div>
          <div className="flex w-full justify-center lg:w-auto lg:justify-end">
            <ReceiptHero />
          </div>
        </section>

        <section
          aria-labelledby="features-heading"
          className="flex flex-col gap-6"
        >
          <h2
            id="features-heading"
            className="text-xl font-semibold text-foreground"
          >
            Por qué las pequeñas tiendas lo eligen
          </h2>
          <div className="grid grid-cols-1 gap-x-8 divide-y divide-border rounded-xl border border-border sm:grid-cols-2 sm:divide-y-0">
            {FEATURES.map(({ icon: Icon, title: t, body }, i) => (
              <div
                key={t}
                className={`flex gap-4 px-5 py-5 ${i % 2 === 0 ? "sm:border-r sm:border-border" : ""} ${i >= 2 ? "sm:border-t sm:border-border" : ""}`}
              >
                <Icon
                  className="mt-0.5 h-5 w-5 shrink-0 text-brand"
                  aria-hidden="true"
                />
                <div>
                  <h3 className="font-semibold text-foreground">{t}</h3>
                  <p className="mt-1 text-sm text-foreground/70">{body}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section
          aria-labelledby="compare-heading"
          className="flex flex-col gap-6"
        >
          <h2
            id="compare-heading"
            className="text-xl font-semibold text-foreground"
          >
            nodedr-pos vs. el típico software POS en la nube
          </h2>
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full min-w-[480px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b-2 border-border">
                  <th className="px-4 py-3 font-semibold text-foreground/70">
                    &nbsp;
                  </th>
                  <th className="px-4 py-3 font-semibold text-foreground">
                    nodedr-pos
                  </th>
                  <th className="px-4 py-3 font-semibold text-foreground/70">
                    POS en la nube típico
                  </th>
                </tr>
              </thead>
              <tbody>
                {COMPARISON_ROWS.map(([label, ours, theirs]) => (
                  <tr
                    key={label}
                    className="border-b border-border last:border-0"
                  >
                    <th
                      scope="row"
                      className="px-4 py-3 font-medium text-foreground/70"
                    >
                      {label}
                    </th>
                    <td className="px-4 py-3 text-foreground">{ours}</td>
                    <td className="px-4 py-3 text-foreground/60">{theirs}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section aria-labelledby="faq-heading" className="flex flex-col gap-6">
          <h2
            id="faq-heading"
            className="text-xl font-semibold text-foreground"
          >
            Preguntas frecuentes
          </h2>
          <div className="divide-y divide-border rounded-xl border border-border">
            {FAQS.map((f) => (
              <details key={f.q} className="faq-row group px-5 py-4">
                <summary className="flex cursor-pointer items-center justify-between gap-4 font-medium text-foreground">
                  {f.q}
                  <ChevronDown
                    className="h-4 w-4 shrink-0 text-foreground/50 transition-transform duration-200 group-open:rotate-180"
                    aria-hidden="true"
                  />
                </summary>
                <p className="mt-3 text-sm text-foreground/70">{f.a}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="flex flex-col items-center gap-4 rounded-xl border border-border bg-surface-muted px-6 py-10 pb-8 text-center">
          <h2 className="text-2xl font-semibold text-foreground">
            Comienza gratis
          </h2>
          <p className="max-w-xl text-sm text-foreground/70">
            Elige tu sistema operativo y ejecuta un comando — verifica si hay
            Docker, lo instala si falta y luego instala e inicia nodedr-pos. Sin
            registro, sin tarjeta de crédito, sin período de prueba.
          </p>
          <QuickstartCommand />
          <p className="max-w-xl text-xs text-foreground/60">
            ¿Prefieres no usar Docker en absoluto? Descarga el{" "}
            <a
              href={`${GITHUB_URL}/releases/latest`}
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-2 hover:text-foreground"
            >
              instalador nativo para Windows o Debian/Ubuntu
            </a>{" "}
            en su lugar, o consulta el{" "}
            <a
              href={GITHUB_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-2 hover:text-foreground"
            >
              código fuente completo en GitHub
            </a>
            .
          </p>
        </section>

        <BrandFooter />
      </main>
    </>
  );
}
