import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
import { PGlite } from '@electric-sql/pglite';
import { parseImportWorkbook } from '../src/lib/excelImport.ts';

// Ejecuta el handler real y sus RPC reales en PostgreSQL local. Solo se sustituyen
// autenticación/transporte; no hay acceso de red ni escritura en producción.
const uid='11111111-1111-4111-8111-111111111111';
async function harness() {
  const db=new PGlite();
  await db.exec(await readFile(new URL('./import-schema.sql',import.meta.url),'utf8'));
  for (const name of ['20260814155913_da040c33-da73-413f-a867-2d96c2e7e790.sql','20260814164819_a10c8241-79db-489a-a9f6-ca16ab2a0a66.sql','20260923120000_rubro_normalizado.sql','20260925140000_importaciones_seguras.sql','20261001130000_importaciones_sin_timeout.sql']) {
    await db.exec(await readFile(new URL('../supabase/migrations/'+name,import.meta.url),'utf8'));
  }
  await db.query("INSERT INTO profiles(user_id,rol) VALUES($1,'asignador')",[uid]);
  const rpcCalls=[];
  const ident=s=>{ assert.match(s,/^[a-z_][a-z_0-9]*$/i); return '"'+s+'"'; };
  const adapter={
    auth:{getUser:async()=>({data:{user:{id:uid,email:'test@example.invalid'}},error:null})},
    from(table) {
      let action='select',payload,columns='*',single=false,offset=0,limit,order,filters=[];
      const query={
        select(c='*'){columns=c;return this},insert(p){action='insert';payload=p;return this},
        update(p){action='update';payload=p;return this},upsert(p){action='upsert';payload=p;return this},
        delete(){action='delete';return this},eq(k,v){filters.push([k,'=',v]);return this},
        is(k,v){assert.equal(v,null);filters.push([k,'IS NULL']);return this},
        not(k,op,v){assert.equal(op,'is');assert.equal(v,null);filters.push([k,'IS NOT NULL']);return this},
        in(){assert.equal(table,'import_staging_rows');return this},
        order(k){order=k;return this},range(a,b){offset=a;limit=b-a+1;return this},
        single(){single=true;return this},maybeSingle(){single=true;return this},
        async then(resolve,reject) {
          try {
            if(table==='import_staging_rows') return resolve({data:[],error:null});
            const params=[]; const param=v=>{params.push(v && typeof v==='object'?JSON.stringify(v):v);return '$'+params.length};
            const values=()=>Object.entries(payload);
            let sql;
            if(action==='insert') sql=`INSERT INTO ${ident(table)} (${values().map(([k])=>ident(k)).join(',')}) VALUES (${values().map(([,v])=>param(v)).join(',')})`;
            else if(action==='update') sql=`UPDATE ${ident(table)} SET ${values().map(([k,v])=>ident(k)+'='+param(v)).join(',')}`;
            else if(action==='delete') sql=`DELETE FROM ${ident(table)}`;
            else sql=`SELECT ${columns==='*'?'*':columns.split(',').map(ident).join(',')} FROM ${ident(table)}`;
            if(filters.length) sql+=' WHERE '+filters.map(([k,op,v])=>ident(k)+' '+op+(op==='='?' '+param(v):'')).join(' AND ');
            if(action==='select') {
              if(order) sql+=' ORDER BY '+ident(order);
              if(limit!==undefined) sql+=' LIMIT '+Number(limit)+' OFFSET '+Number(offset);
            } else sql+=' RETURNING *';
            const {rows}=await db.query(sql,params);
            // PostgREST representa fechas como texto, PGlite devuelve Date.
            const data=JSON.parse(JSON.stringify(rows), (k,v)=>k==='fecha_emision'&&typeof v==='string'?v.slice(0,10):v);
            resolve({data:single?(data[0]??null):data,error:null});
          } catch(e) { resolve({data:null,error:{message:e.message,code:e.code}}); }
        },
      };
      return query;
    },
    async rpc(name,p) {
      rpcCalls.push(name);
      try {
        const entries=Object.entries(p);
        const sql=`SELECT ${ident(name)}(${entries.map(([k],i)=>ident(k)+' => $'+(i+1)).join(',')}) AS result`;
        const result=await db.query(sql,entries.map(([,v])=>v&&typeof v==='object'?JSON.stringify(v):v));
        return {data:result.rows[0].result,error:null};
      } catch(e) { return {data:null,error:{message:e.message}}; }
    },
  };
  const dir=await mkdtemp(join(tmpdir(),'cupra-edge-test-'));
  const sourceURL=new URL('../supabase/functions/process-ventas-excel/index.ts',import.meta.url);
  let source=await readFile(sourceURL,'utf8');
  source=source.replace(/import \{ createClient, type SupabaseClient \} from '[^']+';/,"const createClient = () => globalThis.__cupraTestDb;");
  source=source.replace(/from "(\.\.[^"]+)"/g,(_,p)=>'from '+JSON.stringify(new URL(p,sourceURL).href));
  // Evita que la prueba del archivo privado publique nombres/tickets en logs.
  source='const console={log(){},error(){}};\n'+source;
  let handler;
  globalThis.__cupraTestDb=adapter;
  globalThis.Deno={serve:h=>{handler=h},env:{get:()=> 'local-test-only'}};
  const file=join(dir,'handler.mjs');
  await writeFile(file,ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText);
  await import(pathToFileURL(file).href);
  return {db,rpcCalls,async raw(rows,requestId=crypto.randomUUID()) {
    const response=await handler(new Request('http://localhost/import-test',{method:'POST',headers:{Authorization:'Bearer local-test-only','Content-Type':'application/json'},body:JSON.stringify({rows,requestId,replaceExisting:false})}));
    return {status:response.status,body:await response.json()};
  },async run(rows,requestId=crypto.randomUUID()) {
    const response=await handler(new Request('http://localhost/import-test',{method:'POST',headers:{Authorization:'Bearer local-test-only','Content-Type':'application/json'},body:JSON.stringify({rows,requestId,replaceExisting:true})}));
    const result=await response.json();
    assert.equal(response.status,200,result.error);
    assert.equal(result.success,true,result.error);
    return {result,requestId};
  },async close(){delete globalThis.__cupraTestDb;delete globalThis.Deno;await db.close();await rm(dir,{recursive:true,force:true})}};
}

