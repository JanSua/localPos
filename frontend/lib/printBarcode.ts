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

declare global {
  interface Window {
    dymo?: {
      label?: {
        framework?: DymoFramework;
      };
    };
  }
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
    const templateResponse = await fetch("/labels/barcode-9mm.dymo");
    if (!templateResponse.ok) {
      throw new Error(
        `No se pudo cargar la plantilla de etiqueta (${templateResponse.status})`,
      );
    }
    const label = framework.openLabelXml(await templateResponse.text());
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
