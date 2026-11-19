# Guía de puesta en marcha

Paso a paso para dejar CUPRA Route Planner funcionando en cuentas propias, sin depender de
nadie. Está escrita para alguien que **no conoce** este proyecto. Si ya sabés de
Supabase y Vercel, alcanza con [DESPLIEGUE.md](./DESPLIEGUE.md).

Tiempo estimado: entre 1 y 2 horas, sin contar la espera por la facturación de Google.

## Cómo está armado (para ubicarse)

| Pieza | Qué es | Dónde vive |
|---|---|---|
| **Código** | Todo el programa | GitHub |
| **Pantalla** | Lo que ven los usuarios | Vercel (se publica solo desde GitHub) |
| **Base y funciones** | Los datos y la lógica del servidor | Supabase |
| **Mapa y prospectos** | Mapa de Google y búsqueda de negocios | Google Cloud |
| **IA** | Puntúa la "Oportunidad" de cada visita | Gemini (Google AI) |
| **Distancias a pie** | Caminata por calles | OpenRouteService |

Todas las claves son **opcionales**: si falta una, la app usa un respaldo gratuito y sigue
funcionando. Lo único obligatorio es Supabase y Vercel.

## Qué necesitás antes de empezar

- Cuenta de **GitHub**, de **Supabase** (supabase.com), de **Vercel** (vercel.com) y de
  **Google Cloud** (console.cloud.google.com). Se puede entrar con Google en todas.
- Una **tarjeta** para Google Cloud (Maps) y para Gemini. Con el uso previsto no debería
  cobrar, pero Google la exige.
- En la computadora: **Node.js 24** (nodejs.org) y **Git** (git-scm.com).
- El código del proyecto (se lo pasa quien se lo entrega).

Abrí una terminal para los pasos que lo piden. En Windows, "Git Bash" o PowerShell.

---

## Paso 1. Llevar el código a un repositorio propio

1. En GitHub: **New repository**. Poné el nombre que quieras y marcalo **Private**. No
   agregues README ni nada: tiene que estar vacío.
2. En la terminal, dentro de la carpeta del proyecto (si no la tenés, primero
   `git clone <dirección del repo que te pasaron>`):
   ```bash
   git remote set-url origin https://github.com/<tu-usuario>/<tu-repo>.git
   git push -u origin main
   ```
3. Comprobá que en GitHub aparezcan los archivos.

Con esto el historial completo queda en tu repo.

## Paso 2. Crear el proyecto de Supabase

1. Entrá a supabase.com → **New project**.
2. Elegí nombre, una **contraseña de base de datos** (guardala en un lugar seguro) y la
   región más cercana (por ejemplo *South America (São Paulo)*).
3. Cuando termine de crearse, anotá tres datos (están en *Project Settings*):
   - **Project ref**: el código corto de la URL (`abcdefghij` en `https://abcdefghij.supabase.co`).
   - **URL del proyecto**: `https://<project-ref>.supabase.co`.
   - **Publishable key** (o "anon key"), en *Project Settings → API Keys*. Es la clave
     pública; puede estar en el navegador.

El plan gratis alcanza para empezar.

## Paso 3. Cargar la base y las funciones

En la terminal, dentro de la carpeta del proyecto:

```bash
npm ci
npx supabase login
npx supabase link --project-ref <project-ref>
npx supabase db push
npx supabase functions deploy
```

- `login` abre el navegador para que aceptes.
- `link` pide la contraseña de la base (la del paso 2).
- `db push` crea todas las tablas y reglas (son unas 150 migraciones; tarda un par de
  minutos). Pregunta si aplicar: respondé que sí.
- `functions deploy` sube las 16 funciones del servidor.

Si algo falla, copiá el mensaje completo: casi siempre dice qué falta.

## Paso 4. Configurar el acceso de usuarios

En el panel de Supabase, **Authentication**:
1. *URL Configuration*: poné la dirección que te va a dar Vercel (paso 5) como **Site URL**
   y como **Redirect URL**. Se puede completar después de Vercel.
2. *Sign In / Providers* → *Email*: **apagá "Allow new users to sign up"**, para que solo
   entre quien vos crees.

## Paso 5. Publicar la pantalla en Vercel