test('el caché distingue hojas con igual cantidad de columnas y encabezados intermedios diferentes', async () => {
  const h=await harness();
  try {
    await h.run([
      {Ticket:'1',LETRA:'A',FECHAEMISION:'2026-09-30',RAZONSOCIAL:'Comercio',CUITDNI:'30111111111',PRECIOTOTALFINAL:100,telefono:'111'},
      {Ticket:'2',letra:'A',fechaemision:'2026-09-30',razonsocial:'Comercio',cuitdni:'30111111111',preciototalfinal:200,telefono:'111'},
    ]);
    const {rows}=await h.db.query('SELECT count(*)::int AS rows,sum(facturacion_ars) AS total FROM ventas_cupra');
    assert.equal(rows[0].rows,2); assert.equal(Number(rows[0].total),300);
  } finally { await h.close(); }
});

const CUIT='20123456786';
const linea=(extra={})=>({Ticket:'FV1',Letra:'A','Fecha Emisión':'2026-09-30','Razón Social':'Comercio','CUIT / DNI':CUIT,'Código Producto':'P1',Cantidad:1,'Precio Total Final':100,Vendedor:'Vendedora',...extra});

test('una fila mala se rechaza sola, y corregirla no duplica lo ya cargado', {timeout:60000}, async () => {
  const h=await harness();
  try {
    const buenas=Array.from({length:30},(_,i)=>linea({Ticket:'FV'+i,__fila_excel:i+2}));
    const mala=linea({Ticket:'FV99','Fecha Emisión':'2056-01-01',__fila_excel:40});
    const {status,body}=await h.raw([...buenas,mala]);
    assert.equal(status,200,body.error);
    assert.equal(body.validacion.filas_rechazadas,1);
    assert.equal(body.validacion.rechazadas[0].fila,40);
    assert.equal(body.validacion.rechazadas[0].motivo,'fecha_invalida');
    const cuenta=async()=>(await h.db.query('SELECT count(*)::int AS n FROM ventas_cupra')).rows[0].n;
    assert.equal(await cuenta(),30);
    const corregida=await h.raw([{...mala,'Fecha Emisión':'2026-09-29'}]);
    assert.equal(corregida.status,200,corregida.body.error);
    assert.equal(await cuenta(),31);
    const repetida=await h.raw([...buenas,{...mala,'Fecha Emisión':'2026-09-29'}]);
    assert.equal(repetida.status,200,repetida.body.error);
    assert.equal(await cuenta(),31,'volver a subir no duplica');
  } finally { await h.close(); }
});

