import { RADIO_RUTA_KM, type Coordenada } from "./ruta.ts";

export const RADIOS_CERCANIA = [0.15, 0.3, 0.6, 1, RADIO_RUTA_KM];
export interface ParadaCercana extends Coordenada { id: string; prioridad?: number; cliente?: boolean }
export interface Caminata {
  orden: string[]; metros: number | null; minutos: number | null;
  avisos: string[]; atribucion: string; verificada: boolean;
}
