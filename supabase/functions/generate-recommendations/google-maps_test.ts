import { strictEqual as igual } from "node:assert/strict";
import { buscarLugaresCercanos } from "../_shared/google-maps.ts";
const opciones={lat:-34.5,lng:-58.5,radioKm:1.5,tipos:['bar'],objetivo:1};
async function conMock(respuestas: Response[], fn:()=>Promise<void>) {
  const fetchOriginal=globalThis.fetch;
  const clave=Deno.env.get('GOOGLE_MAPS_API_KEY');
  Deno.env.set('GOOGLE_MAPS_API_KEY','prueba-local');
  globalThis.fetch=()=>Promise.resolve(respuestas.shift() || Response.json({places:[]}));
  try{await fn();}finally{globalThis.fetch=fetchOriginal;
    if(clave===undefined)Deno.env.delete('GOOGLE_MAPS_API_KEY');else Deno.env.set('GOOGLE_MAPS_API_KEY',clave);
  }
}
Deno.test('Google reintenta 429 y contabiliza el reintento en el presupuesto',async()=>{
  let llamadas=0;
  await conMock([Response.json({error:{}},{status:429}),Response.json({places:[{id:'p1',businessStatus:'OPERATIONAL'}]})],async()=>{
    const r=await buscarLugaresCercanos({...opciones,consumirConsulta:()=>{llamadas++;}});
    igual(r.length,1);igual(llamadas,2);
  });
});
Deno.test('Google preserva resultados útiles ante error posterior y excluye cerrados',async()=>{
  await conMock([Response.json({places:[{id:'p1'},{id:'p1'},{id:'cerrado',businessStatus:'CLOSED_TEMPORARILY'}]}),Response.json({error:{}},{status:403})],async()=>{
    const r=await buscarLugaresCercanos({...opciones,objetivo:8});
    igual(r.length,1);igual(r[0].id,'p1');
  });
});
Deno.test('Google entrega también los datos conocidos y cerrados para persistir antes de filtrar la ruta',async()=>{
  const recibidos:string[]=[];
  await conMock([Response.json({places:[{id:'conocido'},{id:'cerrado',businessStatus:'CLOSED_PERMANENTLY'},{id:'nuevo'}]})],async()=>{
    const r=await buscarLugaresCercanos({...opciones,excluir:new Set(['conocido']),onResults:async places=>{recibidos.push(...places.map(p=>p.id!));}});
    igual(r.length,1);igual(r[0].id,'nuevo');igual(recibidos.join(','),'conocido,cerrado,nuevo');
  });
});

Deno.test('Google: agrupa empresas y hoteles en una consulta para reservar presupuesto a radios mayores',async()=>{
  await conMock([],async()=>{
    const cuerpos:Record<string,any>[]=[];
    globalThis.fetch=async(_url,init)=>{cuerpos.push(JSON.parse(init!.body as string));return Response.json({places:[]});};
    for(const radioKm of [.15,.3,.6,1,1.5]) await buscarLugaresCercanos({...opciones,radioKm,tipos:['corporate_office','hotel','lawyer'],agruparTipos:true,soloCentro:true});
    igual(cuerpos.length,5);igual(cuerpos[4].includedTypes.join(','),'corporate_office,hotel,lawyer');
    igual(cuerpos[4].locationRestriction.circle.radius,1500);igual(cuerpos[0].rankPreference,'DISTANCE');
  });
});
