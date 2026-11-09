/**
 * Mapa de respaldo: si Google Maps rechaza o no carga el mapa, se instala una
 * versión mínima de `google.maps` dibujada con Leaflet y teselas públicas.
 * Así asignar desde el mapa, ver fichas y círculos sigue funcionando igual.
 * Solo cubre lo que usa la app: Map, Marker, InfoWindow, LatLngBounds, Circle,
 * Size, Point y event.
 */
import L from "leaflet";
import "leaflet/dist/leaflet.css";

type AnyFn = (...args: unknown[]) => void;
type LatLngLike = { lat: number | (() => number); lng: number | (() => number) };

const toLL = (p: LatLngLike): L.LatLngTuple => [
  typeof p.lat === "function" ? p.lat() : p.lat,
  typeof p.lng === "function" ? p.lng() : p.lng,
];

class Evented {
  __handlers = new Map<string, Set<AnyFn>>();
  addListener(name: string, fn: AnyFn) {
    const set = this.__handlers.get(name) ?? new Set<AnyFn>();
    set.add(fn);
    this.__handlers.set(name, set);
    return { remove: () => set.delete(fn) };
  }
  __trigger(name: string, ...args: unknown[]) {
    for (const fn of [...(this.__handlers.get(name) ?? [])]) fn(...args);
  }
}

class FSize { constructor(public width: number, public height: number) {} }
class FPoint { constructor(public x: number, public y: number) {} }

class FMap extends Evented {
  __lf: L.Map;
  constructor(el: HTMLElement, opts: { center?: LatLngLike; zoom?: number } = {}) {
    super();
    el.innerHTML = "";
    this.__lf = L.map(el, { zoomControl: true, attributionControl: true })
      .setView(toLL(opts.center ?? { lat: -34.6037, lng: -58.3816 }), opts.zoom ?? 12);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(this.__lf);
    const notice = new L.Control({ position: "topright" });
    notice.onAdd = () => {
      const div = L.DomUtil.create("div");
      div.style.cssText = "background:#fff;color:#111827;padding:6px 10px;border-radius:6px;font:12px system-ui;box-shadow:0 1px 4px rgba(0,0,0,.3);max-width:240px";
      div.textContent = "Mapa alternativo: Google Maps no respondió. Podés asignar normalmente.";
      return div;
    };
    notice.addTo(this.__lf);
    this.__lf.on("moveend", () => window.setTimeout(() => this.__trigger("idle"), 0));
    // Igual que Google: el clic trae el punto (latLng) para poder marcar ubicaciones.
    this.__lf.on("click", (e: L.LeafletMouseEvent) => this.__trigger("click", { latLng: { lat: () => e.latlng.lat, lng: () => e.latlng.lng } }));
    window.setTimeout(() => this.__lf.invalidateSize(), 0);
  }
  fitBounds(bounds: FBounds) {
    if (bounds.__b.isValid()) this.__lf.fitBounds(bounds.__b, { padding: [30, 30], animate: false, maxZoom: 18 });
  }
  getZoom() { return this.__lf.getZoom(); }
  setZoom(zoom: number) { this.__lf.setZoom(zoom, { animate: false }); }
  setCenter(center: LatLngLike) { this.__lf.setView(toLL(center), this.__lf.getZoom(), { animate: false }); }
  panTo(center: LatLngLike) { this.__lf.panTo(toLL(center)); }
  setOptions() { /* sin opciones equivalentes */ }
}

class FBounds {
  __b = L.latLngBounds([]);
  extend(p: LatLngLike) { this.__b.extend(toLL(p)); return this; }
  isEmpty() { return !this.__b.isValid(); }
}

type IconLike = { url: string; scaledSize?: FSize; anchor?: FPoint } | string | undefined;

const DEFAULT_ICON_URL = "data:image/svg+xml;charset=UTF-8," + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 26 26"><circle cx="13" cy="13" r="10" fill="#C6A46A" stroke="white" stroke-width="2.5"/></svg>',
);

function toLeafletIcon(icon: IconLike): L.Icon {
  const url = typeof icon === "string" ? icon : icon?.url ?? DEFAULT_ICON_URL;
  const w = typeof icon === "object" && icon?.scaledSize ? icon.scaledSize.width : 26;
  const h = typeof icon === "object" && icon?.scaledSize ? icon.scaledSize.height : 26;
  const ax = typeof icon === "object" && icon?.anchor ? icon.anchor.x : w / 2;
  const ay = typeof icon === "object" && icon?.anchor ? icon.anchor.y : h / 2;
  return L.icon({ iconUrl: url, iconSize: [w, h], iconAnchor: [ax, ay], popupAnchor: [0, -ay] });
}