test('frena el archivo sin tocar nada si se rechaza más del 5% o falta una columna', {timeout:60000}, async () => {
  const h=await harness();
  try {
    const filas=Array.from({length:10},(_,i)=>linea({Ticket:'FV'+i,'Fecha Emisión':i<2?'ayer':'2026-09-30'}));
    const frenado=await h.raw(filas);
    assert.equal(frenado.status,422);
    assert.match(frenado.body.error,/No se modificó nada/);
    const sinColumna=await h.raw([{Cliente:'A',Cantidad:1}]);
    assert.equal(sinColumna.status,422);
    assert.match(sinColumna.body.error,/columna indispensable/);
    assert.equal((await h.db.query('SELECT count(*)::int AS n FROM ventas_cupra')).rows[0].n,0);
  } finally { await h.close(); }
});

test('importe desconocido no es $0, Operador no es vendedor y las líneas NC restan', {timeout:60000}, async () => {
  const h=await harness();
  try {
    const {status,body}=await h.raw([
      linea({Ticket:'FV1','Precio Total Final':null,Vendedor:null,Operador:'Administración'}),
      linea({Ticket:'FV2'}),
      linea({Ticket:'NC1',Letra:'NC',Cantidad:-1,'Precio Total Final':40}),
    ]);
    assert.equal(status,200,body.error);
    const {rows}=await h.db.query("SELECT ticket,facturacion_ars,vendedor,tipo_comprobante FROM ventas_cupra ORDER BY ticket");
    const fila=t=>rows.find(r=>r.ticket===t);
    assert.equal(fila('FV1').facturacion_ars,null);
    assert.equal(fila('FV1').vendedor,null);
    assert.equal(fila('NC1').tipo_comprobante,'nota_credito');
    assert.equal(Number(fila('NC1').facturacion_ars),-40);
    assert.ok(body.validacion.avisos.some(a=>a.tipo==='importe_desconocido'));
  } finally { await h.close(); }
});

test('una línea sin CUIT con el mismo nombre que otra del archivo es el mismo cliente', {timeout:60000}, async () => {
  const h=await harness();
  try {
    const {status,body}=await h.raw([linea({Ticket:'FV1'}),linea({Ticket:'FV2','CUIT / DNI':null}),linea({Ticket:'FV3','CUIT / DNI':null,'Razón Social':'Otro Comercio'})]);
    assert.equal(status,200,body.error);
    const {rows}=await h.db.query('SELECT client_id FROM clientes ORDER BY client_id');
    assert.deepEqual(rows.map(r=>r.client_id),[CUIT,'RS_OTRO COMERCIO']);
    assert.equal(body.validacion.posibles_duplicados.length,0);
  } finally { await h.close(); }
});

