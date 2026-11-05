-- El cron original se configuró a mano en Lovable Cloud. Acá queda en el historial.
CREATE EXTENSION IF NOT EXISTS pg_cron;
SELECT cron.schedule('avisos-pendientes', '0 * * * *', 'SELECT public.generar_notificaciones_pendientes();');
