import { strictEqual as eq, deepStrictEqual as same, ok, rejects } from 'node:assert/strict';
import { carteraDelVendedor, centroClientes, opcionesZona, perteneceZona, puntosDeCartera, validarSeleccionMapa, type PuntoMapa } from '../_shared/map-selection.ts';
import { distanciaKm } from '../_shared/ruta.ts';
import { buscarComplementoMapa, descubrirProspectosMapa, prospectoDeGoogle, prospectoDisponible, puntoProspecto, tiposBusquedaMapa, type ProspectoMapa } from './search.ts';
const center={lat:-34.6,lng:-58.4};
const offset=(meters:number)=>({...center,lat:center.lat+meters/111195});
const client=(id:string,meters=0):PuntoMapa=>({key:`C:${id}`,id,tipo:'cliente',nombre:id,...offset(meters),direccion:'Calle 1',barrio:'Palermo',ciudad:'CABA',comuna:'Comuna 14',rubro:'Vinoteca',estado:'ACTIVO',vendedor:'Pilar',dias:10,ventas:100,telefono:null});
const prospect=(id:string,meters=0,extra:Partial<ProspectoMapa>={}):ProspectoMapa=>({place_id:id,nombre:`Negocio ${id}`,latitud:offset(meters).lat,longitud:center.lng,tipo_principal:'restaurant',tipos:['restaurant'],rating:4.3,total_ratings:50,rubro:'Restaurante',es_cliente_cupra:false,...extra});
const opts=(base:ProspectoMapa[]=[],objetivo=4)=>({clientes:[client('1',-100),client('2',100),client('3',-50),client('4',50)],objetivo,base,rubros:[],pasaGate:()=>true});
Deno.test('mapa: el centro promedia todos los clientes y una pareja a 2,6 km puede caber en el círculo',()=>{
  const points=[client('1',-1300),client('2',1300)];
  same(centroClientes(points),center);eq(validarSeleccionMapa(points),null);
  ok(distanciaKm(points[0],points[1])>1.5);
  eq(validarSeleccionMapa([client('1'),client('2',4000)]),'Hay destinos fuera del radio máximo de 1,5 km (1,6 km para uno solo).');
});
Deno.test('mapa: el prospecto no mueve el centro de los clientes',()=>{
  const c=[client('1'),client('2')];const p=puntoProspecto(prospect('p',1700),c);
  eq(validarSeleccionMapa([...c,p]),'Hay destinos fuera del radio máximo de 1,5 km (1,6 km para uno solo).');
  eq(validarSeleccionMapa([p]),'Seleccioná primero al menos un cliente del vendedor.');
});
Deno.test('mapa: ocho únicos es condición de confirmación',()=>{
  const c=[client('1')];const route=[...c,...Array.from({length:7},(_,i)=>puntoProspecto(prospect(`p${i}`),c))];
  eq(validarSeleccionMapa(route,true),null);ok(validarSeleccionMapa(route.slice(1),true));ok(validarSeleccionMapa([...route,client('9')],true));
  ok(validarSeleccionMapa([...route.slice(0,7),route[1]],true));
});
Deno.test('mapa: cargar vendedor usa dueño actual y no mezcla nombres ambiguos ni históricos',()=>{
  const perfiles=[{user_id:'p',nombre:'Pilar Carelli'},{user_id:'o',nombre:'Pilar Wiwo'},{user_id:'m',nombre:'Micaela Rocha'}];
  const clientes=[{client_id:'1',vendedor_actual:'CARELLI PILAR'},{client_id:'2',vendedor_actual:'PILAR'},
    {client_id:'3',vendedor_actual:'Micaela Rocha',vendedor_principal:'Pilar Carelli'},{client_id:'4',vendedor_principal:'Pilar Carelli'},
    {client_id:'5',vendedor_actual:'Otro',todos_vendedores:['Pilar Carelli']}];
  same(carteraDelVendedor(clientes,perfiles,'p').map(c=>c.client_id),['1','4']);
});
Deno.test('mapa: ubicación principal válida, alternativas y clientes faltantes se distinguen',()=>{
  const clientes=[{client_id:'1',ciudad_principal:'Berazategui'},{client_id:'2'},{client_id:'3',excluir_recomendaciones:true}];
  const places=[{id:'a',client_id:'1',lat:0,long:0,is_primary:true},{id:'b',client_id:'1',lat:-34.6,long:-58.4,is_primary:false},
    {id:'c',client_id:'3',lat:-34.6,long:-58.4,is_primary:true}];
  const data=puntosDeCartera(clientes,places);eq(data.puntos.length,2);eq(data.puntos[0].lat,-34.6);eq(data.puntos[0].ciudad,'Berazategui');
  same(data.sinUbicacion.map(c=>c.client_id),['2']);eq(data.puntos[1].excluido,true);
  ok(opcionesZona(data.puntos).some(z=>z.label==='Berazategui (1)'));eq(perteneceZona(data.puntos[0],'l:BERAZATEGUI'),true);
});
Deno.test('mapa: primero busca en 150 m, consulta Google aunque haya suficientes lejanos en la base',async()=>{
  const calls:number[]=[];const near=Array.from({length:4},(_,i)=>prospect(`g${i}`,30+i*15));
  const result=await buscarComplementoMapa({...opts(Array.from({length:8},(_,i)=>prospect(`base${i}`,800+i*10))),
    descubrir:async(center,radius,types)=>{same(center,{lat:-34.6,lng:-58.4});calls.push(radius);ok(types.includes('hotel'));return near;}});
  same(calls,[.15]);same(result.elegidos.map(p=>p.place_id).sort(),near.map(p=>p.place_id).sort());eq(result.radio_m,150);
});
Deno.test('mapa: expande sólo lo necesario; lo que queda lejos no entra por buenas reseñas',async()=>{
  const calls:number[]=[];const result=await buscarComplementoMapa({...opts([prospect('lejano',800,{rating:5,total_ratings:2000})],2),
    descubrir:async(_,radius)=>{calls.push(radius);return radius<.3?[prospect('cercano',90)]:[prospect('medio',220),prospect('cercano',90)];}});
  same(calls,[.15,.3]);same(result.elegidos.map(p=>p.place_id),['cercano','medio']);
});
Deno.test('mapa: respeta 1,5 km exactos, excluye cerrados, clientes convertidos y vetos',async()=>{
  const calls:number[]=[];
  const result=await buscarComplementoMapa({...opts([prospect('ok',1490),prospect('fuera',1510),prospect('closed',10,{estado_negocio:'CLOSED_TEMPORARILY'}),
    prospect('cliente',20,{client_id:'C'}),prospect('asignado',30)],4),pasaGate:p=>p.place_id!=='asignado',descubrir:async(_,r)=>{calls.push(r);return [];}});
  same(calls,[.15,.3,.6,1,1.5]);same(result.elegidos.map(p=>p.place_id),['ok']);eq(result.radio_m,1500);
});
Deno.test('mapa: una respuesta incompleta nunca rellena con duplicados ni cruza el límite',async()=>{
  const result=await buscarComplementoMapa({...opts([],4),descubrir:async()=>[prospect('uno',25),prospect('uno',25),prospect('fuera',1700)]});
  eq(result.elegidos.length,1);eq(result.radio_m,1500);
});
Deno.test('mapa: deduplica Excel y Google sin reemplazar el estado guardado',async()=>{
  const base=[prospect('excel-a',20,{nombre:'Restaurante Altamira',direccion:'Av Corrientes 123',rating:null,total_ratings:null}),prospect('excel-c',30,{google_place_id:'google-c',estado_negocio:'CLOSED_PERMANENTLY'})];
  const result=await buscarComplementoMapa({...opts(base,2),descubrir:async()=>[prospect('google-a',22,{nombre:'Restaurante Altamira',direccion:'Av Corrientes 123'}),prospect('google-c',30)]});
  same(result.elegidos.map(p=>p.place_id),['excel-a']);
});
Deno.test('mapa: fallo de Google se distingue de zona vacía y preserva la base',async()=>{
  let n=0;const result=await buscarComplementoMapa({...opts([prospect('guardado',200)],2),descubrir:()=>{n++;throw Error('Error de cuota');}});
  eq(n,1);eq(result.avisos.length,1);same(result.elegidos.map(p=>p.place_id),['guardado']);
});
Deno.test('mapa: filtro de rubro de prospectos independiente, desconocidos no amplían a otros rubros',async()=>{
  const result=await buscarComplementoMapa({...opts([prospect('bar',20,{rubro:'Bar'}),prospect('hotel',50,{rubro:'Hotel',tipo_principal:'hotel'})],1),rubros:['HOTEL']});
  same(result.elegidos.map(p=>p.place_id),['hotel']);same(tiposBusquedaMapa(['Hotel']),['hotel']);same(tiposBusquedaMapa(['Especial desconocido']),[]);
});
Deno.test('mapa: hoteles nuevos y con pocas reseñas siguen siendo candidatos',()=>{
  eq(prospectoDisponible(prospect('hotel',30,{tipo_principal:'hotel',tipos:['hotel','lodging'],rating:4.5,total_ratings:30})),true);
  eq(prospectoDisponible(prospect('hotel',30,{tipo_principal:'hotel',tipos:['hotel'],rating:3.9})),true);
  eq(prospectoDisponible(prospect('hotel',30,{tipo_principal:'boutique_hotel',tipos:['hotel'],rating:5,total_ratings:3})),true);
  eq(prospectoDisponible(prospect('excel-one',20,{rating:null,total_ratings:null})),true);
});
Deno.test('mapa: no interpreta coordenadas vacías ni comercios extranjeros como prospectos',()=>{
  eq(prospectoDeGoogle({id:'p',displayName:{text:'Hotel'},location:{latitude:0,longitude:0}}),null);
  eq(prospectoDeGoogle({id:'p',displayName:{text:'Hotel'},location:{latitude:-34.6,longitude:-58.4},addressComponents:[{longText:'Uruguay',shortText:'UY',types:['country']}]}),null);
  const hotel=prospectoDeGoogle({id:'p',displayName:{text:'Hotel'},location:{latitude:-34.6,longitude:-58.4},primaryType:'hotel',types:['hotel','lodging'],rating:4.6,userRatingCount:150});
  eq(hotel?.rubro,'Hotel');eq(typeof hotel?.ciudad,'string');eq(typeof hotel?.provincia,'string');
});
Deno.test('Google mapa: usa círculo del centro, orden por distancia y consulta hoteles',async()=>{
  const oldFetch=globalThis.fetch;const key=Deno.env.get('GOOGLE_MAPS_API_KEY');
  const bodies:any[]=[];
  Deno.env.set('GOOGLE_MAPS_API_KEY','test-map-key');
  globalThis.fetch=async(_input,init)=>{bodies.push(JSON.parse(String(init?.body)));return Response.json({places:[{id:'g',displayName:{text:'Hotel'},location:{latitude:-34.6,longitude:-58.4},primaryType:'hotel',types:['hotel'],rating:4.5,userRatingCount:20}]});};
  try {const rows=await descubrirProspectosMapa(center,.15,['hotel','restaurant'],Date.now()+2000);eq(rows.length,2);eq(bodies.length,2);
    for(const b of bodies){eq(b.rankPreference,'DISTANCE');same(b.locationRestriction.circle,{center:{latitude:-34.6,longitude:-58.4},radius:150});}
    ok(bodies.some(b=>b.includedTypes[0]==='hotel'));
  } finally{globalThis.fetch=oldFetch;if(key===undefined)Deno.env.delete('GOOGLE_MAPS_API_KEY');else Deno.env.set('GOOGLE_MAPS_API_KEY',key);}
});
Deno.test('mapa: rechaza una selección distante antes de gastar consultas Google',async()=>{
  let calls=0;await rejects(()=>buscarComplementoMapa({...opts(),clientes:[client('a'),client('b',5000)],descubrir:async()=>{calls++;return [];}}),/1,5 km/);eq(calls,0);
});
Deno.test('mapa: si Nearby repite veinte descartados, busca dentro de la zona sin cambiar el centro ni el radio',async()=>{
  let extra=0;
  const result=await buscarComplementoMapa({...opts([],2),pasaGate:p=>p.place_id!=='descartado',
    descubrir:async()=>[prospect('descartado',10)],cubrirZona:async(c,types)=>{extra++;same(c,center);ok(types.includes('hotel'));return [prospect('nuevo1',400),prospect('nuevo2',500),prospect('fuera',1600)];}});
  eq(extra,1);same(result.elegidos.map(p=>p.place_id),['nuevo1','nuevo2']);same(result.centro,center);eq(result.radio_m,1500);
});
Deno.test('mapa: el tipo principal prevalece al filtrar bares que también figuran como restaurante',()=>{
  eq(prospectoDeGoogle({id:'bar',displayName:{text:'Bar'},location:{latitude:-34.6,longitude:-58.4},primaryType:'bar',types:['bar','restaurant']})?.rubro,'Bar');
});
Deno.test('sin cartera: completa ocho prospectos sin clientes, con centro fijo del barrio y categoría',async()=>{
  const rows=Array.from({length:8},(_,i)=>prospect(`h${i}`,20+i*10,{rubro:'Hotel',tipo_principal:'hotel'}));
  const result=await buscarComplementoMapa({clientes:[],centroZona:center,objetivo:8,base:[prospect('bar',10,{rubro:'Bar'}),...rows],rubros:['Hotel'],pasaGate:()=>true});
  eq(result.elegidos.length,8);same(result.elegidos.map(p=>p.place_id),rows.map(p=>p.place_id));same(result.centro,center);
  const route=result.elegidos.map(p=>puntoProspecto(p,[],center));
  eq(validarSeleccionMapa(route,true,center),null);eq(route[0].distancia_cliente_m,undefined);ok(Number.isFinite(route[0].distancia_centro_m));
});
Deno.test('sin cartera: no busca sin centro y no confirma siete ni destinos fuera de 1,6 km',async()=>{
  await rejects(()=>buscarComplementoMapa({clientes:[],objetivo:8,base:[],rubros:[],pasaGate:()=>true}),/barrio/);
  const rows=Array.from({length:7},(_,i)=>prospect(`p${i}`,20+i*10));
  const result=await buscarComplementoMapa({clientes:[],centroZona:center,objetivo:8,base:[...rows,prospect('fuera',1510)],rubros:[],pasaGate:()=>true});
  eq(result.elegidos.length,7);eq(result.radio_m,1500);
  ok(validarSeleccionMapa(result.elegidos.map(p=>puntoProspecto(p,[],center)),true,center));
  ok(validarSeleccionMapa([...rows,prospect('fuera',1610)].map(p=>puntoProspecto(p,[],center)),true,center));
});
Deno.test('sin cartera: completar después de quitar uno busca sólo el faltante y respeta el descarte',async()=>{
  const result=await buscarComplementoMapa({clientes:[],centroZona:center,objetivo:1,base:[prospect('descartado',5),prospect('reemplazo',20)],rubros:[],pasaGate:p=>p.place_id!=='descartado'});
  same(result.elegidos.map(p=>p.place_id),['reemplazo']);
});

