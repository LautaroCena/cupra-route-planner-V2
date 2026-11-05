// Clave pública de navegador para Google Maps.
// Solo claves de navegador, restringidas por dominio en Google Cloud.
export const GOOGLE_MAPS_BROWSER_KEY: string = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "";

let loaderPromise: Promise<void> | null = null;
export const MAP_ERROR_EVENT = "cupra-google-maps-error";
let lastGoogleReason: string | null = null;

const CALLBACK_NAME = "__cupraGoogleMapsReady";
const SCRIPT_SELECTOR = 'script[data-google-maps="true"]';
const LOAD_TIMEOUT_MS = 15_000;

/** Traduce el código que Google escribe en consola a un mensaje accionable. */
export function describeMapsFailure(reason: string | null): string {
  switch (reason) {
    case "RefererNotAllowedMapError":
      return "Google Maps no autoriza esta dirección web. Revisá las restricciones de la clave en Google Cloud.";
    case "OverQuotaMapError":
      return "Se alcanzó el límite de uso de Google Maps. Reintentá en unos minutos.";
    case "ApiNotActivatedMapError":
    case "InvalidKeyMapError":
    case "ExpiredKeyMapError":
      return "La clave de Google Maps no es válida. Contactá al administrador.";
    default:
      return "Google Maps no pudo validar el mapa en este momento. Probá con “Reintentar mapa”.";
  }
}

if (typeof window !== "undefined") {
  const original = console.error.bind(console);
  console.error = (...args: unknown[]) => {
    const text = args.map(String).join(" ");
    const match = text.match(/Google Maps JavaScript API error: (\w+)/);
    if (match) lastGoogleReason = match[1];
    original(...args);
  };
}

function isGoogleMapsReady(): boolean {
  return typeof window !== "undefined" && typeof window.google?.maps?.Map === "function";
}

/** Permite reintentar tras un rechazo, sin recargar la página. */
export function resetGoogleMaps(): void {
  loaderPromise = null;
  lastGoogleReason = null;
  document.querySelector<HTMLScriptElement>(SCRIPT_SELECTOR)?.remove();
  const w = window as unknown as { google?: { maps?: { __fallback?: boolean } } };
  if (!isGoogleMapsReady() || w.google?.maps?.__fallback) delete w.google;
}

/**
 * Carga el script de Google Maps una sola vez para toda la app.
 */
export function loadGoogleMaps(apiKey: string = GOOGLE_MAPS_BROWSER_KEY): Promise<void> {
  if (isGoogleMapsReady()) return Promise.resolve();
  if (!apiKey) {
    return Promise.reject(
      new Error("No hay clave de Google Maps configurada. Contactá al administrador."),
    );
  }
  if (loaderPromise) return loaderPromise;

  loaderPromise = new Promise<void>((resolve, reject) => {
    let settled = false;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeoutId);
      delete (window as unknown as Record<string, unknown>)[CALLBACK_NAME];
      if (error) {
        document.querySelector<HTMLScriptElement>(SCRIPT_SELECTOR)?.remove();
        loaderPromise = null;
        reject(error);
        return;
      }
      resolve();
    };

    const timeoutId = window.setTimeout(() => {
      finish(new Error("Google Maps demoró demasiado en responder"));
    }, LOAD_TIMEOUT_MS);

    // Google can report authentication failure after its ready callback.
    (window as unknown as Record<string, unknown>).gm_authFailure = () => {
      // Google escribe el código del error en consola justo antes/después de este aviso.
      window.setTimeout(() => {
        const message = describeMapsFailure(lastGoogleReason);
        console.warn("Google Maps auth failure:", lastGoogleReason || "sin código");
        loaderPromise = null;
        window.dispatchEvent(new CustomEvent(MAP_ERROR_EVENT, { detail: message }));
        finish(new Error(message));
      }, 50);
    };


    (window as unknown as Record<string, unknown>)[CALLBACK_NAME] = () => {
      if (isGoogleMapsReady()) {
        finish();
      } else {
        finish(new Error("Google Maps respondió sin inicializar el mapa"));
      }
    };

    // loading=async no garantiza que la API esté lista durante script.onload.
    // El callback de Google es la única señal fiable de inicialización completa.
    const existing = document.querySelector<HTMLScriptElement>(SCRIPT_SELECTOR);
    if (existing) existing.remove();

    const script = document.createElement("script");
    const params = new URLSearchParams({
      key: apiKey,
      language: "es",
      region: "AR",
      loading: "async",
      callback: CALLBACK_NAME,
      v: "weekly",
    });
    script.src = `https://maps.googleapis.com/maps/api/js?${params.toString()}`;
    script.async = true;
    script.dataset.googleMaps = "true";
    script.onerror = () => finish(new Error("No se pudo descargar Google Maps"));
    document.head.appendChild(script);
  });

  return loaderPromise;
}
