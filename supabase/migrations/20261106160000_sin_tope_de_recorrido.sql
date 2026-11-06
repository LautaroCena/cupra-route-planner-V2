-- Decisión de Lautaro (2026-11-06): sin tope de recorrido. El límite son las 8 visitas
-- dentro del radio de 1,5 km (y una en la franja); si hay que caminar más, se camina.
UPDATE public.motor_config SET parametros = parametros - 'topeKm', updated_at = now() WHERE id;
