import {chromium} from '@playwright/test';
import http from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const root=path.resolve('plugins/wtools-markdown');
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.woff2':'font/woff2','.woff':'font/woff','.ttf':'font/ttf','.png':'image/png'};
const server=http.createServer(async(req,res)=>{try{const file=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));if(!file.startsWith(root+path.sep))throw Error();const body=await readFile(file);res.setHeader('Content-Type',mime[path.extname(file)]||'application/octet-stream');res.setHeader('Content-Security-Policy',"default-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; worker-src 'self' blob:; object-src 'none'; frame-src 'none'; form-action 'none'; base-uri 'self'");res.end(body);}catch{res.statusCode=404;res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({channel:'msedge',headless:true});
const context=await browser.newContext({viewport:{width:1280,height:900},acceptDownloads:true});
await context.addInitScript(()=>{
  const get=id=>JSON.parse(localStorage.getItem('wtools:doc:'+id)||'null');
  const db={get,put:doc=>{if(window.failSave)throw Error('测试：磁盘空间不足');const rev=crypto.randomUUID();localStorage.setItem('wtools:doc:'+doc._id,JSON.stringify({...doc,_rev:rev}));return {ok:true,id:doc._id,rev};},remove:id=>{localStorage.removeItem('wtools:doc:'+id);return {ok:true};},allDocs:prefix=>Object.keys(localStorage).filter(k=>k.startsWith('wtools:doc:'+prefix)).map(k=>JSON.parse(localStorage.getItem(k)))};
  db.promises={removeAttachment:async id=>{localStorage.removeItem('attachment:'+id);return{ok:true};},postAttachment:async(id,data,type)=>{const bytes=[...new Uint8Array(data)];localStorage.setItem('attachment:'+id,JSON.stringify({bytes,type}));return {ok:true};},getAttachment:async id=>{const data=JSON.parse(localStorage.getItem('attachment:'+id)||'null');return data?new Uint8Array(data.bytes):null;},getAttachmentType:async id=>JSON.parse(localStorage.getItem('attachment:'+id)||'null')};
  window.wtools={db,dbStorage:{getItem:k=>JSON.parse(localStorage.getItem('wtools:kv:'+k)||'null'),setItem:(k,v)=>localStorage.setItem('wtools:kv:'+k,JSON.stringify(v))},onPluginEnter:cb=>window.entry=cb,onMainPush:(query,select)=>{window.pushQuery=query;window.pushSelect=select;},copyText:async()=>true};
});
const page=await context.newPage(), errors=[], external=[], failed=[];
page.setDefaultTimeout(15000);
page.on('pageerror',e=>errors.push(e.message));page.on('request',req=>{if(/^https?:/.test(req.url())&&!req.url().startsWith('http://127.0.0.1:'))external.push(req.url());});page.on('response',r=>{if(r.status()>=400)failed.push(r.url());});
await mkdir('dist/markdown-qa',{recursive:true});
try{
 await page.goto(`http://127.0.0.1:${server.address().port}/index.html`);
 await page.waitForFunction(()=>document.querySelector('#save-state').textContent==='已保存');
 await page.locator('#editor .katex:visible').first().waitFor();
 await page.locator('#editor .language-mermaid svg').first().waitFor({timeout:20000});
 await page.screenshot({path:'dist/markdown-qa/light.png'});
 await page.locator('#new-note').click();await page.locator('#title').fill('回归验证');await page.waitForTimeout(500);
 await page.locator('[data-mode=sv]').click();
 const code=page.locator('.vditor-sv');await code.waitFor();
 await page.locator('#files').setInputFiles({name:'回归验证.md',mimeType:'text/markdown',buffer:Buffer.from('# 测试标题\n\n全文搜索独特内容\n\n- [ ] 待办任务\n\n$E=mc^2$\n\n```javascript\nconst value = 42;\n```\n')});
 await page.waitForTimeout(700);assert.equal(await page.locator('#save-state').innerText(),'已保存');
 await page.reload();await page.waitForFunction(()=>document.querySelector('#save-state').textContent==='已保存');
 await page.locator('#search').fill('独特内容');await page.locator('#tree .tree-row').click();assert.equal(await page.locator('#title').inputValue(),'回归验证');
 await page.locator('#editor .katex:visible').first().waitFor();
 await page.waitForFunction(()=>typeof hljs!=='undefined');assert.ok(await page.evaluate(()=>hljs.listLanguages().length)>=168);
 // Uploaded images use WTools binary attachments and stable references in documents.
 await page.evaluate(async()=>{const bytes=Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII='),c=>c.charCodeAt(0));await uploadImages([new File([bytes],'测试.png',{type:'image/png'})]);save();});
 assert.ok(await page.evaluate(()=>current().body.includes('wtools-image:')));
 const imageNote=await page.evaluate(()=>current()._id);await page.reload();await page.waitForFunction(()=>document.querySelector('#save-state').textContent==='已保存');
 await page.evaluate(id=>select(id),imageNote);await page.locator('#editor img[src^="data:image"]').first().waitFor();
 const results=await page.evaluate(()=>window.pushQuery({payload:'笔记 独特内容'}));assert.equal(results.length,1);
 await page.locator('#search').fill('');
 // Failed saves must preserve the draft and prevent switching.
 await page.evaluate(()=>window.failSave=true);await page.locator('#title').fill('未保存草稿');await page.waitForTimeout(500);
 await page.locator('#tree .tree-row').filter({hasText:'欢迎使用'}).click();assert.equal(await page.locator('#title').inputValue(),'未保存草稿');
 await page.evaluate(()=>window.failSave=false);await page.keyboard.press('Control+s');await page.waitForTimeout(500);
 await page.locator('#chart').click();await page.locator('[data-chart=bar]').click();
 await page.locator('#editor canvas').first().waitFor({timeout:15000});
 for(const [label,ext] of [['Markdown 文件','.md'],['HTML 文件','.html'],['图像文件','.png'],['PDF 文件','.pdf']]){
   await page.locator('#export').click();const download=page.waitForEvent('download',{timeout:45000});await page.getByRole('menuitem',{name:new RegExp(label)}).click();const d=await download;assert.ok(d.suggestedFilename().endsWith(ext));await d.saveAs('dist/markdown-qa/export'+ext);
 }
 await page.locator('#new-folder').click();await page.locator('#form-value').fill('测试文件夹');await page.getByRole('button',{name:'确定',exact:true}).click();await page.getByRole('button',{name:/测试文件夹/}).waitFor();
 await page.locator('#theme').click();await page.screenshot({path:'dist/markdown-qa/dark.png'});
 await page.setViewportSize({width:720,height:700});await page.screenshot({path:'dist/markdown-qa/narrow.png'});
 await page.evaluate(()=>{editor.insertValue('\n```echarts\n(()=>{window.injected=true;return {}})()\n```\n');markDirty();});
 await page.locator('#editor .vditor-reset--error').first().waitFor();assert.equal(await page.evaluate(()=>window.injected),undefined);
 const isolated=await browser.newContext();const missing=await isolated.newPage();await missing.goto(page.url());await missing.getByText('需要 WTools 宿主').waitFor();assert.equal(await missing.locator('#new-note').isDisabled(),true);await isolated.close();
 console.log(JSON.stringify({passed:true,errors,external,failed},null,2));assert.deepEqual(errors,[]);assert.deepEqual(external,[]);assert.deepEqual(failed,[]);
}catch(error){console.log(error,{errors,external,failed});await page.screenshot({path:'dist/markdown-qa/failure.png',timeout:5000});throw error;}finally{await browser.close();server.close();}