1. En vercel.com → **Add New → Project** → importá el repo de GitHub.
2. En *Environment Variables* cargá estas, de tipo **Plain Text / Config** (Vercel no deja
   guardar variables que empiezan con `VITE_` como secretas):

   | Nombre | Valor |
   |---|---|
   | `VITE_SUPABASE_URL` | La URL del paso 2 |
   | `VITE_SUPABASE_PUBLISHABLE_KEY` | La publishable key del paso 2 |
   | `VITE_GOOGLE_MAPS_API_KEY` | La clave del mapa (paso 8). Si todavía no la tenés, dejala vacía |

3. **Deploy**. Anotá la dirección que te da (`https://algo.vercel.app`) y volvé al paso 4
   para cargarla en Supabase.

Cada vez que cambies una variable hay que **volver a publicar** (*Deployments → Redeploy*).

## Paso 6. Crear el primer usuario administrador

1. En Supabase → **Authentication → Users → Add user**. Poné el mail y una contraseña, y
   marcá "Auto Confirm User".
2. En **SQL Editor** ejecutá, cambiando el mail por el tuyo:
   ```sql
   UPDATE public.profiles
   SET rol = 'administrador', activo = true
   WHERE email = 'tu@mail.com';
   ```
3. Entrá a la dirección de Vercel e iniciá sesión. Los demás usuarios (asignadores y
   vendedores) se crean después desde la propia app, en **Perfiles**.

**Primer control:** tenés que ver el panel de asignación sin errores.

## Paso 7. Claves de Gemini y OpenRouteService (opcionales)

**Gemini (IA).** Sin esta clave la "Oportunidad" queda neutra y la app igual arma rutas.
1. En aistudio.google.com → *Get API key*.
2. **Activá la facturación en esa cuenta antes de usar datos reales.** En el plan gratis,
   Google puede usar lo que se le manda para mejorar sus modelos. Los comentarios de los
   vendedores viajan a la IA (nombres y CUIT no).
3. Cargala:
   ```bash
   npx supabase secrets set GEMINI_API_KEY=<tu clave>
   ```

**OpenRouteService (caminatas).** Sin esta clave, las distancias se estiman en línea recta.
1. Cuenta gratuita en openrouteservice.org → *Dashboard → Request a token*.
2. Cargala:
   ```bash
   npx supabase secrets set ORS_API_KEY=<tu clave>
   ```

## Paso 8. Google Maps (mapa y prospectos)

Sin Google, la app muestra un **mapa alternativo** (OpenStreetMap) y ubica las direcciones de
CABA con USIG, un servicio gratuito del Gobierno de la Ciudad. Funciona, pero no puede buscar
prospectos con reseñas y teléfono. Para tener todo:

### 8.1 El proyecto de Google Cloud y la facturación
Una **clave** es la contraseña que la app usa para pedirle cosas a Google. Vive dentro de un
**proyecto de Google Cloud**. **Google no atiende ningún pedido de Maps si el proyecto no
tiene una tarjeta vinculada**, aunque el uso sea gratis. Es el paso que más se olvida.

1. En console.cloud.google.com → creá un proyecto (o usá `cupra-wines` si ya existe).
2. **Facturación → Vincular una cuenta de facturación** y elegí la cuenta con la tarjeta.
3. En *Facturación → Presupuestos y alertas* poné un aviso, por ejemplo USD 10 por mes.

### 8.2 Activar las APIs
En *APIs y servicios → Biblioteca* activá:
- **Places API (New)**: búsqueda de prospectos.
- **Maps JavaScript API**: el mapa en pantalla.

### 8.3 Crear las dos claves
En *APIs y servicios → Credenciales → Crear credenciales → Clave de API*, creá dos:

| Nombre sugerido | Restricción de API | Restricción de aplicación | Va en |
|---|---|---|---|
| CUPRA servidor | Solo **Places API (New)** | Ninguna (la usa el servidor) | Supabase |
| CUPRA mapa | Solo **Maps JavaScript API** | **Sitios web**: la dirección de Vercel con `/*` al final (por ejemplo `https://algo.vercel.app/*`) | Vercel |

Si más adelante usás otro dominio, agregalo a la clave del mapa.

### 8.4 Cargar las claves
- Servidor (Supabase):
  ```bash
  npx supabase secrets set GOOGLE_MAPS_API_KEY=<clave servidor>
  ```
