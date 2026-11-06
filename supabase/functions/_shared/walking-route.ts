import { googleMapsFetch } from "./google-maps.ts";
import { type ParadaCercana, type Caminata } from "./compact-route.ts";
import { ordenExacto } from "./seleccion.ts";
import { distanciaKm } from "./ruta.ts";

type Tramo = { distanceMeters?: number; duration?: string };
const segundos = (duration: unknown): number => typeof duration === "string" && /^\d+(?:\.\d+)?s$/.test(duration)
  ? Number(duration.slice(0,-1)) : NaN;

export async function calcularCaminata(puntos: ParadaCercana[]): Promise<Caminata> {
  // El mismo orden exacto que usa el motor.
  const ruta = ordenExacto(puntos, distanciaKm);
  const base: Caminata = { orden:ruta.map(p=>p.id), metros:null, minutos:null, avisos:[], atribucion:"", verificada:false };
  if (ruta.length < 2) return base;
  const waypoint = (p:ParadaCercana) => ({location:{latLng:{latitude:p.lat,longitude:p.lng}}});
  try {
    const response = await googleMapsFetch("/routes/directions/v2:computeRoutes", {
      method:"POST",
      signal:AbortSignal.timeout(10_000),
      headers:{"Content-Type":"application/json","X-Goog-FieldMask":"routes.legs.distanceMeters,routes.legs.duration,routes.warnings"},
      body:JSON.stringify({
        origin:waypoint(ruta[0]), destination:waypoint(ruta[ruta.length-1]),
        intermediates:ruta.slice(1,-1).map(waypoint), travelMode:"WALK", languageCode:"es", regionCode:"AR",
      }),
    });
    const data = await response.json();
    const r = data.routes?.[0];
    if (!response.ok || !Array.isArray(r?.legs) || r.legs.length !== ruta.length-1
      || r.legs.some((l:Tramo) => !Number.isFinite(l.distanceMeters ?? 0) || (l.distanceMeters ?? 0)<0 || !Number.isFinite(segundos(l.duration)))) {
      throw new Error("Sin recorrido peatonal completo");
    }
    return {
      ...base, verificada:true,
      metros:r.legs.reduce((s:number,l:Tramo)=>s+(l.distanceMeters ?? 0),0),
      minutos:Math.ceil(r.legs.reduce((s:number,l:Tramo)=>s+segundos(l.duration),0)/60),
      avisos:Array.isArray(r.warnings)?r.warnings.map((s:unknown)=>String(s).replace(/<[^>]*>/g,"")):[],
      atribucion:"Google Maps",
    };
  } catch {
    return {...base,avisos:["No se pudo medir el recorrido por calles. Reintentá o revisalo en Google Maps; el radio no es la distancia total a pie."]};
  }
}
