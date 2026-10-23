(()=>{
  const DB_NAME='forward-learning-library',DB_VERSION=1,STORE='materials',MAX_PDF_PAGES=10,MAX_FILE_BYTES=40*1024*1024;
  let dbPromise,query='';
  const root=document.getElementById('materials');
  if(!root)return;
  const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const uid=()=>crypto.randomUUID?.()||`${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const toast=message=>{const target=document.getElementById('toast');if(!target)return;target.textContent=message;target.classList.add('show');setTimeout(()=>target.classList.remove('show'),2600)};
  const request=req=>new Promise((resolve,reject)=>{req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error)});
  function db(){return dbPromise||(dbPromise=new Promise((resolve,reject)=>{const req=indexedDB.open(DB_NAME,DB_VERSION);req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains(STORE)){const store=req.result.createObjectStore(STORE,{keyPath:'id'});store.createIndex('createdAt','createdAt')}};req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error)}))}
  async function transact(mode,callback){const database=await db(),tx=database.transaction(STORE,mode),value=await callback(tx.objectStore(STORE));await new Promise((resolve,reject)=>{tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error)});return value}
  const all=()=>transact('readonly',store=>request(store.getAll())).then(items=>items.sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt))));
  const get=id=>transact('readonly',store=>request(store.get(id)));
  const put=item=>transact('readwrite',store=>request(store.put(item)));
  const remove=id=>transact('readwrite',store=>request(store.delete(id)));
  const formatBytes=bytes=>bytes>=1048576?`${(bytes/1048576).toFixed(1)} MB`:`${Math.max(1,Math.round(bytes/1024))} KB`;
  async function pdfPageCount(file){const lib=await import('/vendor/pdfjs/pdf.min.mjs');lib.GlobalWorkerOptions.workerSrc='/vendor/pdfjs/pdf.worker.min.mjs';const document=await lib.getDocument({data:new Uint8Array(await file.arrayBuffer())}).promise;return document.numPages}
  async function inspectFile(file){
    if(file.size>MAX_FILE_BYTES)throw new Error('单个资料不能超过 40 MB');
    const lower=file.name.toLowerCase(),isPdf=file.type==='application/pdf'||lower.endsWith('.pdf'),isImage=file.type.startsWith('image/'),isText=file.type.startsWith('text/')||/\.(txt|md)$/i.test(lower);
    if(!isPdf&&!isImage&&!isText)throw new Error('目前支持 PDF、图片、TXT 和 Markdown');
    let pageCount=1,text='';
    if(isPdf){pageCount=await pdfPageCount(file);if(pageCount>MAX_PDF_PAGES)throw new Error(`“${file.name}”共 ${pageCount} 页；为保证识别质量，单份 PDF 最多 10 页`)}
    if(isText)text=(await file.text()).slice(0,100000);
    return{id:uid(),version:1,name:file.name.slice(0,160),kind:isPdf?'pdf':isImage?'image':'text',mimeType:file.type||'application/octet-stream',size:file.size,pageCount,text,blob:file,createdAt:new Date().toISOString(),tags:[],status:'ready'}
  }
  async function addFiles(files){for(const file of files){try{toast(`正在检查 ${file.name}…`);await put(await inspectFile(file))}catch(error){toast(error.message);continue}}await render()}
  function renderShell(){root.innerHTML=`
    <div class="library-hero"><div><span class="eyebrow">PERSONAL LEARNING LIBRARY</span><h2>资料驱动的个性化课堂</h2><p>把教材、笔记和题目保存在本机。选择资料后进入批注板，再由 AI 围绕你的材料讲解。</p></div><label class="primary library-upload">＋ 添加资料<input id="materialInput" type="file" multiple accept="application/pdf,image/*,.txt,.md,text/plain,text/markdown"></label></div>
    <div class="library-privacy"><span>🔒</span><div><b>默认只存本机</b><p>资料保存在浏览器 IndexedDB；不会自动上传。单份 PDF 最多 10 页，只有你主动开始 AI 课堂时，当前选中的页面才会发送给代理。</p></div></div>
    <div class="library-toolbar card"><input id="materialSearch" type="search" placeholder="搜索教材、笔记或题目"><span id="materialCount">0 份资料</span></div>
    <div id="materialGrid" class="material-grid"></div>`;
    root.querySelector('#materialInput').onchange=event=>{addFiles([...event.target.files]);event.target.value=''};
    root.querySelector('#materialSearch').oninput=event=>{query=event.target.value.trim().toLowerCase();renderCards()};
    root.querySelector('#materialGrid').onclick=handleAction;
  }
  async function renderCards(){const items=await all(),visible=items.filter(item=>!query||`${item.name} ${(item.tags||[]).join(' ')}`.toLowerCase().includes(query));root.querySelector('#materialCount').textContent=`${items.length} 份资料 · ${items.reduce((sum,item)=>sum+(item.size||0),0)>=1048576?(items.reduce((sum,item)=>sum+(item.size||0),0)/1048576).toFixed(1)+' MB':'本机保存'}`;root.querySelector('#materialGrid').innerHTML=visible.map(item=>`<article class="material-card card"><div class="material-icon ${item.kind}">${item.kind==='pdf'?'PDF':item.kind==='image'?'图':'文'}</div><div class="material-main"><small>${item.kind==='pdf'?`${item.pageCount} 页 PDF`:item.kind==='image'?'图片资料':'文字笔记'} · ${formatBytes(item.size||0)}</small><h3>${esc(item.name)}</h3><p>${item.kind==='text'?esc(item.text.slice(0,90)):'打开后可选择页面并进入本地批注板。'}</p></div><div class="material-actions"><button class="primary" data-material-use="${esc(item.id)}">用于课堂</button><button class="ghost" data-material-delete="${esc(item.id)}">删除</button></div></article>`).join('')||'<div class="card material-empty"><b>资料库还是空的</b><p>添加不超过 10 页的 PDF、图片或文字笔记，建立你的个人学习资料库。</p></div>'}
  async function render(){if(!root.querySelector('.library-hero'))renderShell();await renderCards()}
  async function useMaterial(id){const item=await get(id);if(!item)return;try{const lessonContext=`本次课堂以用户资料“${item.name}”为依据。讲解时区分资料原文与补充推理，不确定时明确说明。${item.kind==='text'?`\n${item.text.slice(0,4000)}`:''}`;if(item.kind==='text')await window.LocalWhiteboard.createTextMaterialPage(item.name,item.text);else{const file=new File([item.blob],item.name,{type:item.mimeType,lastModified:Date.now()});await window.LocalWhiteboard.importFiles([file])}const context=document.getElementById('kimiContext');if(context)context.value=lessonContext;localStorage.setItem('forward-classroom-material-v1',JSON.stringify({id:item.id,name:item.name,kind:item.kind,selectedAt:new Date().toISOString()}));location.hash='#classroom';window.ClassroomWorkspace?.openBoard();const started=await window.VoiceClassroom?.start({context:lessonContext});if(!started)toast('资料已进入课堂中心；连接或解锁 Kimi 后即可开始真实 AI 课堂')}catch(error){toast(error.message||'资料打开失败')}}
  async function handleAction(event){const use=event.target.closest('[data-material-use]'),del=event.target.closest('[data-material-delete]');if(use)return useMaterial(use.dataset.materialUse);if(del&&confirm('从本机资料库删除这份资料？课堂档案不会被删除。')){await remove(del.dataset.materialDelete);renderCards();toast('资料已从本机删除')}}
  window.LearningLibrary={all,get,useMaterial,open:()=>{location.hash='#materials';render()}};
  render().catch(error=>{root.innerHTML=`<div class="card material-empty"><b>资料库无法打开</b><p>${esc(error.message)}</p></div>`});
})();
