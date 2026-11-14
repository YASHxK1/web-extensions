const { default: puppeteer } = await import(process.env.PUPPETEER_MODULE || 'puppeteer-core');
import assert from 'node:assert/strict';
import path from 'node:path';
const browser=await puppeteer.launch({executablePath:process.env.CHROME_PATH||'/usr/bin/google-chrome',headless:true,pipe:true,args:['--no-sandbox','--enable-unsafe-extension-debugging'],ignoreDefaultArgs:['--disable-extensions']});
try {
 const cdp=await browser.target().createCDPSession();const {id}=await cdp.send('Extensions.loadUnpacked',{path:path.resolve(import.meta.dirname,'..')});
 const panel=await browser.newPage();await panel.setViewport({width:390,height:1150});const errors=[];panel.on('pageerror',error=>errors.push(error.message));
 await panel.evaluateOnNewDocument(()=>{
  window.mock={active:{id:100,url:'https://claude.ai/new'},identity:'account:workspace',calls:[],writes:[],retries:0,activation:[],updated:[],removed:[],listFailure:false,denySecond:false};
  chrome.tabs.query=async()=>[mock.active];
  chrome.tabs.onActivated.addListener=listener=>mock.activation.push(listener);
  chrome.tabs.onUpdated.addListener=listener=>mock.updated.push(listener);
  chrome.tabs.onRemoved.addListener=listener=>mock.removed.push(listener);
  chrome.scripting.executeScript=async({func,args:[operation,input]})=>{
   const provider=func.name==='claudeTabRequest'?'claude':'chatgpt';mock.calls.push({provider,operation});
   if(input.identity && input.identity!==mock.identity)return[{result:{error:'Account changed. Load chats again.',status:409}}];
   if(operation==='identity')return[{result:{identity:mock.identity}}];
   if(operation==='projects')return[{result:{identity:mock.identity,data:{items:[],cursor:null}}}];
   if(operation==='list'){
    if(mock.listFailure)return[{result:{error:'Incomplete history. Reload.',status:422}}];
    if(provider==='chatgpt')return[{result:{identity:mock.identity,data:{items:input.archived?[]:[{id:'a',title:'Same ID in ChatGPT',update_time:'2026-01-01'}],total:input.archived?0:1}}}];
    const items=input.archived?[]:input.offset===0?[{id:'a',title:'Alpha conversation',updated:'2025-01-01',gizmoId:null},{id:'b',title:'Newest conversation',updated:'2026-01-01',gizmoId:null}]:[{id:'c',title:'Old conversation',updated:'2024-01-01',gizmoId:null}];
    return[{result:{identity:mock.identity,data:{items,hasMore:!input.archived&&input.offset===0}}}];
   }
   mock.writes.push({provider,id:input.id});
   if(input.id==='a'&&mock.retries++===0)return[{result:{error:'HTTP 429',status:429,retryAfter:10}}];
   if(input.id==='b'&&mock.denySecond)return[{result:{error:'HTTP 403',status:403}}];
   return[{result:{identity:mock.identity,data:{success:true}}}];
  };
 });
 await panel.goto(`chrome-extension://${id}/sidepanel.html`);
 const load=async(count)=>{await panel.click('#load');await panel.waitForFunction(count=>!document.getElementById('load').disabled&&document.querySelectorAll('.row').length===count,{},count);};
 const switchTo=async(provider)=>panel.evaluate(async provider=>{mock.active=provider==='claude'?{id:100,url:'https://claude.ai/new'}:{id:200,url:'https://chatgpt.com/'};for(const listener of mock.activation)await listener({tabId:mock.active.id});},provider);
 await load(3);
 assert.match(await panel.$eval('#provider',e=>e.textContent),/CLAUDE/);assert.equal(await panel.$$eval('.chat-group',es=>es.length),0);assert.equal(await panel.$$eval('.flat-list',es=>es.length),1);assert.equal(await panel.$('#select-general'),null);
 assert.deepEqual(await panel.$$eval('.title',es=>es.map(e=>e.textContent)),['Newest conversation','Alpha conversation','Old conversation']);assert.equal(await panel.$$eval('.toggle input:checked',es=>es.length),0);
 assert.equal(await panel.evaluate(()=>mock.calls.some(c=>c.operation==='projects')),false);
 await panel.type('#search','Alpha');await panel.click('#select');await panel.$eval('#search',e=>{e.value='';e.dispatchEvent(new Event('input'));});assert.equal(await panel.$$eval('.toggle input:checked',es=>es.length),1);
 await panel.click('#invert');assert.equal(await panel.$$eval('.toggle input:checked',es=>es.length),2);await panel.click('#keep');assert.equal(await panel.$$eval('.toggle input:checked',es=>es.length),0);
 await panel.click('#select');await panel.screenshot({path:path.resolve(import.meta.dirname,'../preview-claude.png'),fullPage:true});
 await panel.click('#proceed');await panel.waitForSelector('dialog[open]');assert.equal(await panel.$eval('#deleteCount',e=>e.textContent),'3');assert.match(await panel.$eval('#confirmContext',e=>e.textContent),/Claude/);
 assert.equal(await panel.evaluate(async()=>Object.values(await chrome.storage.session.get(null)).find(v=>v?.ids)?.provider),'claude');await panel.click('#cancel');assert.deepEqual(await panel.evaluate(()=>mock.writes),[]);
 await switchTo('chatgpt');assert.equal(await panel.$$eval('.row',es=>es.length),0);assert.equal(await panel.$eval('#proceed',e=>e.disabled),true);
 await load(1);assert.match(await panel.$eval('#provider',e=>e.textContent),/CHATGPT/);assert.equal(await panel.$$eval('.toggle input:checked',es=>es.length),0);
 await switchTo('claude');await load(3);assert.equal(await panel.$$eval('.toggle input:checked',es=>es.length),0);
 // Account change after confirmation must prevent even the first DELETE.
 await panel.click('#select');await panel.click('#proceed');await panel.waitForSelector('dialog[open]');await panel.evaluate(()=>{mock.identity='different:workspace';});await panel.click('#confirmDelete');await panel.waitForFunction(()=>!document.getElementById('load').disabled);
 assert.equal(await panel.$$eval('.row',es=>es.length),0);assert.deepEqual(await panel.evaluate(()=>mock.writes),[]);
 await load(3);await panel.click('#select');await panel.click('#proceed');await panel.waitForSelector('dialog[open]');
 // Switching provider while the confirmation is open closes and discards it.
 await switchTo('chatgpt');assert.equal(await panel.$eval('#confirm',e=>e.open),false);assert.equal(await panel.evaluate(async()=>Object.keys(await chrome.storage.session.get(null)).length),0);
 await switchTo('claude');await load(3);await panel.click('#select');await panel.click('#proceed');await panel.waitForSelector('dialog[open]');await panel.click('#confirmDelete');
 await panel.waitForFunction(()=>document.getElementById('status').textContent.startsWith('Finished:'),{timeout:20000});
 assert.match(await panel.$eval('#status',e=>e.textContent),/3 deleted, 0 failed/);
 assert.deepEqual(await panel.evaluate(()=>mock.writes.map(w=>w.provider)),['claude','claude','claude','claude']);assert.match(await panel.$eval('#log',e=>e.textContent),/429/);assert.equal(await panel.$eval('#progress',e=>e.value),3);
 // Stop interrupts a retry wait and prevents the pending retry and next chat.
 await panel.evaluate(()=>{mock.writes=[];mock.retries=0;});await load(3);await panel.type('#search','Alpha');await panel.click('#select');await panel.click('#proceed');await panel.waitForSelector('dialog[open]');await panel.click('#confirmDelete');
 await panel.waitForFunction(()=>mock.writes.length===1);await panel.click('#stop');await panel.waitForFunction(()=>!document.getElementById('load').disabled);assert.equal(await panel.evaluate(()=>mock.writes.length),1);assert.match(await panel.$eval('#status',e=>e.textContent),/Stopped:/);
 // HTTP 403 stops the queue and leaves later selections unprocessed.
 await panel.evaluate(()=>{mock.writes=[];mock.retries=10;mock.denySecond=true;});await load(3);await panel.click('#select');await panel.click('#proceed');await panel.waitForSelector('dialog[open]');await panel.click('#confirmDelete');await panel.waitForFunction(()=>!document.getElementById('load').disabled);
 assert.deepEqual(await panel.evaluate(()=>mock.writes.map(w=>w.id)),['b']);assert.match(await panel.$eval('#status',e=>e.textContent),/1 failed, 2 unprocessed/);
 // Incomplete loading cannot expose a deletable partial list.
 await panel.evaluate(()=>{mock.listFailure=true;});await panel.click('#load');await panel.waitForFunction(()=>!document.getElementById('load').disabled);assert.equal(await panel.$$eval('.row',es=>es.length),0);assert.equal(await panel.$eval('#proceed',e=>e.disabled),true);
 assert.deepEqual(errors,[]);
 console.log('PASS: Claude flat review, pagination, sorting, search and bulk controls; provider/account/tab isolation; scoped plans; confirmation/cancel; mock deletion; 429 retry; stop; 403; incomplete-load blocking. No live deletion requests.');
}finally{await browser.close();}
