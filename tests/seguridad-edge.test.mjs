import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile,writeFile,mkdtemp,mkdir,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join,dirname } from 'node:path';
import { fileURLToPath,pathToFileURL } from 'node:url';
import ts from 'typescript';

// Compila los handlers y sus helpers reales. El SDK simulado nunca accede a red.
async function loadHandler(name) {
  const dir=await mkdtemp(join(tmpdir(),'cupra-security-'));
  const stub=join(dir,'sdk.mjs');
  await writeFile(stub,'export const createClient=(...args)=>globalThis.__securitySdk(...args); export const corsHeaders={"Access-Control-Allow-Origin":"*"};');
  const files=new Map();
  async function compile(url) {
    if(files.has(url.href)) return files.get(url.href);
    const out=join(dir,'module-'+files.size+'.mjs');files.set(url.href,out);
    let source=await readFile(url,'utf8');
    for(const {fileName} of ts.preProcessFile(source,true,true).importedFiles) {
      let target;
      if(fileName.startsWith('.')) target=await compile(new URL(fileName,url));
      else if(fileName.includes('@supabase/supabase-js')) target=stub;
      else throw Error('Import no simulado: '+fileName);
      source=source.split(JSON.stringify(fileName)).join(JSON.stringify(pathToFileURL(target).href))
        .split("'"+fileName+"'").join(JSON.stringify(pathToFileURL(target).href));
    }
    await mkdir(dirname(out),{recursive:true});
    await writeFile(out,ts.transpileModule('const console={log(){},error(){},warn(){}};\n'+source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText);
    return out;
  }
  let handler;
  globalThis.Deno={serve:fn=>{handler=fn},env:{get:k=>k.includes('API_KEY')?'test-provider':k==='SUPABASE_URL'?'http://localhost':'test-key'}};
  // admin-create-user crea clientes al cargar el módulo.
  globalThis.__securitySdk=()=>mock;
  let scenario={active:true,role:'administrador',valid:true},businessCalls=[],filters=[];
  const query=(table)=>({
    select(){return this},order(){return this},limit(){return this},in(){return this},
    eq(k,v){filters.push([table,k,v]);return this},
    async maybeSingle(){return {data:table==='visita_briefings'?{briefing:'Contexto propio',hechos:{version:3},updated_at:new Date().toISOString()}:null,error:null}},
    async single(){return {data:scenario.active?{rol:scenario.role,activo:true}:null,error:null}},
    async then(resolve){resolve({data:table==='asignaciones_vendedores_clientes'&&scenario.own?[{id:'own'}]:[],error:null})},
  });
  const mock={
    auth:{getUser:async()=>({data:{user:scenario.valid?{id:'test-user'}:null},error:scenario.valid?null:{message:'invalid'}}),admin:{createUser(){throw Error('No debe crear usuarios')}}},
    from(table){if(table!=='profiles')businessCalls.push(table);return query(table)},
    async rpc(name){
      if(name==='is_active_admin')return {data:scenario.active&&scenario.role==='administrador'};
      if(name==='is_assignor_like')return {data:scenario.active&&['asignador','administrador'].includes(scenario.role)};
      businessCalls.push(name); return {data:0,error:null};
    },
  };
  const mod=await import(pathToFileURL(await compile(new URL('../supabase/functions/'+name+'/index.ts',import.meta.url))).href);
  handler ||= mod.handler;
  return {async run(overrides={},token='valid',body={}){
    scenario={active:true,role:'administrador',valid:true,...overrides};businessCalls=[];filters=[];
    const headers={'Content-Type':'application/json'};if(token)headers.Authorization='Bearer '+token;
    const response=await handler(new Request('http://localhost/test',{method:'POST',headers,body:JSON.stringify(body)}));
    return {status:response.status,body:await response.json(),businessCalls,filters};
  },async close(){delete globalThis.__securitySdk;delete globalThis.Deno;await rm(dir,{recursive:true,force:true})}};
}

for(const name of ['generate-briefing','extract-feedback','admin-create-user','walking-route','prospect-discovery']) {
  test(name+': rechaza anónimo, token inválido y cuenta inactiva antes de acceder al negocio',async()=>{
    const h=await loadHandler(name);
    try {
      for(const [scenario,token,want] of [[{},null,401],[{valid:false},'invalid',401],[{active:false},'valid',403]]) {
        const r=await h.run(scenario,token);assert.equal(r.status,want);assert.deepEqual(r.businessCalls,[]);
      }
      if(['admin-create-user','walking-route','prospect-discovery'].includes(name)) {
        const r=await h.run({role:'vendedor'});assert.equal(r.status,403);assert.deepEqual(r.businessCalls,[]);
      }
      if(name==='extract-feedback'){
        const r=await h.run({role:'vendedor'});assert.equal(r.status,200);assert(r.filters.some(([table,k,v])=>table==='cliente_feedbacks'&&k==='vendedor_id'&&v==='test-user'));
      }
      if(name==='admin-create-user')assert.equal((await h.run({role:'asignador'})).status,403);
    } finally {await h.close()}
  });
}

test('briefing: ficha y caché solo para cuenta propia; se verifica antes de leer datos comerciales',async()=>{
  const h=await loadHandler('generate-briefing');
  try{
    for(const body of [{client_id:'ajeno'},{prospecto_place_id:'ajeno'}]){
      const denied=await h.run({role:'vendedor'},'valid',body);
      assert.equal(denied.status,403);assert.deepEqual(denied.businessCalls,['asignaciones_vendedores_clientes']);
    }
    const own=await h.run({role:'vendedor',own:true},'valid',{client_id:'propio'});
    assert.equal(own.status,200);assert.equal(own.body.briefing,'Contexto propio');
  }finally{await h.close()}
});

test('discovery: rechaza rubros inválidos, enfoque manipulado y más de 25 promociones sin llamadas comerciales',async()=>{
  const h=await loadHandler('prospect-discovery');
  try {
    for(const body of [
      {action:'search',query:'empresas',includedType:'arbitrary_type'},
      {action:'search',query:'empresas',regalos_empresariales:'true'},
      {action:'promote',placeIds:Array.from({length:26},(_,i)=>'place-'+i)},
    ]) {
      const r=await h.run({},'valid',body);assert.equal(r.status,400);assert.deepEqual(r.businessCalls,[]);
    }
  } finally {await h.close()}
});
