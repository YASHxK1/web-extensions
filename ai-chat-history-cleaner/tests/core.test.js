import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchAll, withRetry, deleteQueue } from '../core.js';
import { tabRequest } from '../api.js';
const item = id => ({id, title:`Chat ${id}`});
test('pagination fetches regular and archived chats and deduplicates across scopes', async () => {
  const calls=[];
  const result=await fetchAll(async (_, input) => {
    calls.push(input);
    return {identity:'user',data: input.archived ? {items:[item('1'),item('a')],total:2} : input.offset===0 ? {items:[item('1'),item('2')],total:3} : {items:[item('3')],total:3}};
  });
  assert.deepEqual(result.conversations.map(c=>c.id), ['1','2','3','a']);
  assert.equal(calls[1].offset,2); assert.equal(calls[2].archived,true);
  assert.equal(calls[1].identity,'user');
});
test('partial, repeated, malformed and account-switched lists fail closed', async () => {
  for (const mode of ['partial','repeat','account','schema','total']) {
    let count=0;
    await assert.rejects(fetchAll(async () => {
      count++;
      if(mode==='schema') return {identity:'u',data:{}};
      return {identity:mode==='account' && count>1 ? 'other':'u',data:{items:count===1 || mode==='repeat' ? [item('1')] : [],total:mode==='total' && count>1 ? 3:2}};
    }));
  }
});
test('missing total ends on short page; empty history works', async () => {
  const r=await fetchAll(async()=>({identity:'u',data:{items:[]}})); assert.deepEqual(r.conversations,[]);
});
test('429 respects Retry-After, 5xx uses retries, 403 never retries', async () => {
  let tries=0; const delays=[];
  const r=await withRetry(async()=>{if(++tries<3) throw {status:429,retryAfter:60000}; return 'ok';},{wait:async ms=>delays.push(ms)});
  assert.equal(r,'ok'); assert.deepEqual(delays,[60000,60000]);
  tries=0;
  await assert.rejects(withRetry(async()=>{tries++; throw {status:403};})); assert.equal(tries,1);
  tries=0;
  await assert.rejects(withRetry(async()=>{tries++; throw {status:503};},{wait:async()=>{}})); assert.equal(tries,4);
});
test('queue serializes writes, retains failures and stops on auth errors',async()=>{
  const calls=[], results=[], delays=[];
  await deleteQueue(['a','b','c'],async id=>{calls.push(id);if(id==='b')throw {status:401};},{wait:async ms=>delays.push(ms),onResult:(id,e)=>results.push([id,!!e])});
  assert.deepEqual(calls,['a','b']);assert.deepEqual(results,[['a',false],['b',true]]);assert.deepEqual(delays,[1200]);
});
test('stop sends no subsequent write',async()=>{
  let stop=false; const calls=[];
  await deleteQueue(['a','b'],async id=>{calls.push(id);stop=true;},{stopped:()=>stop,wait:async()=>{}});
  assert.deepEqual(calls,['a']);
});
test('tab API uses cookies, ephemeral bearer, encoded ID, and verifies identity', async () => {
  const oldFetch=globalThis.fetch, oldLocation=globalThis.location;
  globalThis.location={origin:'https://chatgpt.com'};
  const calls=[];
  globalThis.fetch=async(url,options)=>{
    calls.push({url,options});
    return new Response(JSON.stringify(url==='/api/auth/session' ? {accessToken:'secret',user:{id:'u'},account:{id:'a'}} : {success:true}),{headers:{'content-type':'application/json'}});
  };
  try {
    const r=await tabRequest('delete',{id:'a/b',identity:'u:a'});
    assert.deepEqual(r,{identity:'u:a',data:{success:true}});
    assert.equal(calls[1].url,'/backend-api/conversation/id/a%2Fb');
    assert.equal(calls[1].options.headers.Authorization,'Bearer secret');
    assert.equal(calls[1].options.method,'DELETE');
    assert.equal(calls[1].options.headers['ChatGPT-Account-ID'],'a');
    assert.equal(calls[1].options.body,undefined);
    assert.equal(calls[0].options.credentials,'include');
    calls.length=0;
    const switched=await tabRequest('delete',{id:'b',identity:'other'});
    assert.equal(switched.status,409);assert.equal(calls.length,1);
  } finally {globalThis.fetch=oldFetch;globalThis.location=oldLocation;}
});
test('unexpected deletion response fails instead of claiming success', async () => {
  const oldFetch=globalThis.fetch, oldLocation=globalThis.location;
  globalThis.location={origin:'https://chatgpt.com'};
  globalThis.fetch=async url=>new Response(JSON.stringify(url==='/api/auth/session'?{accessToken:'s',user:{id:'u'},account:{id:'a'}}:{}));
  try {assert.match((await tabRequest('delete',{id:'a'})).error,/not acknowledged/);}
  finally {globalThis.fetch=oldFetch;globalThis.location=oldLocation;}
});

// Regression: the live ChatGPT API returns offset + limit + 1 until the last page.
test('growing lower-bound totals enumerate all pages through the tail', async () => {
  const offsets = [];
  const result = await fetchAll(async (_, { offset, archived }) => {
    if (archived) return { identity: 'u', data: { items: [], total: 0, offset: 0 } };
    offsets.push(offset);
    const count = offset < 40 ? 20 : 3;
    return { identity: 'u', data: { offset, total: offset < 40 ? offset + 21 : 43,
      items: Array.from({ length: count }, (_, i) => item(String(offset + i))) } };
  });
  assert.deepEqual(offsets, [0, 20, 40]);
  assert.equal(result.conversations.length, 43);
});
test('a decreasing estimate on the final page is accepted', async () => {
  const result = await fetchAll(async (_, { offset, archived }) => ({ identity: 'u', data: {
    offset, total: archived ? 0 : offset === 0 ? 100 : 21,
    items: archived ? [] : Array.from({ length: offset === 0 ? 20 : 1 }, (_, i) => item(String(offset + i)))
  } }));
  assert.equal(result.conversations.length, 21);
});
test('an incorrect returned offset fails closed', async () => {
  await assert.rejects(fetchAll(async () => ({ identity: 'u', data: { offset: 20, total: 1, items: [item('1')] } })), /offset/);
});
