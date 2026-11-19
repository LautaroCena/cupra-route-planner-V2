# CUPRA Route Planner

Aplicación para preparar, asignar y registrar visitas comerciales de CUPRA.

Arma cada día una ruta **a pie** de hasta **8 visitas** por vendedor, dentro de
**1,5 km**, eligiendo por valor los clientes y prospectos que más conviene visitar,
con cupos por tipo (5 activos, 2 inactivos y 1 prospecto por defecto). El
asignador revisa y confirma; el vendedor ve sus visitas en orden y registra lo que
pasó, y eso vuelve al motor.

## Desarrollo

Requiere Node.js 24 y npm. Usar `.env.example` para la configuración pública;
las credenciales de servidor permanecen en Supabase.

```bash
npm ci
npm run dev
npm run check
```

`check` verifica tipos, motor, transacciones y permisos en PostgreSQL embebido,
importaciones, borradores, empaquetado de funciones y compilación de producción.
Las pruebas usan datos sintéticos. GitHub Actions ejecuta la misma validación.

## Documentación

- [Funcionamiento y reglas comerciales](./DOCUMENTACION_FUNCIONAL.md)
- [Cambios desde la versión de Lovable](./CAMBIOS.md)
- [Pendientes de la entrega](./PENDIENTES.md)
- [Arquitectura y contratos](./DOCUMENTACION_TECNICA.md)
- [Publicación y verificación](./DESPLIEGUE.md)

La aplicación se publica en Vercel y usa un proyecto propio de Supabase. Las
migraciones corren desde una base vacía; hay una prueba que lo comprueba.
