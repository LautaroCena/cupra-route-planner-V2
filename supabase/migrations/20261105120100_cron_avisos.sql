-- El cron original se configuró a mano en Lovable Cloud. Acá queda en el historial.
-- Requiere pg_cron activo; si no está, la migración no hace nada.
DO $$
BEGIN
  IF to_regclass('cron.job') IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'avisos-pendientes') THEN
    PERFORM cron.schedule('avisos-pendientes', '0 * * * *', 'SELECT public.generar_notificaciones_pendientes();');
  END IF;
END $$;
