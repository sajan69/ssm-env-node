import test from 'node:test';
import assert from 'node:assert/strict';
import { parseEnvFile, settings, KEYS } from '../src/env-file.js';
import { createConfigLoader } from '../src/config.js';
import { createHandler } from '../src/handler.js';

const text = 'APP_NAME="demo"\nDATABASE_URL=postgresql://u:p@localhost/db\nAPI_KEY="$(do-not-execute)"';
const config = parseEnvFile(text);
const response = () => ({ Parameters: KEYS.map(key => ({ Name: `/demo/${key}`, Type: 'SecureString', Value: config[key] })) });

test('ENV parser preserves literal shell syntax and quoted # and =', () => {
  assert.equal(config.API_KEY, '$(do-not-execute)');
  assert.equal(parseEnvFile(text.replace('$(do-not-execute)', 'a#b=c')).API_KEY, 'a#b=c');
});
test('rejects unknown, duplicate, missing, invalid and malformed values', () => {
  for (const input of [text + '\nAWS_SECRET_ACCESS_KEY=x', text + '\nAPP_NAME=x', 'APP_NAME=x', text.replace('postgresql:', 'https:'), text.replace('"demo"', '"broken')]) {
    assert.throws(() => parseEnvFile(input));
  }
});
test('validates bootstrap and requires Vercel role', () => {
  assert.throws(() => settings({}));
  assert.throws(() => settings({SSM_REGION:'ap-southeast-2',SSM_PREFIX:'/demo/',VERCEL:'1'}));
  assert.throws(() => settings({SSM_REGION:'ap-southeast-2',SSM_PREFIX:'/demo',VERCEL:'1'}));
  assert.equal(settings({SSM_REGION:'ap-southeast-2',SSM_PREFIX:'/demo'}).prefix, '/demo');
});
test('batches, decrypts, coalesces concurrent requests and refreshes after TTL', async () => {
  let calls = 0; let clock = 0;
  const loader = createConfigLoader({prefix:'/demo', now:()=>clock, ttlMs:100, client:{send:async (cmd, options)=>{
    calls++; assert.equal(cmd.input.WithDecryption,true); assert.equal(cmd.input.Names.length,3);
    assert.ok(options.abortSignal); return response();
  }}});
  const values = await Promise.all([loader(),loader(),loader()]);
  assert.equal(calls,1); assert.equal(values[0],values[1]); assert.ok(Object.isFrozen(values[0]));
  await loader(); assert.equal(calls,1);
  clock=101; await loader(); assert.equal(calls,2);
});
test('missing and invalid parameters fail closed', async () => {
  for(const result of [{InvalidParameters:['/demo/API_KEY']},{Parameters:[]}, {Parameters:response().Parameters.map(p=>({...p,Value:'bad'}))}]) {
    const load = createConfigLoader({prefix:'/demo',client:{send:async()=>result}});
    await assert.rejects(load);
  }
});
test('failed refresh rejects instead of serving stale secrets and allows recovery', async () => {
  let clock=0; let fail=false;
  const load=createConfigLoader({prefix:'/demo',ttlMs:10,now:()=>clock,client:{send:async()=>{
    if(fail) throw new Error('AccessDenied'); return response();
  }}});
  await load(); clock=11; fail=true; await assert.rejects(load);
  fail=false; assert.equal((await load()).APP_NAME,'demo');
});
function mockResponse(){return {headers:{},setHeader(k,v){this.headers[k]=v;},end(body){this.body=body;}};}
test('handler returns readiness without exposing any config',async()=>{
  const res=mockResponse(); await createHandler(async()=>config)({method:'GET'},res);
  assert.equal(res.statusCode,200); assert.equal(res.headers['Cache-Control'],'no-store');
  assert.equal(res.body,JSON.stringify({status:'ok',configurationLoaded:true}));
});
test('handler rejects writes and sanitizes failures',async()=>{
  let calls=0; const handler=createHandler(async()=>{calls++; throw new Error('secret-value');});
  const denied=mockResponse(); await handler({method:'POST'},denied);
  assert.equal(denied.statusCode,405); assert.equal(calls,0);
  const failed=mockResponse(); await handler({method:'GET'},failed);
  assert.equal(failed.statusCode,503); assert.ok(!failed.body.includes('secret-value'));
});

