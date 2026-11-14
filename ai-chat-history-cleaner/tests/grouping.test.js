import test from 'node:test';
import assert from 'node:assert/strict';
import { groupChats } from '../grouping.js';
import { fetchProjects, fetchAll } from '../core.js';
import { tabRequest } from '../api.js';
const chat = (id, gizmoId, updated = '2026-11-01') => ({ id, gizmoId, title: `Chat ${id}`, updated });
test('grouping classifies projects, general and custom GPTs without losing chats', () => {
  const chats = [chat('a',null),chat('b','g-custom'),chat('c','g-p-z'),chat('d','catalog-project'),chat('e','g-p-unknown'),chat('f','g-p-other')];
  const groups = groupChats(chats,new Map([['g-p-z','Zebra'],['catalog-project','Alpha'],['g-p-empty','Empty']]));
  assert.deepEqual(groups.map(g=>g.name),['General chats','Alpha','Unnamed project 1 (name unavailable)','Unnamed project 2 (name unavailable)','Zebra']);
  assert.deepEqual(groups[0].chats.map(c=>c.id),['a','b']);
  assert.equal(new Set(groups.flatMap(g=>g.chats.map(c=>c.id))).size,chats.length);
  assert.equal(groups.reduce((sum,g)=>sum+g.total,0),chats.length);
});
test('project name search finds archived chats, keeps newest first, and reports total selection counts', () => {
  const chats=[chat('old','g-p-a','2025-01-01'),{...chat('new','g-p-a','2026-01-01'),archived:true},chat('other',null)];
  const groups=groupChats(chats,new Map([['g-p-a','Finance']]),'FINANCE',new Set(['old','other']));
  assert.equal(groups.length,1);assert.deepEqual(groups[0].chats.map(c=>c.id),['new','old']);
  assert.equal(groups[0].total,2);assert.equal(groups[0].deleteCount,1);assert.equal(groups[0].chats[0].archived,true);
  const filtered=groupChats(chats,new Map([['g-p-a','Finance']]),'new',new Set(['old']));
  assert.equal(filtered[0].chats.length,1);assert.equal(filtered[0].deleteCount,1);
});
test('conversation loading preserves project metadata',async()=>{
 const result=await fetchAll(async(_,input)=>({identity:'u',data:{items:input.archived?[]:[{id:'a',gizmo_id:'g-p-a'}],total:input.archived?0:1}}));
 assert.equal(result.conversations[0].gizmoId,'g-p-a');
});
test('project listing follows cursors and binds all pages to the same identity',async()=>{
 const calls=[];
 const projects=await fetchProjects(async(_,input)=>{calls.push(input);return {identity:'u',data:input.cursor?{items:[{id:'b',name:'Beta'}],cursor:null}:{items:[{id:'a',name:' Alpha '}],cursor:'next'}};},'u');
 assert.deepEqual([...projects],[['a','Alpha'],['b','Beta']]);assert.deepEqual(calls,[{identity:'u',cursor:null},{identity:'u',cursor:'next'}]);
 await assert.rejects(fetchProjects(async()=>({identity:'u',data:{items:[],cursor:'same'}}),'u'),/repeated/);
 await assert.rejects(fetchProjects(async()=>({identity:'other',data:{items:[],cursor:null}}),'u'),/Account changed/);
});
test('project API returns only normalized IDs, names and cursor, not sensitive project fields',async()=>{
 const oldFetch=globalThis.fetch,oldLocation=globalThis.location;globalThis.location={origin:'https://chatgpt.com'};let requested;
 globalThis.fetch=async(url)=>{requested=url;return new Response(JSON.stringify(url==='/api/auth/session'?{accessToken:'secret',user:{id:'u'},account:{id:'a'}}:{items:[{gizmo:{gizmo:{id:'g-p-one',display:{name:'One'},instructions:'private',author:{user_email:'private'}}},conversations:{items:[{title:'private'}]}}],cursor:'next'}));};
 try{const result=await tabRequest('projects',{identity:'u:a',cursor:'a+b /'});assert.deepEqual(result,{identity:'u:a',data:{items:[{id:'g-p-one',name:'One'}],cursor:'next'}});assert.equal(new URL(requested,'https://chatgpt.com').searchParams.get('cursor'),'a+b /');}
 finally{globalThis.fetch=oldFetch;globalThis.location=oldLocation;}
});
