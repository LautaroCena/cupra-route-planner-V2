# Funcionamiento de CUPRA

Visión general de cómo trabaja la aplicación. No explica cada pantalla: está pensada para
alguien que ya usa la app o que la va a mantener.

## Para qué sirve

Arma cada día una ruta **a pie** de hasta **8 visitas** por vendedor, dentro de un radio de
**1,5 km**, eligiendo los clientes y prospectos que más valen la pena. El asignador revisa
la propuesta, la ajusta si quiere y la confirma. El vendedor ve sus visitas en orden,
registra qué pasó y la app usa eso para las rutas siguientes.

## Perfiles

| Perfil | Qué hace |
|---|---|
| Administrador | Usuarios, vínculo entre los vendedores del Excel y sus usuarios, datos de clientes y todo lo del asignador. |
| Asignador | Carga los Excel, revisa prospectos, genera y confirma rutas, supervisa. |
| Vendedor | Ve solo sus pendientes, registra cada visita con un comentario, puede tomar una visita del catálogo compartido. |

## El circuito de todos los días

1. **Carga de datos.** Se sube el Excel de ventas (y, si hay, el maestro de clientes o de
   prospectos). La app procesa las filas válidas, avisa las que tienen problemas y deja
   descargar las rechazadas en un Excel aparte. Con cada carga recalcula el estado de cada
   cliente y su vendedor asignado.
2. **Generar rutas.** El asignador elige vendedores y zona (por área, a mano o desde el mapa)
   y cuántas visitas de cada tipo quiere (los **cupos**). El motor propone las rutas.
3. **Revisar y confirmar.** En la preselección se ve por qué conviene cada visita. Se puede
   **reemplazar** una por la siguiente mejor o sacarla. Al confirmar, las visitas quedan
   asignadas al vendedor.
4. **El vendedor sale.** Ve sus visitas en el orden del recorrido, con la caminata en metros
   y minutos. Después de cada visita deja un comentario (compró, estaba cerrado, volver en
   tal fecha, no le interesa...).
5. **Lo que dijo el vendedor vuelve al motor.** Un cierre definitivo aparta al negocio, un
   "volver el 15/12" lo guarda hasta esa fecha, un "reactivar" lo vuelve a habilitar.

## Cómo elige el motor

**Estado de cada cliente**, según los días desde su última compra, contados **desde hoy**:
activo hasta 30 días, inactivo hasta 90, perdido más de 90. Sin compras, es potencial.

**Cupos por ruta.** Por defecto, sin tocar nada: **5 activos, 2 inactivos y 1 prospecto**.
Los perdidos arrancan en 0 y el asignador los suma si quiere. Los cupos siempre suman 8.
- Dentro de cada tipo, gana el que más vale.
- Si un tipo no alcanza en la zona, se completa con **prospectos** y se avisa dónde faltó.
- Si ni con prospectos llega a 8, la ruta sale con menos visitas, también con aviso.

**Valor de cada visita** (de 0 a 100), con cuatro factores:

| Factor | Peso | Qué mide |
|---|---|---|
| Recorrido | 35 | Cuánto alarga la caminata sumarlo. Menos desvío, más valor. |
| Recuperación | 25 | Cuánto se atrasó respecto de su propio ritmo de compra. |
| Oportunidad | 25 | Fechas que mueven la venta en su rubro (Navidad, fin de año, Día del Padre...) y lo que dijo el vendedor. Lo puntúa la IA y el código lo comprueba. |
| Potencial | 15 | Cuánto compra (cajas y frecuencia) comparado con el resto. En prospectos, según el rubro y los datos que haya. |

Los pesos se pueden cambiar sin tocar código (tabla `motor_config`).

**Reglas de la ruta**
- Todo dentro de 1,5 km del centro. Se acepta **un solo** local entre 1,5 y 1,6 km si vale
  claramente más.
- Hasta 8 visitas; el orden es el que hace la caminata más corta.
- Un cliente con varios locales entra una sola vez, por el local que mejor queda.
- Se prueban varios centros posibles y se queda con el que da más visitas y más valor.

**Cuándo un negocio no se propone**
- Visitado hace poco: 14 días si es cliente, 30 si es prospecto, 90 si dijo que no le interesa.
- Cerrado ese día: 7 días. Cerrado definitivo o "no volver": no vuelve, salvo "reactivar".
- El vendedor pidió volver en una fecha: se aparta hasta esa fecha. Cuando llega, **entra
  seguro** en la ruta si está al alcance.
- Ya está asignado ese día a otro vendedor.

**Vendedor asignado** de un cliente: siempre **el último que le vendió**, recalculado con
cada carga de ventas (regla de CUPRA, porque los vendedores rotan seguido). Los nombres de
vendedor del Excel se vinculan una vez con su usuario en **Perfiles → Vendedores del Excel**;
un nombre sin usuario deja a sus clientes fuera de las rutas, y la app lo avisa.

## Mapa y direcciones

- Si Google Maps no está disponible, la app muestra un **mapa de respaldo** (OpenStreetMap)
  y se puede seguir trabajando igual.
- Las direcciones de CABA se ubican con **USIG** (servicio gratuito del Gobierno de la Ciudad)
  cuando Google no está. Un cliente que no se pudo ubicar se puede **marcar tocando el mapa**
  en Editar datos de clientes.
- La caminata se mide por calles con Google o, si no, con **OpenRouteService** (gratis).

## Prospectos

- **Buscar prospectos en Maps** usa Google Places: trae reseñas, teléfono y si el negocio
  cerró. Necesita la clave de Google con facturación activa.
- **Traer de OpenStreetMap** es un respaldo gratuito por barrio de CABA. Trae menos datos y
  sus servidores públicos fallan seguido.
- **Agregar manual** valida la dirección antes de guardar.
- **Revisar coincidencias** compara prospectos con clientes por nombre, teléfono, dirección
  y ubicación, para no visitar como nuevo a alguien que ya es cliente.

## Carga de Excel

- Una fila mala no frena el archivo. Se frena solo si falta una columna obligatoria o si se
  rechaza más del 5% de las filas.
- Fechas en varios formatos, CUIT con dígito verificador, importes desconocidos como "sin
  dato" (no como $0) y notas de crédito separadas de las ventas.
- Coordenadas a más de 300 m del mismo cliente se guardan como otro local.
- Un CUIT mal escrito se corrige si el mismo nombre tiene un solo CUIT válido en el archivo.
  Los clientes duplicados se pueden unir con `unir_clientes` sin perder datos.

## Comportamientos que conviene saber

- Los borradores (filtros, preselección) se guardan en el navegador de cada usuario. Un
  borrador no es una asignación.
- Una visita nueva de un negocio borra las pendientes viejas sin hacer del mismo negocio.
- Si un vendedor queda sin visitas en la zona, los demás reciben su ruta igual y ese
  vendedor sale con un aviso.
- Una pestaña abierta hace días detecta que hay una versión nueva y se actualiza.