class FMarker extends Evented {
  __m: L.Marker;
  __map: FMap | null = null;
  constructor(opts: { position: LatLngLike; map?: FMap | null; title?: string; icon?: IconLike }) {
    super();
    this.__m = L.marker(toLL(opts.position), { title: opts.title, icon: toLeafletIcon(opts.icon) });
    this.__m.on("click", () => this.__trigger("click"));
    if (opts.map) this.setMap(opts.map);
  }
  setMap(map: FMap | null) {
    if (this.__map) this.__m.remove();
    this.__map = map;
    if (map) this.__m.addTo(map.__lf);
  }
  getMap() { return this.__map; }
  setPosition(p: LatLngLike) { this.__m.setLatLng(toLL(p)); }
  getPosition() { const ll = this.__m.getLatLng(); return { lat: () => ll.lat, lng: () => ll.lng }; }
  setIcon(icon: IconLike) { this.__m.setIcon(toLeafletIcon(icon)); }
  setZIndex(z: number) { this.__m.setZIndexOffset((z || 0) * 1000); }
  setOpacity(o: number) { this.__m.setOpacity(o ?? 1); }
  setTitle(t: string) { this.__m.options.title = t; }
}

class FInfoWindow extends Evented {
  __p = L.popup({ maxWidth: 300, autoPanPadding: [20, 20] });
  __content: string | HTMLElement = "";
  constructor(opts: { content?: string | HTMLElement } = {}) {
    super();
    if (opts.content) this.__content = opts.content;
  }
  setContent(c: string | HTMLElement) { this.__content = c; this.__p.setContent(c); }
  open(arg: FMap | { map?: FMap; anchor?: FMarker }, anchorArg?: FMarker) {
    const map = arg instanceof FMap ? arg : arg?.map ?? anchorArg?.__map ?? undefined;
    const anchor = arg instanceof FMap ? anchorArg : arg?.anchor ?? anchorArg;
    if (!map || !anchor) return;
    const iconAnchor = (anchor.__m.options.icon as L.Icon | undefined)?.options.iconAnchor as L.PointTuple | undefined;
    this.__p.options.offset = L.point(0, -((iconAnchor?.[1] ?? 13)));
    this.__p.setLatLng(anchor.__m.getLatLng()).setContent(this.__content).openOn(map.__lf);
  }
  close() { this.__p.remove(); }
}

class FCircle {
  __c: L.Circle;
  constructor(o: { map?: FMap; center: LatLngLike; radius: number; strokeColor?: string; strokeOpacity?: number;
    strokeWeight?: number; fillColor?: string; fillOpacity?: number }) {
    this.__c = L.circle(toLL(o.center), {
      radius: o.radius, color: o.strokeColor, opacity: o.strokeOpacity, weight: o.strokeWeight,
      fillColor: o.fillColor, fillOpacity: o.fillOpacity, interactive: false,
    });
    if (o.map) this.__c.addTo(o.map.__lf);
  }
  setMap(map: FMap | null) { this.__c.remove(); if (map) this.__c.addTo(map.__lf); }
}

let realGoogle: { maps?: { event?: { clearInstanceListeners?: (o: unknown) => void } } } | undefined;

const fallbackMaps = {
  __fallback: true,
  Map: FMap, Marker: FMarker, InfoWindow: FInfoWindow, LatLngBounds: FBounds,
  Circle: FCircle, Size: FSize, Point: FPoint,
  event: {
    addListenerOnce(obj: Evented, name: string, fn: AnyFn) {
      const handle = obj.addListener(name, (...args: unknown[]) => { handle.remove(); fn(...args); });
      return handle;
    },
    clearInstanceListeners(obj: unknown) {
      if (obj instanceof Evented) { obj.__handlers.clear(); return; }
      // Objetos creados por Google antes del cambio a este mapa.
      try { realGoogle?.maps?.event?.clearInstanceListeners?.(obj); } catch { /* sin efecto */ }
    },
  },
};

export function isMapFallbackActive(): boolean {
  const w = window as unknown as { google?: { maps?: { __fallback?: boolean } } };
  return Boolean(w.google?.maps?.__fallback);
}

/** Reemplaza `window.google.maps` por el mapa de respaldo (una vez por sesión). */
export function installMapFallback(): void {
  const w = window as unknown as Record<string, unknown>;
  if (isMapFallbackActive()) return;
  realGoogle = w.google as typeof realGoogle;
  // Protegido para que un script de Google que llegue tarde no lo pise.
  Object.defineProperty(window, "google", {
    value: Object.freeze({ maps: fallbackMaps }), writable: false, configurable: true,
  });
}
