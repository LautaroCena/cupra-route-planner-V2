import { strict as assert } from "node:assert";
import { calcularCaminata } from "../_shared/walking-route.ts";

const puntos=Array.from({length:8},(_,i)=>({id:`P:${i}`,lat:-34.6,lng:-58.4+i*0.0001}));
Deno.test("caminata: suma tramos reales, conserva ocho paradas y muestra avisos del proveedor",async()=>{
  const fetchOriginal=globalThis.fetch,key=Deno.env.get("GOOGLE_MAPS_API_KEY");
  Deno.env.set("GOOGLE_MAPS_API_KEY","test");
  globalThis.fetch=async(input,init)=>{
    const url=new URL(String(input));assert.equal(url.hostname,"routes.googleapis.com");
    assert.equal(url.pathname,"/directions/v2:computeRoutes");assert.equal(init?.method,"POST");
    const body=JSON.parse(String(init?.body));assert.equal(body.travelMode,"WALK");assert.equal(body.intermediates.length,6);
    return Response.json({status:"OK",routes:[{legs:Array.from({length:7},()=>({distanceMeters:110,duration:"90s"})),warnings:["<b>Precaución</b> al cruzar"],copyrights:"Google Maps"}]});
  };
  try {
    const r=await calcularCaminata(puntos);assert.equal(r.verificada,true);assert.equal(r.metros,770);assert.equal(r.minutos,11);
    assert.equal(new Set(r.orden).size,8);assert.deepEqual(r.avisos,["Precaución al cruzar"]);assert.equal(r.atribucion,"Google Maps");
  }finally{globalThis.fetch=fetchOriginal;if(key===undefined)Deno.env.delete("GOOGLE_MAPS_API_KEY");else Deno.env.set("GOOGLE_MAPS_API_KEY",key);}
});
Deno.test("caminata: sin datos del proveedor no inventa kilómetros ni minutos",async()=>{
  const fetchOriginal=globalThis.fetch,key=Deno.env.get("GOOGLE_MAPS_API_KEY");
  Deno.env.set("GOOGLE_MAPS_API_KEY","test");globalThis.fetch=async()=>Response.json({status:"ZERO_RESULTS",routes:[]});
  try {
    const r=await calcularCaminata(puntos);assert.equal(r.verificada,false);assert.equal(r.metros,null);assert.equal(r.minutos,null);
    assert.equal(new Set(r.orden).size,8);assert.match(r.avisos[0],/el radio no es la distancia total/);
  }finally{globalThis.fetch=fetchOriginal;if(key===undefined)Deno.env.delete("GOOGLE_MAPS_API_KEY");else Deno.env.set("GOOGLE_MAPS_API_KEY",key);}
});

Deno.test("caminata: si Google rechaza la clave no reintenta por otro camino y avisa",async()=>{
  const fetchOriginal=globalThis.fetch,key=Deno.env.get("GOOGLE_MAPS_API_KEY");
  Deno.env.set("GOOGLE_MAPS_API_KEY","invalida");
  const urls:string[]=[];
  globalThis.fetch=async(input)=>{
    urls.push(String(input));
    return Response.json({error:{message:"API key not valid"}},{status:400});
  };
  try {
    const r=await calcularCaminata(puntos);assert.equal(r.verificada,false);assert.equal(r.metros,null);
    assert.equal(urls.length,1);assert.equal(urls[0],"https://routes.googleapis.com/directions/v2:computeRoutes");
  }finally{
    globalThis.fetch=fetchOriginal;
    if(key===undefined)Deno.env.delete("GOOGLE_MAPS_API_KEY");else Deno.env.set("GOOGLE_MAPS_API_KEY",key);
  }
});
