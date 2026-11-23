/* All persistent data belongs to window.wtools. No alternate storage backend. */
const $ = id => document.getElementById(id);
const api = window.wtools;
const PREFIX = 'markdown:';
const assetPrefix = 'wtools-image:';
const cdn = new URL('./vendor/vditor', location.href).href;
let rows = [], selected = null, folderContext = null, editor, ready = false, loading = false;
let mode = 'wysiwyg', theme = 'light', dirty = false, saveTimer, toastTimer, loadToken = 0;
let editorGeneration = 0, dragged, busyExport = false;
const expanded = new Set(), imageData = new Map();
const current = () => rows.find(row => row._id === selected);
function toast(message) {
  $('toast').textContent = message; $('toast').hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => $('toast').hidden = true, 5500);
}
function status(text, error = false) { $('save-state').textContent = text; $('save-state').toggleAttribute('data-error', error); }
function fail(error) { status('未保存 · Ctrl+S 重试', true); toast(error.message || String(error)); }
function put(row) {
  const result = api.db.put(row);
  if (!result?.ok) throw new Error(result?.message || '数据库写入失败');
  row._rev = result.rev;
}
function canonical(md) {
  for (const [id, data] of imageData) md = md.split(data).join(assetPrefix + id);
  return md;
}
async function inflate(md) {
  const ids = [...new Set(md.match(/wtools-image:[a-zA-Z0-9-]+/g) || [])];
  for (const ref of ids) {
    const id = ref.slice(assetPrefix.length);
    if (!imageData.has(id)) {
      const bytes = await api.db.promises.getAttachment(id);
      const meta = await api.db.promises.getAttachmentType(id);
      if (!bytes || !meta) { toast('一张图片附件已丢失：' + id); continue; }
      const data = await dataURL(new Blob([bytes], {type:meta.type}));
      imageData.set(id, data);
    }
    md = md.split(ref).join(imageData.get(id));
  }
  return md;
}
function dataURL(blob) {
  return new Promise((resolve, reject) => {const r = new FileReader(); r.onload = () => resolve(r.result); r.onerror = () => reject(r.error); r.readAsDataURL(blob);});
}
async function uploadImages(files) {
  const target = selected;
  try {
    for (const file of files) {
      if (!/^image\/(png|jpeg|gif|webp)$/.test(file.type)) throw new Error('图片支持 PNG、JPEG、GIF 和 WebP');
      if (file.size > 8 * 1024 * 1024) throw new Error('单张图片不能超过 8 MiB');
      const id = 'md-' + crypto.randomUUID();
      const result = await api.db.promises.postAttachment(id, await file.arrayBuffer(), file.type);
      if (!result.ok) throw new Error(result.message || '附件写入失败');
      put({_id:'markdown-image:'+id, attachmentId:id, createdAt:Date.now()});
      const data = await dataURL(file); imageData.set(id, data);
      if (selected !== target) throw new Error('已切换笔记，请重新插入图片');
      editor.insertValue(`\n![${file.name.replace(/[\[\]\\\n]/g, '')}](${data})\n`);
      markDirty();
    }
    return null;
  } catch(error) { fail(error); return error.message; }
}
function save() {
  clearTimeout(saveTimer);
  if (!dirty || loading || !ready || !current()) return !dirty;
  try {
    const row = current(), existing = api.db.get(row._id);
    if (!existing || existing._rev !== row._rev) throw new Error('笔记已被其他窗口修改。请先导出当前内容备份，再重新打开插件。');
    const next = {...row, title:$('title').value.trim() || '未命名笔记', body:canonical(editor.getValue()), updatedAt:Date.now()};
    put(next); rows[rows.indexOf(row)] = next; dirty = false;
    status('已保存'); renderTree(); return true;
  } catch(error) { fail(error); return false; }
}
function markDirty() {
  if (loading || !ready || !current()) return;
  dirty = true; status('正在保存…'); updateWords();
  clearTimeout(saveTimer); saveTimer = setTimeout(save, 300);
}
function updateWords() { $('words').textContent = `${Array.from(editor?.getValue() || '').length.toLocaleString()} 字符`; }
function ordered(parent) {return rows.filter(r => r.parent === parent).sort((a,b) => a.order - b.order || a.title.localeCompare(b.title));}
function renderTree() {
  const tree = $('tree'), q = $('search').value.trim().toLocaleLowerCase();
  tree.replaceChildren();
  function add(row, depth) {
    const button = document.createElement('button');
    button.className = 'tree-row' + (row._id === selected ? ' active' : '');
    button.dataset.id = row._id; button.draggable = true; button.style.paddingLeft = `${8 + depth * 17}px`;
    button.title = row.title;
    const icon = document.createElement('span'); icon.className = 'icon';
    icon.textContent = row.kind === 'folder' ? expanded.has(row._id) ? '⌄' : '›' : '▤';
    const label = document.createElement('span'); label.className = 'label'; label.textContent = row.title;
    button.append(icon, label);
    if (row.kind === 'folder') {const count = document.createElement('small'); count.textContent = rows.filter(r => r.parent === row._id).length; button.append(count);}
    if (row._id === selected) button.setAttribute('aria-current','page');
    button.onclick = () => {
      if (row.kind === 'folder') {folderContext = row._id; expanded.has(row._id) ? expanded.delete(row._id) : expanded.add(row._id); renderTree();}
      else select(row._id);
    };
    button.oncontextmenu = event => {event.preventDefault(); rowMenu(row, event.clientX, event.clientY);};
    button.ondragstart = event => {dragged = row._id; event.dataTransfer.setData('text/plain', row._id); event.dataTransfer.effectAllowed = 'move';};
    button.ondragover = event => {event.preventDefault(); event.stopPropagation(); button.classList.add('drag-over');};
    button.ondragleave = () => button.classList.remove('drag-over');
    button.ondrop = event => {event.preventDefault(); event.stopPropagation(); button.classList.remove('drag-over'); move(dragged,row,event.clientY - button.getBoundingClientRect().top > button.offsetHeight * .25 && event.clientY - button.getBoundingClientRect().top < button.offsetHeight * .75);};
    tree.append(button);
    if (!q && row.kind === 'folder' && expanded.has(row._id)) ordered(row._id).forEach(child => add(child, depth + 1));
  }
  if (q) rows.filter(r => r.kind === 'note' && (r.title + '\n' + r.body).toLocaleLowerCase().includes(q)).sort((a,b) => b.updatedAt-a.updatedAt).forEach(r=>add(r,0));
  else ordered(null).forEach(r => add(r,0));
  if (!tree.children.length) {const p=document.createElement('p'); p.className='empty-list'; p.textContent=q?'没有找到匹配的笔记':'还没有笔记，开始记录吧'; tree.append(p);}
  $('note-count').textContent = `${rows.filter(r => r.kind === 'note').length} 篇笔记`;
}
async function select(id) {
  if (loading || !save()) return;
  const row = rows.find(r => r._id === id);
  if (!row || row.kind !== 'note') { selected = null; $('editor').hidden = true; $('empty').hidden = false; $('title').value = ''; $('title').disabled = true; renderTree(); return; }
  const token = ++loadToken; loading = true; editor?.disabled();
  try {
    const value = await inflate(row.body);
    if (token !== loadToken) return;
    selected = id; folderContext = row.parent; $('title').value = row.title; $('title').disabled = false;
    $('editor').hidden = false; $('empty').hidden = true;
    editor.setValue(value, true); dirty = false; status('已保存'); updateWords(); renderTree();
  } catch(error) { fail(error); }
  finally {loading = false; editor?.enable();}
}
function ask(heading, label, value = '') {
  return new Promise(resolve => {
    const dialog = $('form-dialog'); $('form-heading').textContent=heading; $('form-label').textContent=label; $('form-value').value=value;
    dialog.returnValue='cancel'; dialog.onclose = () => resolve(dialog.returnValue === 'ok' ? $('form-value').value.trim() : null);
    dialog.showModal(); $('form-value').focus(); $('form-value').select();
  });
}
async function create(kind, parent = folderContext) {
  if (!ready || loading || !save()) return;
  const name = kind === 'folder' ? await ask('新建文件夹','文件夹名称','新建文件夹') : '未命名笔记';
  if (!name) return;
  if (parent && !rows.some(r=>r._id===parent && r.kind==='folder')) parent=null;
  const row = {_id:PREFIX+crypto.randomUUID(), kind, title:name, body:'', parent, order:Date.now(), updatedAt:Date.now()};
  try { put(row); rows.push(row); if(parent) expanded.add(parent); renderTree(); if(kind==='note'){await select(row._id); $('title').focus(); $('title').select();} else expanded.add(row._id); }
  catch(error){fail(error);}
}
function move(id, target, into) {
  if (!save()) return;
  const row = rows.find(r=>r._id===id); if(!row || id===target?._id) return;
  const parent = target?.kind==='folder' && into ? target._id : target?.parent ?? null;
  let ancestor=parent;
  while(ancestor){if(ancestor===id){toast('不能把文件夹移入自身或子文件夹');return;} ancestor=rows.find(r=>r._id===ancestor)?.parent;}
  const siblings=ordered(parent).filter(r=>r._id!==id), index=target && !(target.kind==='folder'&&into)? siblings.indexOf(target):siblings.length;
  const before=siblings[index-1]?.order ?? 0, after=siblings[index]?.order ?? Math.max(Date.now(),before+2048);
  const next={...row,parent,order:(before+after)/2};
  try{put(next); rows[rows.indexOf(row)]=next; if(parent)expanded.add(parent);renderTree();}catch(error){fail(error);}
}
async function rename(row) {
  if(!save())return;
  row=rows.find(r=>r._id===row._id);if(!row)return;
  const name=await ask('重命名',row.kind==='folder'?'文件夹名称':'笔记名称',row.title); if(!name)return;
  try{const next={...row,title:name,updatedAt:Date.now()};put(next);rows[rows.indexOf(row)]=next;if(row._id===selected)$('title').value=name;renderTree();}catch(error){fail(error);}
}
async function remove(row) {
  if(!save())return;
  const ids=new Set([row._id]); let size;
  do{size=ids.size;rows.filter(r=>ids.has(r.parent)).forEach(r=>ids.add(r._id));}while(size!==ids.size);
  if(!confirm(`删除「${row.title}」${ids.size>1?`及其中 ${ids.size-1} 项内容`:''}？此操作无法撤销。`))return;
  const removedImages=new Set(rows.filter(r=>ids.has(r._id)).flatMap(r=>r.body.match(/wtools-image:[a-zA-Z0-9-]+/g)||[]));
  try{
    for(const id of [...ids].reverse()){const result=api.db.remove(id);if(!result?.ok)throw new Error('删除失败');rows=rows.filter(r=>r._id!==id);}
    if(ids.has(selected))await select(rows.find(r=>r.kind==='note')?._id);
    if(ids.has(folderContext))folderContext=null;renderTree();
    for(const ref of removedImages){if(rows.some(r=>r.body.includes(ref)))continue;const id=ref.slice(assetPrefix.length);await api.db.promises.removeAttachment(id);api.db.remove('markdown-image:'+id);imageData.delete(id);}
  }catch(error){fail(error);}
}
async function cleanupImages(){
  if(!save())return;
  if(!confirm('清理所有笔记均未引用的图片？编辑器撤销记录中的旧图片也会被清理。'))return;
  let count=0;
  for(const meta of api.db.allDocs('markdown-image:')){
    if(rows.some(row=>row.body.includes(assetPrefix+meta.attachmentId)))continue;
    await api.db.promises.removeAttachment(meta.attachmentId);api.db.remove(meta._id);imageData.delete(meta.attachmentId);count++;
  }
  toast(`已清理 ${count} 张未引用图片`);
}
function popup(items,x,y) {
  const menu=$('menu');menu.replaceChildren();
  for(const item of items){if(!item){menu.append(document.createElement('hr'));continue;}const b=document.createElement('button');b.role='menuitem';b.textContent=item[0];if(item[2])b.className=item[2];b.onclick=()=>{menu.hidden=true;Promise.resolve(item[1]()).catch(fail);};menu.append(b);}
  menu.hidden=false;const rect=menu.getBoundingClientRect();menu.style.left=Math.max(8,Math.min(x,innerWidth-rect.width-8))+'px';menu.style.top=Math.max(8,Math.min(y,innerHeight-rect.height-8))+'px';menu.querySelector('button')?.focus();
}
function rowMenu(row,x,y){popup([
  ...(row.kind==='folder'?[['新建笔记',()=>create('note',row._id)],['新建文件夹',()=>create('folder',row._id)],null]:[]),
  ['重命名',()=>rename(row)],['导出 Markdown'+(row.kind==='folder'?'（含子文件夹）':''),()=>exportFolder(row)],null,['删除'+(row.kind==='folder'?'文件夹':'笔记'),()=>remove(row),'danger']
],x,y);}
function anchorMenu(button,items){const r=button.getBoundingClientRect();popup(items,r.left,r.bottom+6);}
function download(blob, name){const a=document.createElement('a'),url=URL.createObjectURL(blob);a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);}
const filename = name => (name.replace(/[<>:"/\\|?*\x00-\x1f]/g,'_').replace(/[. ]+$/g,'').slice(0,100)||'笔记');
async function portable(row){return inflate(row._id===selected&&ready?canonical(editor.getValue()):row.body);}
async function exportFolder(row){
  if(row.kind==='note'){download(new Blob([await portable(row)],{type:'text/markdown;charset=utf-8'}),filename(row.title)+'.md');return;}
  // A single Markdown document avoids silent browser blocking of multiple downloads.
  const chunks=[];
  async function walk(folder,depth){for(const child of ordered(folder._id)){chunks.push('#'.repeat(Math.min(depth,6))+' '+child.title+'\n');if(child.kind==='folder')await walk(child,depth+1);else chunks.push(await portable(child),'\n---\n');}}
  await walk(row,1);download(new Blob([chunks.join('\n\n')],{type:'text/markdown;charset=utf-8'}),filename(row.title)+'.md');
}
async function renderedSheet() {
  const sheet=document.createElement('div');sheet.className='export-sheet';document.body.append(sheet);
  try{
    await Vditor.preview(sheet,await portable(current()),{cdn,mode:'light',lang:'zh_CN',markdown:{sanitize:true},math:{engine:'KaTeX'},theme:{current:'light',path:cdn+'/dist/css/content-theme'},hljs:{style:'github'}});
    // Diagram libraries initialize asynchronously after the preview callback.
    const deadline=Date.now()+12000;
    while(sheet.querySelector('[data-processed="false"], .language-mermaid:not([data-processed]), .language-echarts:not([data-processed])') && Date.now()<deadline)await new Promise(r=>setTimeout(r,100));
    await new Promise(r=>setTimeout(r,500));await document.fonts.ready;
    await Promise.all([...sheet.querySelectorAll('img')].map(img=>img.decode().catch(()=>{})));
    return sheet;
  }catch(error){sheet.remove();throw error;}
}
async function exportNote(type) {
  if(!current()||busyExport)return;
  busyExport=true;let sheet;
  try{
    const name=filename($('title').value||current().title);
    if(type==='md'){await exportFolder(current());return;}
    toast('正在生成导出文件…');sheet=await renderedSheet();
    if(type==='html'){
      for(const canvas of sheet.querySelectorAll('canvas')){const img=document.createElement('img');img.src=canvas.toDataURL();img.style.cssText=canvas.style.cssText;canvas.replaceWith(img);}
      let css='';
      for(const path of ['./vendor/vditor/dist/index.css','./vendor/vditor/dist/css/content-theme/light.css','./vendor/vditor/dist/js/katex/katex.min.css']){
        const url=new URL(path,location.href);let value=await(await fetch(url)).text();
        const refs=[...new Set([...value.matchAll(/url\(["']?([^)'"\s]+)["']?\)/g)].map(m=>m[1]))];
        for(const ref of refs){if(ref.startsWith('data:'))continue;const data=await dataURL(await(await fetch(new URL(ref,url))).blob());value=value.split(ref).join(data);}css+=value;
      }
      const page=document.implementation.createHTMLDocument($('title').value);page.documentElement.lang='zh-CN';
      const meta=page.createElement('meta');meta.setAttribute('charset','utf-8');page.head.prepend(meta);
      const style=page.createElement('style');style.textContent=css+'body{max-width:900px;margin:40px auto;padding:24px;background:white;color:#25262b}';page.head.append(style);
      const article=page.createElement('article');article.className='vditor-reset';article.innerHTML=sheet.innerHTML;page.body.append(article);
      page.querySelectorAll('script,iframe,object,embed').forEach(el=>el.remove());
      download(new Blob(['<!doctype html>\n'+page.documentElement.outerHTML],{type:'text/html;charset=utf-8'}),name+'.html');
    }else{
      const height=sheet.scrollHeight;if(height>24000)throw new Error('文档过长，请使用 HTML 或 Markdown 导出');
      const canvas=await html2canvas(sheet,{backgroundColor:'#ffffff',scale:1.5,logging:false,windowWidth:1100});
      if(type==='png')await new Promise((resolve,reject)=>canvas.toBlob(blob=>{if(!blob){reject(new Error('图像生成失败'));return;}download(blob,name+'.png');resolve();},'image/png'));
      else{
        const pdf=new jspdf.jsPDF({unit:'mm',format:'a4'}), pageHeight=Math.floor(canvas.width*277/190);
        for(let top=0;top<canvas.height;top+=pageHeight){if(top)pdf.addPage();const part=document.createElement('canvas');part.width=canvas.width;part.height=Math.min(pageHeight,canvas.height-top);part.getContext('2d').drawImage(canvas,0,top,canvas.width,part.height,0,0,canvas.width,part.height);pdf.addImage(part.toDataURL('image/png'),'PNG',10,10,190,part.height*190/canvas.width);}
        download(pdf.output('blob'),name+'.pdf');
      }
    }
    toast('导出文件已生成');
  }catch(error){toast('导出失败：'+error.message);}finally{sheet?.remove();busyExport=false;}
}
const chartTemplates={mermaid:'graph LR\n  A[开始] --> B{需要继续吗?}\n  B -->|是| C[执行任务]\n  B -->|否| D[完成]\n  C --> D',bar:JSON.stringify({tooltip:{},xAxis:{type:'category',data:['周一','周二','周三','周四','周五','周六','周日']},yAxis:{type:'value'},series:[{type:'bar',data:[120,200,150,80,70,110,130],itemStyle:{color:'#6675df'}}]},null,2),line:JSON.stringify({tooltip:{trigger:'axis'},xAxis:{type:'category',data:['一月','二月','三月','四月','五月']},yAxis:{type:'value'},series:[{type:'line',smooth:true,data:[30,55,48,80,120]}]},null,2),pie:JSON.stringify({tooltip:{trigger:'item'},series:[{type:'pie',radius:['40%','70%'],data:[{name:'学习',value:35},{name:'工作',value:45},{name:'生活',value:20}]}]},null,2)};
async function buildEditor(value='') {
  const generation=++editorGeneration; ready=false;loading=true;editor?.destroy();
  document.querySelectorAll('[data-mode]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.mode===mode)));
  return new Promise(resolve=>{
    editor=new Vditor('editor',{cdn,lang:'zh_CN',mode,value,theme:theme==='dark'?'dark':'classic',height:'100%',cache:{enable:false},placeholder:'从这里开始记录…',
      toolbar:['headings','bold','italic','strike','|','list','ordered-list','check','quote','|','code','inline-code','table','link','upload','|','undo','redo','outline'],
      toolbarConfig:{pin:true},outline:{enable:false},tab:'  ',counter:{enable:false},
      preview:{delay:150,maxWidth:860,mode:'both',markdown:{sanitize:true,mark:true},math:{engine:'KaTeX'},hljs:{style:theme==='dark'?'native':'github'},theme:{current:theme,path:cdn+'/dist/css/content-theme'},actions:[]},
      upload:{accept:'image/png,image/jpeg,image/gif,image/webp',max:8*1024*1024,handler:uploadImages},
      input:markDirty,blur:()=>save(),
      after:()=>{if(generation!==editorGeneration)return;ready=true;loading=false;updateWords();resolve();}
    });
  });
}
async function setMode(next) {if(!ready||loading||!save())return;const value=editor.getValue();mode=next;await buildEditor(value);}
async function setTheme(next){try{api.dbStorage.setItem('markdown-theme',next);theme=next;document.documentElement.dataset.theme=theme;editor?.setTheme(theme==='dark'?'dark':'classic',theme,theme==='dark'?'native':'github',cdn+'/dist/css/content-theme');}catch(error){toast('主题设置未保存：'+error.message);}}
function bind() {
  $('title').oninput=markDirty;$('search').oninput=renderTree;
  $('new-note').onclick=()=>create('note');$('empty-create').onclick=()=>create('note');$('new-folder').onclick=()=>create('folder');
  $('toggle-sidebar').onclick=()=>document.body.classList.toggle('sidebar-hidden');
  $('collapse').onclick=()=>{expanded.clear();renderTree();};$('help').onclick=()=>$('help-dialog').showModal();
  $('theme').onclick=()=>setTheme(theme==='dark'?'light':'dark');
  $('outline-toggle').onclick=()=>$('editor').querySelector('[data-type="outline"]')?.click();
  $('chart').onclick=()=>{if(current())$('chart-dialog').showModal();};
  document.querySelectorAll('[data-chart]').forEach(b=>b.onclick=()=>{const type=b.dataset.chart;$('chart-dialog').close();editor.focus();editor.insertValue('\n```'+(type==='mermaid'?'mermaid':'echarts')+'\n'+chartTemplates[type]+'\n```\n');markDirty();});
  document.querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>setMode(b.dataset.mode));
  const exports=[['Markdown 文件 · .md',()=>exportNote('md')],['HTML 文件 · .html',()=>exportNote('html')],['PDF 文件 · .pdf',()=>exportNote('pdf')],['图像文件 · .png',()=>exportNote('png')]];
  $('export').onclick=()=>anchorMenu($('export'),exports);
  $('more').onclick=()=>anchorMenu($('more'),[['重命名笔记',()=>current()&&rename(current())],['显示 / 隐藏编辑工具栏',()=>document.body.classList.toggle('toolbar-hidden')],['通过启动器打开笔记',()=>toast('在插件详情启用搜索栏推送后，输入「笔记 关键词」快速打开。')],['独立窗口',()=>toast('当前 WTools 尚未提供插件独立多窗口接口。')],['清理未引用图片',cleanupImages],null,...exports,null,['删除笔记',()=>current()&&remove(current()),'danger']]);
  $('import').onclick=()=>$('files').click();
  $('files').onchange=async()=>{
    if(!save())return;
    try{let last;for(const file of $('files').files){if(file.size>4*1024*1024)throw new Error('单个 Markdown 文件不能超过 4 MiB');const body=await file.text();const row={_id:PREFIX+crypto.randomUUID(),kind:'note',title:file.name.replace(/\.(md|markdown|txt)$/i,''),body,parent:folderContext,order:Date.now(),updatedAt:Date.now()};put(row);rows.push(row);last=row._id;}if(folderContext)expanded.add(folderContext);renderTree();if(last)await select(last);toast('导入完成');}catch(error){fail(error);}finally{$('files').value='';}
  };
  $('tree').ondragover=e=>e.preventDefault();$('tree').ondrop=e=>{e.preventDefault();move(dragged,null,false);};
  document.addEventListener('pointerdown',e=>{if(!$('menu').contains(e.target)&&!e.target.closest('#more,#export'))$('menu').hidden=true;});
  document.addEventListener('keydown',e=>{
    const mod=e.ctrlKey||e.metaKey;
    if(e.key==='Escape'){$('menu').hidden=true;return;}
    if(!$('menu').hidden&&['ArrowUp','ArrowDown','Home','End'].includes(e.key)){
      e.preventDefault();const buttons=[...$('menu').querySelectorAll('button')],i=buttons.indexOf(document.activeElement);
      buttons[e.key==='Home'?0:e.key==='End'?buttons.length-1:(i+(e.key==='ArrowUp'?-1:1)+buttons.length)%buttons.length]?.focus();return;
    }
    if(document.querySelector('dialog[open]'))return;
    if(mod&&e.key.toLowerCase()==='f'){e.preventDefault();$('search').focus();$('search').select();}
    else if(mod&&e.key.toLowerCase()==='s'){e.preventDefault();save();}
    else if(mod&&e.key.toLowerCase()==='n'){e.preventDefault();create('note');}
    else if(e.ctrlKey&&e.altKey&&e.code==='Slash'){e.preventDefault();setMode(mode==='sv'?'wysiwyg':'sv');}
    else if(!mod&&!e.target.closest('input,textarea,[contenteditable=true]')&&['ArrowUp','ArrowDown','Tab','Enter'].includes(e.key)){
      const visible=[...$('tree').querySelectorAll('.tree-row')].filter(b=>rows.find(r=>r._id===b.dataset.id)?.kind==='note');
      if(e.key==='Enter'){e.preventDefault();editor?.focus();return;}
      if(!visible.length)return;e.preventDefault();const index=visible.findIndex(b=>b.dataset.id===selected),delta=e.key==='ArrowUp'||e.shiftKey?-1:1,next=visible[(index+delta+visible.length)%visible.length];select(next.dataset.id).then(()=>{$('tree').querySelector(`[data-id="${next.dataset.id}"]`)?.focus();});
    }
  });
  $('editor').addEventListener('click',e=>{const a=e.target.closest('a');if(a){e.preventDefault();if(e.ctrlKey||e.metaKey)toast('当前宿主未开放外部链接启动接口。请右击复制链接。');}},true);
  $('editor').addEventListener('contextmenu',e=>{const a=e.target.closest('a');if(!a)return;e.preventDefault();popup([['复制链接地址',async()=>{if(!await api.copyText(a.getAttribute('href')||''))throw new Error('链接复制失败');toast('已复制链接地址');}]],e.clientX,e.clientY);});
  window.addEventListener('beforeunload',e=>{if(!save()){e.preventDefault();e.returnValue='笔记尚未保存';}});
  window.addEventListener('storage',()=>{if(!dirty&&!loading){rows=api.db.allDocs(PREFIX);renderTree();if(current())select(selected);}});
}
async function init(){
  if(!api?.db || !api?.dbStorage){status('需要 WTools 宿主',true);$('storage-label').textContent='请在 WTools 中注册或安装此插件';document.querySelectorAll('button,input').forEach(el=>el.disabled=true);return;}
  try{
    rows=api.db.allDocs(PREFIX);theme=api.dbStorage.getItem('markdown-theme')||(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');document.documentElement.dataset.theme=theme;
    if(!api.dbStorage.getItem('markdown-initialized')){
      const body=await(await fetch('./welcome.md')).text();const row={_id:PREFIX+'welcome',kind:'note',title:'欢迎使用 Markdown 笔记',body,parent:null,order:0,updatedAt:Date.now()};
      if(!rows.length){put(row);rows.push(row);}api.dbStorage.setItem('markdown-initialized',true);
    }
    bind();await buildEditor();renderTree();await select(rows.find(r=>r.kind==='note')?._id);
    api.onPluginEnter(entry=>{if(entry.option?.id)select(entry.option.id);});
    api.onMainPush(({payload})=>{
      const q=String(payload||'').replace(/^(Markdown 笔记|笔记)\s*/i,'').trim().toLocaleLowerCase();
      return api.db.allDocs(PREFIX).filter(r=>r.kind==='note'&&(!q||(r.title+'\n'+r.body).toLocaleLowerCase().includes(q))).slice(0,12).map(r=>({id:r._id,text:r.title,title:'打开 Markdown 笔记'}));
    },()=>true);
  }catch(error){status('初始化失败',true);toast('无法读取 WTools 数据库：'+error.message);}
}
init();
