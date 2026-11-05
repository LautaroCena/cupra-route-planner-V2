# Arquitectura y contratos

React 18, TypeScript y Vite componen la interfaz. Supabase aporta Auth,
PostgreSQL con RLS y Edge Functions en Deno. Vercel publica la aplicación
desde GitHub. Google Maps resuelve lugares, geocodificación y
recorridos; la IA redacta explicaciones a partir de resultados calculados.

## Módulos principales

| Ubicación | Responsabilidad |
|---|---|
| `supabase/functions/generate-recommendations/` | Candidatos, prioridad comercial y planificación por vendedor. |
| `supabase/functions/_shared/prospect-categories.ts` | Catálogo compartido de rubros, tipos Google y afinidad con regalos empresariales. |
| `supabase/functions/_shared/compact-route.ts` | Selección por cercanía y orden sugerido compartidos por motor y mapa. |
| `supabase/functions/complete-map-route/` | Completar selección manual conservando puntos fijos. |
| `supabase/functions/walking-route/` | Resolver ocho IDs contra la base y medir el recorrido peatonal. |
| `supabase/functions/review-prospect/` | Revisión, enriquecimiento y unificación de fichas. |
| `src/lib/asignaciones.ts` | Acceso a operaciones transaccionales de asignación. |
| `src/lib/catalogoVisitas.ts` | Catálogo mínimo paginado para búsqueda compartida. |
| `src/lib/assignmentDrafts.ts` | Persistencia de borradores por usuario, ámbito y campo. |

## Contrato de rutas

Una ruta completa tiene ocho IDs distintos y coordenadas válidas, todos a un
máximo de 1,5 km de su centro. La selección busca el menor radio suficiente;
la cercanía precede a la prioridad comercial para completar alrededor de una
referencia. Las preferencias generadas por IA no pueden ampliar la ruta.

El mapa y el motor usan el mismo selector. La asignación manual conserva los
puntos que eligió el operador. La medición a pie optimiza el orden por proximidad
y consulta las calles; devuelve `orden`, `metros`, `minutos`, `avisos`,
`atribucion` y `verificada`. Un fallo devuelve medidas nulas y un aviso explícito.

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
