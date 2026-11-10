import { describe,it,expect,afterEach } from 'vitest';
import { resolve } from 'node:path';
import { createApp } from '../src/app.js';
const apps:ReturnType<typeof createApp>[]=[];const root=resolve(import.meta.dirname,'../../..');
function fresh(){const a=createApp({root,dbPath:':memory:',durationMs:1});apps.push(a);return a;}
afterEach(async()=>{for(const a of apps.splice(0))await a.app.close();});
const headers={host:'127.0.0.1:4310'};
describe('local API',()=>{
 it('seeds the workspace and enforces local origin/token on writes',async()=>{const {app}=fresh();const w=await app.inject({url:'/api/sites/popfly/workspace',headers});expect(w.statusCode).toBe(200);expect(w.json().errors).toHaveLength(70);
 const bad=await app.inject({method:'POST',url:'/api/sites',headers,payload:{name:'Other',url:'https://other.test'}});expect(bad.statusCode).toBe(403);
 const session=await app.inject({url:'/api/session',headers});const token=session.json().token;
 expect((await app.inject({method:'POST',url:'/api/sites',headers:{...headers,'x-session-token':token,origin:'https://evil.test'},payload:{name:'Other',url:'https://other.test'}})).statusCode).toBe(403);
 expect((await app.inject({url:'/api/session',headers:{host:'evil.test'}})).statusCode).toBe(403);
 });
 it('enforces site ownership and mutation revision checks',async()=>{const {app,store}=fresh();const token=(await app.inject({url:'/api/session',headers})).json().token;const h={...headers,'x-session-token':token};const e=store.all('errors')[0]!;store.createSite('Other','https://other.test','other');
 expect((await app.inject({method:'POST',url:`/api/sites/other/errors/${e.id}/status`,headers:h,payload:{status:'not_an_issue'}})).statusCode).toBe(404);
 expect((await app.inject({method:'POST',url:`/api/sites/popfly/errors/${e.id}/status`,headers:h,payload:{status:'not_an_issue',status_revision:999}})).statusCode).toBe(409);
 expect((await app.inject({method:'POST',url:`/api/sites/popfly/errors/${e.id}/status`,headers:h,payload:{status:'fixed'}})).statusCode).toBe(400);
 });
 it('runs request-aware verification and refuses simulated scans for other sites',async()=>{const {app,store,pump}=fresh();const token=(await app.inject({url:'/api/session',headers})).json().token;const h={...headers,'x-session-token':token};const e=store.all('errors')[0]!;store.setStatus('popfly',e.id,'in_progress');
 const response=await app.inject({method:'POST',url:'/api/sites/popfly/scans',headers:h,payload:{kind:'verify',request_id:'verify-subset'}});expect(response.statusCode,response.body).toBe(200);
 await new Promise(r=>setTimeout(r,125));pump();const s=store.get('scans','verify-subset');expect(s?.state,JSON.stringify(s)).toBe('completed');expect(store.all('scan_changes').filter(c=>c.scan_id==='verify-subset')).toHaveLength(1);
 store.createSite('Other','https://other.test','other');expect((await app.inject({method:'POST',url:'/api/sites/other/scans',headers:h,payload:{kind:'full'}})).statusCode).toBe(422);
 });
});
