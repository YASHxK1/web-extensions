import test from 'node:test';
import assert from 'node:assert/strict';
import { claudeTabRequest } from '../adapters/claude.js';
import { fetchClaudeAll, deleteQueue } from '../core.js';
import { providerForUrl, contextMatches } from '../providers.js';
const org='11111111-2222-3333-4444-555555555555', other='aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const identity=`account:${org}`;
async function environment(run, handler) {
  const original={fetch:globalThis.fetch,document:globalThis.document,location:globalThis.location};
  const calls=[];
  globalThis.location={origin:'https://claude.ai'};
  globalThis.document={cookie:`unrelated=value; lastActiveOrg=${org}`};
  globalThis.fetch=async(path,options)=>{
    calls.push({path,options});
    if(path.startsWith('/api/bootstrap/'))return new Response(JSON.stringify({account:{uuid:'account',memberships:[{organization:{uuid:org}}]}}));
    return handler ? handler(path,options) : new Response(JSON.stringify({data:[],has_more:false}));
  };
  try{await run(calls);}finally{Object.assign(globalThis,original);}
}
test('provider matching requires an exact HTTPS origin and bound tab',()=>{
  assert.equal(providerForUrl('https://claude.ai/new').id,'claude');assert.equal(providerForUrl('https://chatgpt.com/c/1').id,'chatgpt');
  for(const url of ['http://claude.ai','https://claude.ai.evil.test','https://evil.test/?next=https://claude.ai','invalid'])assert.equal(providerForUrl(url),null);
  assert.equal(contextMatches({provider:'claude',tabId:1},{id:1,url:'https://claude.ai/new'}),true);
  assert.equal(contextMatches({provider:'claude',tabId:1},{id:2,url:'https://claude.ai/new'}),false);
  assert.equal(contextMatches({provider:'claude',tabId:1},{id:1,url:'https://chatgpt.com'}),false);
});
test('Claude uses cookies, verifies membership, and returns only normalized conversation metadata',async()=>{
 await environment(async calls=>{
  const r=await claudeTabRequest('list',{offset:20,archived:false,identity});
  assert.deepEqual(r,{identity,data:{items:[{id:'c',title:'Title',updated:'2026-01-01',archived:false,gizmoId:null}],hasMore:false}});
  assert.equal(calls[0].options.credentials,'include');assert.equal(calls[1].options.credentials,'include');
  assert.equal(calls[1].options.headers,undefined);
  const u=new URL(calls[1].path,'https://claude.ai');assert.equal(u.searchParams.get('offset'),'20');assert.equal(u.searchParams.get('consistency'),'strong');
 },()=>new Response(JSON.stringify({data:[{uuid:'c',name:'Title',updated_at:'2026-01-01',summary:'private',project:{name:'private'},settings:{secret:'private'}}],has_more:false,search_incomplete:null})));
});
test('Claude pagination follows has_more for short pages, includes archives and deduplicates scopes',async()=>{
 const calls=[];const result=await fetchClaudeAll(async(_,input)=>{calls.push(input);return {identity,data:input.archived?{items:[{id:'b'},{id:'archive'}],hasMore:false}:input.offset===0?{items:[{id:'a'}],hasMore:true}:{items:[{id:'b'}],hasMore:false}};});
 assert.deepEqual(result.conversations.map(c=>c.id),['a','b','archive']);assert.deepEqual(calls.map(c=>c.offset),[0,1,0]);assert.equal(calls[1].identity,identity);
});
test('Claude loader rejects repeated, incomplete, malformed and account-switched pages',async()=>{
 for(const mode of ['repeat','empty','schema','account','id']){let n=0;await assert.rejects(fetchClaudeAll(async()=>{n++;return {identity:mode==='account'&&n>1?'other':identity,data:mode==='schema'?{items:[]}:{items:mode==='empty'?[]:[{id:mode==='id'?null:'a'}],hasMore:true}};}));}
 await assert.rejects(fetchClaudeAll(async()=>{throw new Error('page failed');}),/page failed/);
});
test('Claude rejects search_incomplete and schema changes as non-retryable protocol failures',async()=>{
 for(const payload of [{data:[],has_more:false,search_incomplete:true},{data:[],has_more:'false'},{data:[{}],has_more:false}])await environment(async()=>{
  const r=await claudeTabRequest('list',{offset:0});assert.equal(r.status,422);assert.ok(r.error);
 },()=>new Response(JSON.stringify(payload)));
});
test('Claude requires a current session, active org membership and matching identity before a write',async()=>{
 await environment(async calls=>{
  assert.equal((await claudeTabRequest('delete',{id:'c',identity:'other'})).status,409);assert.equal(calls.length,1);
  document.cookie=`lastActiveOrg=${other}`;assert.equal((await claudeTabRequest('delete',{id:'c'})).status,401);assert.equal(calls.length,2);
  document.cookie='';assert.equal((await claudeTabRequest('identity')).status,401);assert.equal(calls.length,2);
  location.origin='https://chatgpt.com';assert.equal((await claudeTabRequest('delete',{id:'c'})).status,409);assert.equal(calls.length,2);
 });
 await environment(async()=>{globalThis.fetch=async()=>new Response('{}',{status:401});assert.equal((await claudeTabRequest('identity')).status,401);});
});
test('Claude detects an organization switch during a request',async()=>{
 await environment(async()=>{const r=await claudeTabRequest('list',{offset:0,identity});assert.equal(r.status,409);},()=>{document.cookie=`lastActiveOrg=${other}`;return new Response(JSON.stringify({data:[],has_more:false}));});
});
test('Claude DELETE acknowledges empty success or JSON object and encodes IDs',async()=>{
 for(const response of [()=>new Response('',{status:200}),()=>new Response(null,{status:204}),()=>new Response('{}',{status:200})])await environment(async calls=>{
  assert.deepEqual(await claudeTabRequest('delete',{id:'a/b',identity}),{identity,data:{success:true}});
  assert.equal(calls[1].options.method,'DELETE');assert.equal(calls[1].options.headers['Content-Type'],'application/json');assert.equal(calls[1].options.body,JSON.stringify({uuid:'a/b'}));assert.equal(calls[1].path,`/api/organizations/${org}/chat_conversations/a%2Fb`);
 },response);
});
test('Claude rejects HTML and explicit failure acknowledgements',async()=>{
 for(const body of ['<html>Verify</html>','{"success":false}','{"error":{"type":"denied"}}','[]','false'])await environment(async()=>{
  const r=await claudeTabRequest('delete',{id:'c',identity});assert.equal(r.status,422);assert.ok(r.error);
 },()=>new Response(body));
});
test('Claude classifies rate limits and network failures while keeping error bodies private',async()=>{
 await environment(async()=>{const r=await claudeTabRequest('list',{offset:0});assert.equal(r.status,429);assert.equal(r.retryAfter,10000);assert.equal(r.error.includes('private'),false);},()=>new Response('private error detail',{status:429,headers:{'retry-after':'10'}}));
 await environment(async()=>{const r=await claudeTabRequest('list',{offset:0});assert.equal(r.status,0);},()=>{throw new TypeError('network unavailable');});
 let n=0;const results=[];await deleteQueue(['a','b'],async()=>{n++;throw {status:422};},{wait:async()=>{},onResult:id=>results.push(id)});assert.equal(n,1);assert.deepEqual(results,['a']);
});
