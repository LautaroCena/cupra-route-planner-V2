-- Antes vivía en drizzle/: las importaciones grandes necesitan más que el límite por defecto.
ALTER ROLE service_role SET statement_timeout = '140s';
NOTIFY pgrst, 'reload config';
