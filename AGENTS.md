# AGENTS.md

- Maps are created only through `useGoogleMap`; when Google Maps rejects or fails to load, it installs the Leaflet shim in `src/lib/mapFallback.ts` as `window.google.maps`. Why: map assignment must never be blocked by a Google key, quota or domain problem.
- Any new `google.maps.*` API used by a map screen must also be implemented in `src/lib/mapFallback.ts`. Why: otherwise that screen breaks exactly when the fallback is active.
- Estados y días sin comprar se miden contra el día de hoy (`fecha_corte_datos()` devuelve hoy en Argentina). Why: un cliente tiene que envejecer aunque no se carguen ventas; medir contra la última venta fue solo para probar con un Excel atrasado.
- Stale open tabs are detected by `AppUpdateWatcher` comparing the loaded `/assets/index-*.js` with the one in the live HTML. Why: users keep the SPA open for days and otherwise keep running old map code after a publish.