test('un CUIT mal escrito toma el correcto si el nombre exacto tiene uno solo; un DNI no se toca', {timeout:60000}, async () => {
  const h=await harness();
  try {
    // 20123456787 falla el dígito verificador; 2012345678 tiene un dígito de menos.
    const {status,body}=await h.raw([
      linea({Ticket:'FV1'}),
      linea({Ticket:'FV2','CUIT / DNI':'20123456787'}),
      linea({Ticket:'FV3','CUIT / DNI':'2012345678'}),
      linea({Ticket:'FV4','CUIT / DNI':'24498124','Razón Social':'Persona Prueba'}),
      linea({Ticket:'FV5','CUIT / DNI':'20111111110','Razón Social':'Sin Gemelo'}),
    ]);
    assert.equal(status,200,body.error);
    const {rows}=await h.db.query('SELECT client_id FROM clientes ORDER BY client_id');
    assert.deepEqual(rows.map(r=>r.client_id),['20111111110',CUIT,'24498124']);
    assert.ok(body.validacion.documentos_corregidos_por_nombre>=2);
  } finally { await h.close(); }
});

test('handler de ventas: archivo completo, importes conservados y reintentos sin duplicados', {timeout:90000}, async () => {
  let rows;
  if(process.env.CUPRA_IMPORT_TEST_FILE) {
    const buffer=await readFile(process.env.CUPRA_IMPORT_TEST_FILE);
    const workbook=parseImportWorkbook(buffer.buffer.slice(buffer.byteOffset,buffer.byteOffset+buffer.byteLength));
    assert.equal(workbook.sheets.length,1); assert.equal(workbook.sheets[0].kind,'ventas');
    rows=workbook.sheets[0].rows;
  } else {
    rows=Array.from({length:10975},(_,i)=>({Ticket:'T'+i,Letra:'A','Fecha Emisión':'2026-09-30','Razón Social':'Comercio '+i%200,'CUIT / DNI':'30'+String(i%200).padStart(9,'0'),'Código Producto':'P1',Etiqueta:'Producto de prueba',Cantidad:1,'Precio Total Final':null,'Categorías Cliente':'Vinoteca',Provincia:'CABA',Ciudad:'Palermo',Calle:'Calle',Número:100,Latitud:-34.60,Longitud:-58.42}));
  }
  const h=await harness();
  try {
    const started=performance.now();
    const first=await h.run(rows);
    assert.equal(first.result.reconciliacion.filas_procesadas,rows.length);
    assert.equal(first.result.reconciliacion.sin_importes,true);
    assert.equal(first.result.reconciliacion.rango.modo,'agregar');
    assert.equal(first.result.reconciliacion.rango.filas_eliminadas,0);
    const counts=async()=> (await h.db.query('SELECT count(*)::int AS rows, sum(facturacion_ars) AS total FROM ventas_cupra')).rows[0];
    assert.equal((await counts()).rows,rows.length);
    if(rows[0].Etiqueta) assert.equal((await h.db.query('SELECT nombre FROM ventas_cupra ORDER BY id LIMIT 1')).rows[0].nombre,rows[0].Etiqueta);
    // Semilla monetaria de prueba; nunca se lee ni modifica el histórico productivo.
    await h.db.exec('UPDATE ventas_cupra SET facturacion_ars=100 WHERE id IN (SELECT id FROM ventas_cupra ORDER BY id LIMIT 2000)');
    const second=await h.run(rows);
    assert.equal(second.result.reconciliacion.importes_conservados,2000);
    assert.equal(second.result.reconciliacion.rango.filas_insertadas,0);
    assert.equal((await counts()).rows,rows.length);
    assert.equal(Number((await counts()).total),200000);
    const calls=h.rpcCalls.length;
    const retry=await h.run(rows,second.requestId);
    assert.deepEqual(retry.result,second.result);
    assert.equal(h.rpcCalls.length,calls,'un reintento confirmado no vuelve a ejecutar RPC');
    console.log(JSON.stringify({filas:rows.length,primeraCargaYReimportacionMs:Math.round(performance.now()-started),importesConservados:2000,duplicados:0}));
  } finally { await h.close(); }
});
