# Pendientes de la entrega

Lo que falta para usar la app con datos reales. La app funciona hoy; lo que sigue es
completar servicios pagos, pasar las cuentas a nombre del cliente y cargar los datos reales.

## 1. Google Maps: falta activar la facturación

### Qué pasa hoy
La app usa Google para dos cosas: **mostrar el mapa** y **buscar prospectos nuevos** (con
reseñas, teléfono y si el negocio cerró). Hoy ninguna de las dos funciona con Google, así
que la app usa sus respaldos gratuitos: el mapa de OpenStreetMap, USIG para ubicar
direcciones de CABA y OpenRouteService para medir la caminata. Todo sigue funcionando; lo
único que se pierde de verdad es la búsqueda de prospectos con datos de Google.

### Explicado simple
- El **proyecto de Google Cloud** (`cupra-wines`) es la cuenta donde viven las claves.
- Una **clave** es la contraseña que la app usa para pedirle cosas a Google.
- La **facturación** es la tarjeta asociada a ese proyecto. **Google no atiende ningún pedido
  de Maps si el proyecto no tiene una tarjeta vinculada**, aunque el uso entre en lo gratis.

Las claves ya están creadas. Falta solamente la tarjeta.

### Lo que ya está hecho
En `cupra-wines`, *APIs y servicios → Credenciales*, hay dos claves:

| Clave | Puede usar | Desde dónde | Se carga en |
|---|---|---|---|
| CUPRA servidor (Supabase) | Solo Places API (New) | Cualquier origen (la usa el servidor) | Supabase, secreto `GOOGLE_MAPS_API_KEY` |
| CUPRA mapa (Vercel) | Solo Maps JavaScript API | Solo `https://cupra-route-planner-v2.vercel.app/*` y `http://localhost:5173/*` | Vercel, variable `VITE_GOOGLE_MAPS_API_KEY` |

Las APIs Places (New) y Maps JavaScript ya están habilitadas.

### Cómo se termina
1. **Vincular la facturación** (lo hace el dueño de la tarjeta):
   https://console.cloud.google.com/billing/linkedaccount?project=cupra-wines →
   *Vincular una cuenta de facturación*.
2. **Poner un aviso de gasto**, por ejemplo USD 10 por mes, en *Facturación → Presupuestos y
   alertas*. Con el uso previsto se queda dentro del crédito gratuito mensual de Maps.
3. **Poner topes por día** en cada API (*APIs y servicios → [la API] → Cuotas*), para que un
   error no dispare el gasto.
4. **Copiar las claves** desde *Credenciales → Mostrar clave* y cargarlas:
   - Supabase: `npx supabase secrets set GOOGLE_MAPS_API_KEY=<clave servidor>` (o desde el
     panel, *Edge Functions → Secrets*). Toma efecto enseguida.
   - Vercel: *Settings → Environment Variables* → `VITE_GOOGLE_MAPS_API_KEY` = clave del mapa.
     Hay que **volver a publicar** (Redeploy) para que la tome.
5. **Comprobar:**
   - El mapa ya no muestra el cartel "Mapa alternativo: Google Maps no respondió".
   - En Prospectos, *Buscar prospectos en Maps* devuelve resultados.

Si la app cambia de dominio, hay que agregar el dominio nuevo a la clave del mapa.

## 2. Pasar las cuentas a nombre del cliente

Hoy la demo corre en cuentas de prueba del desarrollador. Para producción:

| Servicio | Qué hay que hacer |
|---|---|
| GitHub | Repositorio en una cuenta del cliente y **privado**. |
| Supabase | Proyecto propio del cliente. El plan gratis alcanza para empezar. Seguir [DESPLIEGUE.md](./DESPLIEGUE.md). |
| Vercel | Proyecto del cliente conectado a su repositorio. |
| Gemini (IA) | Clave de una cuenta del cliente **con facturación** (ver punto 3). |
| OpenRouteService | Cuenta gratuita del cliente en openrouteservice.org, secreto `ORS_API_KEY`. |
| Google Maps | Ya está en `cupra-wines`; solo falta el punto 1. |

## 3. Antes de cargar datos reales

- **Gemini pago.** En el nivel gratuito, Google puede usar lo que se le manda para mejorar
  sus modelos. Aunque la app no le manda nombres ni CUIT, los comentarios de los vendedores
  sí viajan. Activar facturación en la cuenta de Gemini antes de usar datos reales.
- **Traer los datos de Lovable:** usuarios, visitas, comentarios (`cliente_feedbacks`,
  `feedback_extraccion`) y carteras. Sin los comentarios, la IA solo puntúa por fechas.
- **Vincular los vendedores del Excel** con sus usuarios en *Perfiles → Vendedores del Excel*.
  Un nombre sin vincular deja a sus clientes fuera de las rutas.
- **Unir clientes duplicados** con `unir_clientes` después de la primera carga real.
- **Borrar los datos de prueba** de la demo si se reutiliza ese proyecto.

## 4. Seguridad

- Dar de baja las **dos claves viejas de Google** que quedaron en el historial del
  repositorio original (en `.env` y `vite.config.ts`, de 2025 y 2026). Siguen visibles en
  cualquier copia del historial aunque el código actual ya no las use.
- Mantener el repositorio privado.

## 5. Preguntas de negocio sin respuesta

No bloquean el uso; la app usa el criterio indicado entre paréntesis.
- La columna Cantidad del Excel, ¿son cajas o botellas? (se toma como cajas)
- Los clientes fuera de CABA, ¿quién los visita? (las rutas a pie son solo de CABA)
- Las líneas repetidas idénticas del Excel de ventas, ¿son duplicados del export? (se
  conservan y se informan)
- ¿Cada cuánto se sube el Excel? (la app avisa si los datos tienen más de 14 días)
