# AGENTS.md

- Maps are created only through `useGoogleMap`; when Google Maps rejects or fails to load, it installs the Leaflet shim in `src/lib/mapFallback.ts` as `window.google.maps`. Why: map assignment must never be blocked by a Google key, quota or domain problem.
- Any new `google.maps.*` API used by a map screen must also be implemented in `src/lib/mapFallback.ts`. Why: otherwise that screen breaks exactly when the fallback is active.
- TEMPORAL: estados y días sin comprar se miden contra `fecha_corte_datos()` solo mientras se prueba con un Excel atrasado. Antes del uso real hay que volver a compararlos contra el día de hoy (Etapa 6). Why: en funcionamiento normal un cliente tiene que envejecer aunque no se carguen ventas.
- Stale open tabs are detected by `AppUpdateWatcher` comparing the loaded `/assets/index-*.js` with the one in the live HTML. Why: users keep the SPA open for days and otherwise keep running old map code after a publish.
