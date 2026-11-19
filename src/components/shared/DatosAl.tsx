import { hoyArgentina } from "@/lib/segmentos";
import { obtenerUltimaVenta } from "@/lib/fechaCorte";

const DIAS_DATOS_ATRASADOS = 14;

/** Hasta qué fecha hay ventas cargadas. Si pasaron más de 14 días, lo avisa. */
const DatosAl = () => {
  const fecha = obtenerUltimaVenta();
  if (!fecha) return null;
  const atraso = Math.round((Date.parse(hoyArgentina()) - Date.parse(fecha)) / 86_400_000);
  const [anio, mes, dia] = fecha.split("-");
  return (
    <p className={`text-xs mt-1 ${atraso > DIAS_DATOS_ATRASADOS ? "text-amber-500" : "text-muted-foreground"}`}>
      Ventas cargadas hasta el {dia}/{mes}/{anio}{atraso > DIAS_DATOS_ATRASADOS ? ` · hace ${atraso} días que no se cargan ventas` : ""}
    </p>
  );
};

export default DatosAl;
