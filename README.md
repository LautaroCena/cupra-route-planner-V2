# CUPRA Route Planner

Aplicación para preparar, asignar y registrar visitas comerciales de CUPRA.

El objetivo es **ocho comercios cercanos por vendedor**, combinando clientes y
prospectos. El motor compara zonas compactas, conserva una referencia comercial
cuando existe y busca vecinos en Google incluso cuando ya hay ocho clientes
más dispersos. El radio máximo es **1,5 km desde el centro**; la interfaz permite
consultar por separado los kilómetros y minutos del recorrido a pie.

Los vendedores ven sus pendientes y pueden tomar visitas desde un catálogo
compartido. La operación conserva el historial y avisa a los asignadores.
Los borradores se guardan por usuario en el navegador. Los datos comerciales
confirmados se guardan en Supabase.

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
- [Arquitectura y contratos](./DOCUMENTACION_TECNICA.md)
- [Publicación y verificación](./DESPLIEGUE.md)

La aplicación se publica en Vercel y usa un proyecto propio de Supabase. Las
migraciones corren desde una base vacía; hay una prueba que lo comprueba.