Deno.test('mapa: dos locales vecinos de una misma marca se conservan con distintas direcciones',async()=>{
  const base=[prospect('sucursal-a',20,{nombre:'Vinoteca Vecina',direccion:'Av Corrientes 123'}),
    prospect('sucursal-b',30,{nombre:'Vinoteca Vecina',direccion:'Av Corrientes 145'})];
  const result=await buscarComplementoMapa({...opts(base,2)});
  same(new Set(result.elegidos.map(p=>p.place_id)),new Set(['sucursal-a','sucursal-b']));
});

Deno.test('mapa empresarial: completa ocho empresas y hoteles, conserva vecinos en una calle y limita 1,5 km',async()=>{
  const near=Array.from({length:8},(_,i)=>prospect(`empresa-${i}`,40+i*10,{rubro:i%2?'Hotel':'Empresa',tipo_principal:i%2?'hotel':'corporate_office',rating:null,total_ratings:null}));
  const result=await buscarComplementoMapa({clientes:[],centroZona:center,objetivo:8,base:[prospect('restaurante',10),prospect('hotel-lejano',1600,{rubro:'Hotel',tipo_principal:'hotel'})],rubros:[],regalos:true,pasaGate:()=>true,
    descubrir:async(_,radius,tipos)=>{ok(tipos.includes('corporate_office'));ok(tipos.includes('hotel'));return radius===.15?near:[];}});
  same(result.elegidos.map(p=>p.place_id),near.map(p=>p.place_id));eq(result.radio_m,150);
  ok(result.elegidos.every(p=>distanciaKm(center,{lat:p.latitud!,lng:p.longitud!})<=1.5));
});
