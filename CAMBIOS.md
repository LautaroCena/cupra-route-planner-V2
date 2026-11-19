# Cambios desde la última versión entregada

Comparación entre la última versión del repositorio original (commit `bbb336e`, 27/10/2026,
la que se usaba en Lovable) y la versión actual. Ordenado por tema, no por fecha. El detalle
de cada cambio está en el historial de git (`git log bbb336e..HEAD`).

## Infraestructura

- **Fuera de Lovable.** La pantalla se publica en Vercel y el backend usa un proyecto propio
  de Supabase, con acceso completo a la base (SQL, exportación, migraciones). Se quitaron los
  conectores, claves fijas y librerías propias de Lovable.
- **Migraciones reparadas.** Corren desde una base vacía y hay una prueba que lo comprueba.
- **Avisos automáticos** con `pg_cron` dentro de la base.
- **Pruebas automáticas.** `npm run check` valida tipos, motor, base de datos, permisos,
  importaciones y compilación. GitHub Actions lo corre en cada cambio.
- **Más liviana.** Cada pantalla se descarga cuando se abre: el archivo principal pasó de
  1.840 kB a 482 kB.
- **Errores internos** (de la base o del código) ya no se le muestran al usuario; quedan en
  los registros.

## Carga de Excel

- Una fila mala ya no frena el archivo: se procesan las correctas y las rechazadas se
  descargan en un Excel aparte, con el motivo.
- Más formatos de fecha, validación del dígito verificador del CUIT, importe desconocido
  como "sin dato" en lugar de $0, notas de crédito separadas de las ventas.
- Clientes con varios **locales**: coordenadas a más de 300 m son otro local.
- Corrección de CUIT mal escritos y de líneas sin CUIT usando el nombre exacto.
- Función `unir_clientes` para juntar duplicados sin perder ventas ni visitas.

## Motor de rutas (cambio principal)

**Antes:** elegía por cercanía. Ordenaba primero por metros y usaba la prioridad comercial
solo para desempatar, así que en la práctica casi siempre decidía la distancia.

**Ahora:** elige por **valor**. Cada candidato tiene un puntaje con cuatro factores
(recorrido 35, recuperación 25, oportunidad 25, potencial 15) y se arma la ruta de mayor
valor dentro de 1,5 km. Comparado sobre datos reales, da más valor por visita con menos
recorrido.

Además:
- **Cupos por ruta** configurables: 5 activos, 2 inactivos y 1 prospecto por defecto
  (perdidos opcionales). Si falta un tipo se completa con prospectos y se avisa.
- **Hasta 8** visitas: si no hay 8 buenas, sale con menos y avisa (antes fallaba).
- **Franja de 1,5 a 1,6 km** para un solo local que valga claramente más.
- **Orden exacto** de la caminata (el recorrido más corto posible entre las visitas).
- **Pausa después de visitar**: 14 días cliente, 30 prospecto, 90 si no le interesa.
- **Recordatorios del vendedor**: aparta hasta la fecha pedida y, cuando llega, el negocio
  entra seguro en la ruta.
- **Reemplazar** una visita propuesta por la siguiente mejor, desde la preselección.
- Un vendedor sin visitas en la zona ya no frena la generación de los demás.
- La **ruta desde el mapa** completa los lugares libres con el mismo criterio de valor.
- Parámetros del motor (pesos, radio, franja) en la tabla `motor_config`, sin tocar código.

## Inteligencia artificial

- La IA ya no escribe textos libres ni decide la ruta. Puntúa **solo la Oportunidad**:
  fechas especiales por rubro (una consulta por semana) y los comentarios del vendedor, con
  la cita exacta comprobada por código. Si no se puede comprobar, cuenta como 0.
- La IA no recibe nombres ni CUIT de clientes.
- Los textos de "por qué visitarlo" los arma el código con los números reales.
- Se quitó el cuadro "Instrucciones para la IA", que ya no tenía efecto.
- Modelo de Gemini vigente, configurable con el secreto `GEMINI_MODEL`.

## Clientes y vendedores

- **Estado único** (activo, inactivo, perdido) en todas las pantallas y en el motor, medido
  contra el día de hoy.
- **Vendedor asignado = el último que le vendió**, recalculado en cada carga.
- **Vendedores del Excel** (en Perfiles): cada nombre del Excel se vincula una vez con su
  usuario. El asignador ve un aviso si quedan nombres sin vincular.
- La asignación manual de una visita no cambia el dueño del cliente.
- **Comentarios:** manda el más reciente. Un "no volver" viejo ya no aparta para siempre si
  después hubo otra visita; "reactivar" lo vuelve a habilitar.
- Una visita nueva borra las pendientes viejas sin hacer del mismo negocio.

## Mapa, direcciones y prospectos

- **Mapa de respaldo** si Google Maps no carga: se puede seguir trabajando.
- **USIG** (Gobierno de la Ciudad, gratis) ubica direcciones de CABA cuando Google no está o
  rechaza la clave.
- **OpenRouteService** (gratis) mide la caminata por calles cuando Google no está.
- **Marcar en el mapa** la ubicación de un cliente que no se pudo ubicar.
- **Traer de OpenStreetMap**: prospectos gratuitos por barrio de CABA, como respaldo de Google.

## Lo que se quitó

- 6 funciones del servidor sin uso, restos de Lovable.
- La selección vieja por cercanía.
- El aviso de "vendedor sugerido" (ya no aplica con la regla del último vendedor).
- El filtro de estados del panel, reemplazado por los cupos.
