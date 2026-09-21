import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import { themeInitScript } from "@/lib/theme";

// Créditos originales:
// Creado por Nodedr Infotech Private Limited - https://www.nodedr.com
// Adaptado y renombrado a LocalPos por JanSua - https://github.com/JanSua/localPos

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:1994";
const description =
  "LocalPos es un sistema de punto de venta y gestión de inventarios gratuito, de código abierto y con funcionamiento sin conexión para pequeñas tiendas minoristas. Sin suscripciones, no requiere internet.";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "LocalPos | Punto de venta y gestión de inventarios sin conexión",
    template: "%s | LocalPos",
  },
  description,
  openGraph: {
    type: "website",
    siteName: "LocalPos",
    title: "LocalPos | Punto de venta y gestión de inventarios sin conexión",
    description,
  },
  twitter: {
    card: "summary",
    title: "LocalPos | Punto de venta y gestión de inventarios sin conexión",
    description,
  },
};

const structuredData = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "LocalPos",
  applicationCategory: "BusinessApplication",
  operatingSystem: "Windows, Linux, Docker",
  description,
  url: "https://github.com/JanSua/localPos",
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "COP",
  },
  publisher: {
    "@type": "Organization",
    name: "LocalPos",
    url: "https://github.com/JanSua/localPos",
  },
  // Créditos al creador original
  creator: {
    "@type": "Organization",
    name: "Nodedr Infotech Private Limited",
    url: "https://www.nodedr.com",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="es"
      data-theme="dark"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
        />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
