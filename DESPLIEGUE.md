# Publicación

La pantalla se publica en Vercel y el backend en un proyecto propio de Supabase.
Antes de publicar: `npm ci` y `npm run check`.

## Primera instalación
Requiere la CLI de Supabase (`npx supabase`).

1. Crear el proyecto en Supabase y anotar su `project-ref`, la URL y la clave pública.
2. Aplicar la base y las funciones:
   ```bash
   npx supabase login
   npx supabase link --project-ref <project-ref>
   npx supabase db push
   npx supabase functions deploy
   ```
3. Cargar los secretos:
   ```bash
   npx supabase secrets set GOOGLE_MAPS_API_KEY=<clave> GEMINI_API_KEY=<clave> ORS_API_KEY=<clave>
   ```
4. En Vercel, importar el repositorio y cargar `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`
   y `VITE_GOOGLE_MAPS_API_KEY`, de tipo **Config**: Vercel no deja guardar variables `VITE_` como Secret.
   `vercel.json` hace que las rutas de la app funcionen al recargar.
5. En Supabase, Authentication: poner la URL de Vercel como Site URL y como Redirect URL. Apagar el registro público.
6. Crear el primer usuario en Authentication y activarlo como administrador, con su `user_id`:
   ```sql
   UPDATE public.profiles SET rol = 'administrador', activo = true WHERE user_id = '<user_id>';
   ```

Todas las claves son opcionales; sin ellas la app usa respaldos:
- Sin `GOOGLE_MAPS_API_KEY` (o con la clave rechazada): las direcciones de CABA se ubican con USIG
  y no se buscan prospectos en Google (queda "Traer de OpenStreetMap").
- Sin `ORS_API_KEY`: la caminata se mide con Google o se estima en línea recta.
- Sin `GEMINI_API_KEY`: la Oportunidad queda neutra.
- Sin `VITE_GOOGLE_MAPS_API_KEY`: se usa el mapa de respaldo (OpenStreetMap).

Las claves de Google solo funcionan si el proyecto de Google Cloud tiene **facturación vinculada**.
Ver [PENDIENTES.md](./PENDIENTES.md).

## Claves
| Variable | Dónde | Uso |
|---|---|---|
| `GOOGLE_MAPS_API_KEY` | Secreto de Supabase | Places (New) para prospectos. Si además se habilitan Geocoding y Routes, los usa antes que los respaldos |
| `GEMINI_API_KEY` | Secreto de Supabase | IA (Oportunidad, briefing, extracción de comentarios) |
| `GEMINI_MODEL` | Secreto de Supabase (opcional) | Cambiar el modelo de Gemini sin desplegar |
| `ORS_API_KEY` | Secreto de Supabase | Distancias a pie con OpenRouteService (cuenta gratuita) |
| `VITE_GOOGLE_MAPS_API_KEY` | Vercel | Mapa en el navegador. Restringirla por dominio. Después de cargarla, volver a publicar |

Las claves de servidor nunca llevan el prefijo `VITE_`.

## Actualizaciones
Se integra a `main`, y Vercel publica la pantalla. Si cambian la base o las funciones, repetir
`db push` y `functions deploy`. Revertir pantalla y funciones como una versión consistente.
Para corregir datos, crear una migración nueva y revisable.

## Validación después de publicar
- Anónimo, token inválido y cuenta inactiva: acceso rechazado en servidor.
- Vendedor: pendientes propios; catálogo compartido; ficha ajena bloqueada.
- Autoasignación: un pendiente, un movimiento y un aviso a supervisión; reintentar no los duplica.
- Baja de vendedor: cuenta inactiva y traslado de pendientes con fechas intactas.
- Generación: ocho paradas cercanas, prospectos de la misma calle incluidos.
- Mapa: ocho paradas y control de radio al guardar.
- Caminata: tramos, minutos, advertencias y atribución visibles.
- Excel: vista previa, carga por lotes y totales conciliados con el archivo.
- Avisos automáticos: cron activo, con ejecución SQL.
