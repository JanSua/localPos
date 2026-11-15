interface DymoPrinterInfo {
  name: string;
  modelName: string;
  printerType: string;
  isConnected: boolean;
}

interface DymoLabel {
  getObjectNames: () => string[];
  setObjectText: (objectName: string, value: string) => DymoLabel;
  printAsync: (
    printerName: string,
    printParamsXml?: string,
  ) => PromiseLike<unknown>;
}

interface DymoFramework {
  init: (callback: () => void) => void;
  currentFramework: number;
  getPrintersAsync: () => PromiseLike<DymoPrinterInfo[]>;
  openLabelXml: (labelXml: string) => DymoLabel;
  createTapePrintParamsXml: (params: { copies: number }) => string;
}

export interface BarcodeLabelOptions {
  widthMm: number;
  fontSize: number;
}

export const MIN_BARCODE_LABEL_WIDTH_MM = 35;
export const MAX_BARCODE_LABEL_WIDTH_MM = 67;
export const MIN_BARCODE_LABEL_FONT_SIZE = 6;
export const MAX_BARCODE_LABEL_FONT_SIZE = 16;
export const DEFAULT_BARCODE_LABEL_OPTIONS: BarcodeLabelOptions = {
  widthMm: 67,
  fontSize: 11.6,
};
export const BARCODE_LABEL_OPTIONS_STORAGE_KEY =
  "localpos.barcode-label-settings";

declare global {
  interface Window {
    dymo?: {
      label?: {
        framework?: DymoFramework;
      };
    };
  }
}

function getRequiredElement<T extends Element>(
  root: ParentNode,
  selector: string,
): T {
  const element = root.querySelector<T>(selector);
  if (!element) {
    throw new Error(`La plantilla DYMO no contiene ${selector}`);
  }
  return element;
}

function configureLabelXml(
  xml: string,
  options: BarcodeLabelOptions,
): string {
  const document = new DOMParser().parseFromString(xml, "application/xml");
  if (document.querySelector("parsererror")) {
    throw new Error("La plantilla DYMO contiene XML inválido");
  }
  if (
    !Number.isFinite(options.widthMm) ||
    options.widthMm < MIN_BARCODE_LABEL_WIDTH_MM ||
    options.widthMm > MAX_BARCODE_LABEL_WIDTH_MM ||
    !Number.isFinite(options.fontSize) ||
    options.fontSize < MIN_BARCODE_LABEL_FONT_SIZE ||
    options.fontSize > MAX_BARCODE_LABEL_FONT_SIZE
  ) {
    throw new Error("Los ajustes de la etiqueta están fuera del rango permitido");
  }

  const labelWidth = getRequiredElement(
    document,
    "DYMORect > Size > Width",
  );
  const labelStart = getRequiredElement(
    document,
    "DYMORect > DYMOPoint > X",
  );
  const originalWidth = Number(labelWidth.textContent);
  const widthInches = options.widthMm / 25.4;
  const scale = widthInches / originalWidth;
  const startX = Number(labelStart.textContent);

  if (!Number.isFinite(originalWidth) || originalWidth <= 0 || !Number.isFinite(startX)) {
    throw new Error("Las dimensiones de la plantilla DYMO no son válidas");
  }

  labelWidth.textContent = String(widthInches);
  getRequiredElement(document, "InitialLength").textContent = String(widthInches);

  for (const objectName of ["codigoBarras", "textoProducto"]) {
    const layout = Array.from(document.querySelectorAll("LabelObjects > *")).find(
      (item) => item.querySelector("Name")?.textContent === objectName,
    );
    if (!layout) {
      throw new Error(`La plantilla DYMO no contiene el objeto ${objectName}`);
    }

    const x = getRequiredElement(layout, "ObjectLayout > DYMOPoint > X");
    const width = getRequiredElement(layout, "ObjectLayout > Size > Width");
    const originalX = Number(x.textContent);
    const originalObjectWidth = Number(width.textContent);
    if (!Number.isFinite(originalX) || !Number.isFinite(originalObjectWidth)) {
      throw new Error(`Las dimensiones de ${objectName} no son válidas`);
    }
    x.textContent = String(startX + (originalX - startX) * scale);
    width.textContent = String(originalObjectWidth * scale);
  }

  getRequiredElement(
    document,
    "TextObject > FormattedText LineTextSpan TextSpan FontInfo FontSize",
  ).textContent = String(options.fontSize);

  return new XMLSerializer().serializeToString(document);
}

function getSavedBarcodeLabelOptions(): BarcodeLabelOptions | null {
  const saved = window.localStorage.getItem(BARCODE_LABEL_OPTIONS_STORAGE_KEY);
  if (!saved) return null;

  const value: unknown = JSON.parse(saved);
  if (
    !value ||
    typeof value !== "object" ||
    !("widthMm" in value) ||
    !("fontSize" in value) ||
    typeof value.widthMm !== "number" ||
    typeof value.fontSize !== "number" ||
    !Number.isFinite(value.widthMm) ||
    value.widthMm < MIN_BARCODE_LABEL_WIDTH_MM ||
    value.widthMm > MAX_BARCODE_LABEL_WIDTH_MM ||
    !Number.isFinite(value.fontSize) ||
    value.fontSize < MIN_BARCODE_LABEL_FONT_SIZE ||
    value.fontSize > MAX_BARCODE_LABEL_FONT_SIZE
  ) {
    throw new Error("Los ajustes guardados de etiqueta no son válidos");
  }
  return { widthMm: value.widthMm, fontSize: value.fontSize };
}

