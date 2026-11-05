// Cliente de IA compartido: API directa de Gemini, con el formato chat/completions.

const GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";

/** Google retira modelos: un solo lugar para cambiarlo, o el secreto GEMINI_MODEL sin desplegar. */
export const MODELO_IA = "gemini-3.5-flash-lite";

export type AiChatBody = Record<string, unknown>;

export type AiChatResult = {
  ok: boolean;
  status: number;
  data: any;
  errorText: string;
  proveedor: "gemini" | "ninguno";
};

export async function aiChat(body: AiChatBody): Promise<AiChatResult> {
  const key = Deno.env.get("GEMINI_API_KEY") || "";
  if (!key) {
    return { ok: false, status: 0, data: null, errorText: "No hay GEMINI_API_KEY configurada", proveedor: "ninguno" };
  }
  try {
    const pedir = () => fetch(GEMINI_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ ...body, model: Deno.env.get("GEMINI_MODEL") || MODELO_IA }),
      signal: AbortSignal.timeout(20_000),
    });
    let res = await pedir();
    // Un 503 es saturación pasajera de Google: se reintenta una vez antes de usar el respaldo.
    if (res.status === 503) {
      await res.body?.cancel();
      await new Promise((resolve) => setTimeout(resolve, 2_000));
      res = await pedir();
    }
    if (!res.ok) {
      const errorText = await res.text().catch(() => "");
      console.error(`[ai-chat] Gemini ${res.status}: ${errorText.slice(0, 500)}`);
      return { ok: false, status: res.status, data: null, errorText, proveedor: "gemini" };
    }
    const data = await res.json().catch(() => null);
    return { ok: true, status: res.status, data, errorText: "", proveedor: "gemini" };
  } catch (e) {
    console.error("[ai-chat] Gemini error de red", e);
    return { ok: false, status: 0, data: null, errorText: String(e), proveedor: "gemini" };
  }
}

export function hayProveedorIA(): boolean {
  return Boolean(Deno.env.get("GEMINI_API_KEY"));
}
