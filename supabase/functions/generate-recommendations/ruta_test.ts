import { strictEqual as igual } from "node:assert/strict";
import { errorRuta } from "../_shared/ruta.ts";
const centro = {lat:-34.5,lng:-58.5};
const ruta = () => Array.from({length:8},(_,i)=>({id:String(i),...centro,lat:centro.lat+i*0.001}));
const aKm = (km:number) => centro.lat+km/6371*180/Math.PI;
Deno.test("contrato de respuesta: hasta ocho, únicos, con centro, radio y una sola en la franja",()=>{
  igual(errorRuta(ruta(),centro),null);
  // Menos de ocho es válido (no hay ocho que valgan la pena); exigirlo es opcional.
  igual(errorRuta(ruta().slice(1),centro),null);
  igual(errorRuta(ruta().slice(1),centro,true),"La ruta debe tener 8 visitas.");
  igual(errorRuta([],centro),"La ruta no tiene visitas.");
  igual(errorRuta([...ruta(),{id:'extra',...centro}],centro),"La ruta no puede tener más de 8 visitas.");
  const duplicada=ruta();duplicada[7].id=duplicada[0].id;
  igual(errorRuta(duplicada,centro),"La ruta contiene destinos repetidos.");
  igual(errorRuta(ruta(),null),"Falta el centro de la ruta.");
  const borde=ruta();borde[7].lat=aKm(1.499);
  igual(errorRuta(borde,centro),null);
  // Uno en la franja de 1,5 a 1,6 km entra; dos no; más allá de 1,6 nunca.
  borde[7].lat=aKm(1.55);
  igual(errorRuta(borde,centro),null);
  borde[6].lat=aKm(1.55);
  igual(errorRuta(borde,centro),"Solo un destino puede estar entre 1,5 y 1,6 km.");
  const lejos=ruta();lejos[7].lat=aKm(1.61);
  igual(errorRuta(lejos,centro),"Hay destinos fuera del radio máximo de 1,5 km (1,6 km para uno solo).");
});
