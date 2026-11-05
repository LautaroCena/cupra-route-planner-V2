import { hoyArgentina, obtenerFechaCorte } from "@/lib/segmentos";

const DIAS_DATOS_ATRASADOS = 14;

/** Los estados y los días sin comprar se miden contra esta fecha: tiene que estar a la vista. */
const DatosAl = () => {
  const fecha = obtenerFechaCorte();
  if (!fecha) return null;
  const atraso = Math.round((Date.parse(hoyArgentina()) - Date.parse(fecha)) / 86_400_000);
  const [anio, mes, dia] = fecha.split("-");
  return (
    <p className={`text-xs mt-1 ${atraso > DIAS_DATOS_ATRASADOS ? "text-amber-500" : "text-muted-foreground"}`}>
      Datos al {dia}/{mes}/{anio}{atraso > DIAS_DATOS_ATRASADOS ? ` · hace ${atraso} días que no se cargan ventas` : ""}
    </p>
  );
};

export default DatosAl;