let frameworkPromise: Promise<DymoFramework> | null = null;

function loadDymoFramework(): Promise<DymoFramework> {
  if (frameworkPromise) return frameworkPromise;

  const loading = new Promise<DymoFramework>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "/vendor/dymo.connect.framework.js";
    script.async = true;
    script.onload = () => {
      const framework = window.dymo?.label?.framework;
      if (!framework) {
        console.error("[DYMO] El SDK se cargó sin exponer el framework");
        reject(new Error("No se pudo cargar el framework de DYMO"));
        return;
      }

      const timeout = window.setTimeout(
        () => reject(new Error("DYMO Connect no respondió a tiempo")),
        10000,
      );

      try {
        console.info("[DYMO] Iniciando el framework");
        framework.init(() => {
          window.clearTimeout(timeout);
          console.info(
            "[DYMO] Framework inicializado",
            framework.currentFramework === 2 ? "servicio web" : "modo heredado",
          );
          resolve(framework);
        });
      } catch (error) {
        window.clearTimeout(timeout);
        console.error("[DYMO] Falló la inicialización", error);
        reject(
          error instanceof Error
            ? error
            : new Error("No se pudo iniciar DYMO Connect"),
        );
      }
    };
    script.onerror = () => {
      reject(new Error("No se pudo cargar el SDK de DYMO"));
    };
    document.head.appendChild(script);
  });
  const cached = loading.catch((error: unknown) => {
    frameworkPromise = null;
    throw error;
  });
  frameworkPromise = cached;
  return cached;
}

async function getDymoFramework(): Promise<DymoFramework> {
  return loadDymoFramework();
}

export async function printBarcodeLabel(
  name: string,
  value: string,
  onError: (error: Error) => void,
  onSuccess: (printerName: string) => void,
  options?: BarcodeLabelOptions,
): Promise<void> {
  let stage = "carga del SDK";
  try {
    const framework = await getDymoFramework();
    if (framework.currentFramework !== 2) {
      throw new Error(
        "El servicio web de DYMO Connect no está activo. No se usará el modo heredado para evitar abrir DYMO Label.",
      );
    }

    stage = "búsqueda de impresoras";
    const printers = await framework.getPrintersAsync();
    console.info(
      "[DYMO] Impresoras detectadas",
      printers.map(({ name, modelName, printerType, isConnected }) => ({
        name,
        modelName,
        printerType,
        isConnected,
      })),
    );
    const tapePrinters = printers.filter(
      (printer) =>
        printer.printerType === "TapePrinter" && printer.isConnected,
    );
    const labelManager = tapePrinters.filter((printer) =>
      `${printer.name} ${printer.modelName}`
        .toLowerCase()
        .includes("labelmanager 280"),
    );
    const printer =
      labelManager.length === 1
        ? labelManager[0]
        : tapePrinters.length === 1
          ? tapePrinters[0]
          : null;

    if (!printer) {
      if (tapePrinters.length === 0) {
        throw new Error(
          "No se encontró una DYMO de cinta conectada. Verifica DYMO Connect y la conexión USB.",
        );
      }
      throw new Error(
        "Hay varias impresoras DYMO de cinta. Deja conectada solo la LabelManager que usarás.",
      );
    }

    stage = "carga de plantilla";
    const templateResponse = await fetch("/labels/barcode-9mm-default.dymo");
    if (!templateResponse.ok) {
      throw new Error(
        `No se pudo cargar la plantilla de etiqueta (${templateResponse.status})`,
      );
    }
    const savedOptions = options ?? getSavedBarcodeLabelOptions();
    const sourceXml = await templateResponse.text();
    const labelXml = savedOptions
      ? configureLabelXml(sourceXml, savedOptions)
      : sourceXml;
    const label = framework.openLabelXml(labelXml);
    const objectNames = label.getObjectNames();
    console.info("[DYMO] Objetos de plantilla detectados", objectNames);
    if (
      !objectNames.includes("textoProducto") ||
      !objectNames.includes("codigoBarras")
    ) {
      throw new Error("La plantilla de etiqueta DYMO no tiene sus campos");
    }
    stage = "asignación del nombre del producto";
    label.setObjectText("textoProducto", name);
    stage = "asignación del código de barras";
    label.setObjectText("codigoBarras", value);
    stage = "envío de impresión";
    console.info("[DYMO] Enviando etiqueta a la impresora", printer.name);
    await label.printAsync(
      printer.name,
      framework.createTapePrintParamsXml({ copies: 1 }),
    );
    console.info("[DYMO] El servicio aceptó el trabajo de impresión");
    onSuccess(printer.name);
  } catch (error) {
    console.error(`[DYMO] Fallo durante ${stage}`, error);
    onError(
      error instanceof Error
        ? error
        : new Error("No se pudo imprimir con DYMO Connect"),
    );
  }
}
