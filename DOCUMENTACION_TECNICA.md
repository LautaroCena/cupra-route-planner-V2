# Arquitectura y contratos

React 18, TypeScript y Vite componen la interfaz. Supabase aporta Auth,
PostgreSQL con RLS y Edge Functions en Deno. Vercel publica la aplicación
desde GitHub. Google Maps aporta el mapa y la búsqueda de prospectos; cuando no
está, hay respaldos gratuitos: mapa Leaflet/OpenStreetMap, USIG para direcciones
de CABA, OpenRouteService para caminatas y Overpass (OpenStreetMap) para
prospectos. Gemini puntúa solo la Oportunidad; el resto lo calcula el código.

## Módulos principales

| Ubicación | Responsabilidad |
|---|---|
| `supabase/functions/generate-recommendations/` | Generación de rutas: candidatos (`candidatos.ts`), planificación por vendedor (`planificador.ts`), filas para la base (`filas.ts`). |
| `supabase/functions/_shared/seleccion.ts` | Selección por valor: radio, franja, cupos, recordatorios obligatorios, orden exacto y alternativas. La usan el motor y el mapa. |
| `supabase/functions/_shared/valor.ts` | Puntaje de 0 a 100 y pesos por defecto (recorrido 35, recuperación 25, oportunidad 25, potencial 15). |
| `supabase/functions/_shared/cupos.ts` | Cupos por tipo de visita (5-2-0-1 por defecto, suman 8). |
| `supabase/functions/_shared/reglas.ts` | Exclusiones por comentario, pausas después de visitar, resolución de vendedores. |
| `supabase/functions/_shared/estado-comercial.ts` | Estados activo / inactivo / perdido (30 y 90 días, contra hoy). |
| `supabase/functions/_shared/vendedor-asignado.ts` | Regla del último vendedor (también en SQL, `ultimo_vendedor`). |
| `supabase/functions/_shared/oportunidad.ts` | Oportunidad por IA comprobada por código. |
| `supabase/functions/_shared/location-service.ts`, `usig.ts` | Ubicar direcciones: Google y, si no, USIG. |
| `supabase/functions/_shared/ors.ts`, `walking-route.ts` | Caminata por calles: Google y, si no, OpenRouteService. |
| `supabase/functions/_shared/osm.ts`, `prospectos-osm/` | Prospectos de OpenStreetMap por barrio de CABA. |
| `supabase/functions/complete-map-route/` | Completar una ruta armada a mano en el mapa. |
| `supabase/functions/process-ventas-excel/`, `_shared/etl/` | Carga del Excel de ventas. |
| `src/lib/mapFallback.ts` | Mapa de respaldo con la misma interfaz que `google.maps`. |
| `src/lib/assignmentDrafts.ts` | Borradores por usuario en el navegador. |

## Contrato de rutas

Una ruta tiene **hasta ocho** destinos distintos con coordenadas válidas, todos a
1,5 km o menos del centro, salvo uno solo entre 1,5 y 1,6 km. Se elige por valor;
la distancia entra como el factor recorrido. Con cupos, dentro de cada tipo manda
el valor; si un tipo no alcanza se completa con prospectos. Los recordatorios
vencidos del vendedor entran aunque su tipo no tenga cupo. El orden final es el
óptimo exacto. Motor, mapa y base (`guardar_ruta_mapa`) aplican la misma regla de radio y franja.

Los parámetros se leen de `motor_config` y se validan al leer: un valor sin sentido
vuelve al de por defecto.

## Prospección empresarial

`regalos_empresariales` es un filtro booleano validado por los handlers de
búsqueda, recomendaciones y mapa. La afinidad se calcula a partir del rubro
persistido y, cuando falta, del tipo principal. No representa interés confirmado.
Los rubros seleccionados se intersectan con el enfoque; un rubro desconocido
no se sustituye por gastronomía. El catálogo ofrece categorías para descubrir
aunque todavía no haya registros locales de ellas.

`normalizar_rubro` y `rubro_prospecto` clasifican importaciones, altas y datos
Google. La incorporación completa tipos vacíos o manuales, conserva los tipos
ya definidos y sigue el ID canónico de la revisión. `prospect-promotion.ts`
procesa los lotes y recibe `promoted_place_ids` para informar éxitos reales.
La búsqueda por texto conserva el contexto usado para agregar los resultados.

El motor agrupa los tipos en cada consulta Nearby y recorre radios progresivos
centrados en la ruta, para no agotar el presupuesto antes de buscar a 1,5 km.
El enriquecimiento continúa guardándose antes de filtrar los destinos.
Los briefings incluyen la afinidad comercial; su caché versión 2 evita reutilizar
una guía anterior que no contemplaba empresas.

## Autorización y persistencia

Las funciones de servidor verifican sesión y rol activo antes de leer datos
comerciales. El uso de `verify_jwt = false` en el gateway requiere mantener esos
controles en los handlers. Las claves de servidor no se exponen como `VITE_*`.

RLS exige cuenta activa y limita los pendientes del vendedor a su usuario.
Las fichas de clientes y briefings requieren una asignación propia, actual o
histórica, o un perfil de supervisión. El catálogo compartido expone campos
comerciales mínimos mediante un RPC paginado. Las ventas crudas requieren
administrador; los demás perfiles usan las operaciones autorizadas de análisis.

| Operación | Contrato |
|---|---|
| `catalogo_visitas` | Cuenta activa, búsqueda acotada y paginación de hasta 200 filas. |
| `autoasignar_visita` | Perfil de ventas activo; identidad tomada de la sesión; pendiente del día, movimiento y notificación atómicos. |
| `reasignar_pendientes` | Asignador activo; traslado de hasta 500 pendientes conservando fechas e historial. |
| `guardar_asignaciones` | Asignador activo; bloqueo por comercio, guardado idempotente y cartera permanente opcional. |
| `guardar_ruta_mapa` | Ocho paradas, vendedor activo y geometría comprobada contra datos vigentes. |

Los bloqueos por comercio serializan tomas y reasignaciones. Las visitas
realizadas no se reabren ni se eliminan desde el rol autenticado. Las bajas
conservan el perfil desactivado. `movimientos_visitas` registra la toma y el
traslado de pendientes; su lectura está reservada a supervisión.

Las notificaciones son privadas; el usuario solo puede marcar las propias como
leídas y crear recordatorios propios. El trabajo programado materializa avisos
vencidos con una función SQL restringida al servicio. La limpieza automática
de visitas realizadas permanece desactivada.

Los borradores pertenecen al usuario identificado. No se importa automáticamente
un borrador antiguo sin propietario. Los datos confirmados y los resultados de
revisión se guardan en PostgreSQL; los borradores viven en el navegador.

## Verificación

`npm run check` ejecuta tipos, reglas y planificación con Deno; transacciones,
RLS, importaciones y seguridad de handlers con Node/PGlite; borradores,
empaquetado de funciones y build de producción. Las pruebas no utilizan datos
comerciales reales. El lint global conserva deuda previa y no es una validación
incluida en `check`.

Las migraciones históricas se conservan como registro. Las instrucciones de
[publicación](./DESPLIEGUE.md) son la referencia operativa para el entorno existente.
