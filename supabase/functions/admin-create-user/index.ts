import { createClient } from "https://esm.sh/@supabase/supabase-js@2.74.0";
import { mensajePublico } from "../_shared/errores.ts";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;

const ROLES = ["administrador", "asignador", "vendedor"] as const;
type Rol = (typeof ROLES)[number];

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return json({ error: "No autenticado" }, 401);

    // 1) Validar el token del solicitante
    const asUser = createClient(SUPABASE_URL, ANON, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await asUser.auth.getUser();
    if (userErr || !userData?.user) return json({ error: "No autenticado" }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    // 2) Solo administradores activos pueden administrar cuentas.
    const { data: esAdmin, error: rolErr } = await admin.rpc("is_active_admin", { _user_id: userData.user.id });
    if (rolErr) throw rolErr;
    if (!esAdmin) {
      return json({ error: "Solo un administrador activo puede crear perfiles" }, 403);
    }

    // 3) Validar entrada
    const body = await req.json().catch(() => ({}));
    const email = String(body?.email ?? "").trim().toLowerCase();
    const nombre = String(body?.nombre ?? "").trim();
    const password = String(body?.password ?? "");
    const rol = String(body?.rol ?? "vendedor") as Rol;
    const activo = body?.activo !== false;
    const perfilVentas = body?.perfil_ventas === true;

    const errores: string[] = [];
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errores.push("Email inválido");
    if (nombre.length < 2 || nombre.length > 120) errores.push("Nombre inválido");
    if (password.length < 8 || password.length > 72) errores.push("La contraseña debe tener entre 8 y 72 caracteres");
    if (!ROLES.includes(rol)) errores.push("Rol inválido");
    if (errores.length) return json({ error: errores.join(". ") }, 400);

    // 4) Crear usuario (email ya confirmado: el alta es interna)
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { nombre },
    });
    if (createErr) {
      const msg = createErr.message?.includes("already")
        ? "Ese email ya tiene una cuenta"
        : createErr.message ?? "No se pudo crear el usuario";
      return json({ error: msg }, 400);
    }

    const newUserId = created.user!.id;

    // 5) El trigger crea el perfil como vendedor inactivo: ajustamos rol y estado
    const { error: profErr } = await admin
      .from("profiles")
      .update({
        nombre,
        email,
        rol,
        activo,
        perfil_ventas: rol === "vendedor" ? false : perfilVentas,
      })
      .eq("user_id", newUserId);
    if (profErr) {
      await admin.auth.admin.deleteUser(newUserId);
      throw profErr;
    }

    return json({ ok: true, user_id: newUserId });
  } catch (e) {
    console.error("admin-create-user", e);
    return json({ error: mensajePublico(e) }, 500);
  }
});