- Mapa (Vercel): variable `VITE_GOOGLE_MAPS_API_KEY`, y **Redeploy**.

Para ver el valor de una clave: *Credenciales →* la clave → **Mostrar clave**. No la pegues en
chats, mails ni en el código.

### 8.5 Topes por día
En *APIs y servicios → [cada API] → Cuotas*, poné un máximo diario de pedidos. Así un error
no puede disparar el gasto.

### 8.6 Comprobar
- El mapa ya no muestra el cartel "Mapa alternativo: Google Maps no respondió".
- En **Prospectos → Buscar prospectos en Maps** aparecen resultados.

## Paso 9. Cargar los datos reales

Hacelo en este orden, en **Carga de datos**:
1. **Excel de ventas.** Elegí el archivo, la hoja y el tipo; revisá la vista previa y
   confirmá. Las filas con problemas se descargan en un Excel aparte, con el motivo.
2. **Maestro de clientes**, si lo tienen (ayuda a ubicar y completar datos).
3. **Perfiles:** creá un usuario por cada vendedor.
4. **Perfiles → Vendedores del Excel:** vinculá cada nombre del Excel con su usuario. Un
   nombre sin vincular deja a sus clientes fuera de las rutas.
5. Revisá clientes duplicados: la función `unir_clientes` los junta sin perder datos.

El estado de cada cliente (activo hasta 30 días, inactivo hasta 90, perdido más de 90) se
mide **contra el día de hoy**: el Excel tiene que estar al día.

## Paso 10. Probar que todo anda

- [ ] Iniciás sesión como administrador.
- [ ] Creás un usuario vendedor y podés entrar con él.
- [ ] Cargás el Excel y los totales coinciden con el archivo.
- [ ] En **Asignación → Personalizado**, elegís un vendedor y generás una ruta: aparecen
      visitas con su explicación ("Por qué visitarlo") y avisos de lo que faltó.
- [ ] El vendedor ve sus visitas con el recorrido a pie.
- [ ] Mapa y prospectos funcionan (si hiciste el paso 8).

Las pruebas automáticas se corren con `npm run check`.

## Si algo no anda

| Síntoma | Causa probable | Qué hacer |
|---|---|---|
| Pantalla en blanco o "falta configuración" | Faltan `VITE_SUPABASE_URL` o `VITE_SUPABASE_PUBLISHABLE_KEY` en Vercel | Cargarlas y volver a publicar |
| No me deja entrar | Usuario no creado, o `profiles.activo` en falso | Revisar el paso 6 |
| Cartel "Mapa alternativo: Google Maps no respondió" | Falta la clave del mapa, la facturación o el dominio en la clave | Revisar el paso 8 |
| "Buscar prospectos en Maps" no trae nada | Clave de servidor sin cargar, sin facturación o sin Places (New) activa | Revisar el paso 8 |
| Los clientes de un vendedor no aparecen en rutas | Nombre del Excel sin vincular a un usuario | Perfiles → Vendedores del Excel |
| Una ruta sale con menos de 8 visitas | No hay suficientes clientes ni prospectos a 1,5 km | Es normal: la app avisa qué faltó. Probar otra zona o cambiar los cupos |
| Pocos o ningún cliente activo | El Excel está viejo | Cargar ventas recientes |
| "Traer de OpenStreetMap" falla | Los servidores públicos de OpenStreetMap se caen seguido | Reintentar más tarde |

Los errores del servidor están en Supabase → **Edge Functions → Logs**.

## Mantenimiento

- **Actualizar:** subir los cambios a `main`; Vercel publica la pantalla. Si cambian la base
  o las funciones, repetir `npx supabase db push` y `npx supabase functions deploy`.
- **Rotar una clave:** crear la nueva en Google Cloud, cargarla donde corresponda y borrar la
  vieja.
- **Cambiar el modelo de Gemini** sin publicar: `npx supabase secrets set GEMINI_MODEL=<modelo>`.
- **Ajustar los pesos del motor, el radio o la franja:** tabla `motor_config`, sin tocar código.

Más detalle técnico: [DOCUMENTACION_TECNICA.md](./DOCUMENTACION_TECNICA.md). Qué falta hacer
al entregar: [PENDIENTES.md](./PENDIENTES.md).
