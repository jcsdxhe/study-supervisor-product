const http=require('http');
const fs=require('fs');
const path=require('path');
const crypto=require('crypto');
const {cleanClassReview}=require('./review-protocol');

const root=__dirname;
loadEnv(path.join(root,'.env'));
const port=Number(process.env.PORT||4174);
const cloudMode=process.env.ALLOW_CLOUD_PROXY==='true';
const listenHost=cloudMode?'0.0.0.0':'127.0.0.1';
const accessToken=String(process.env.APP_ACCESS_TOKEN||'');
const signingSecret=String(process.env.SESSION_SIGNING_SECRET||'');
const publicOrigin=String(process.env.PUBLIC_ORIGIN||process.env.RENDER_EXTERNAL_URL||'').replace(/\/$/,'');
const authTtlSeconds=clamp(process.env.AUTH_SESSION_HOURS,1,72,12)*60*60;
const apiKey=process.env.MOONSHOT_API_KEY||'';
const apiBase=(process.env.MOONSHOT_API_BASE||'https://api.moonshot.cn/v1').replace(/\/$/,'');
const defaultModel=process.env.KIMI_DEFAULT_MODEL==='kimi-k3'?'kimi-k3':'kimi-k2.6';
const sessionLimit=clamp(process.env.KIMI_SESSION_LIMIT,1,20,5);
const voiceTurnLimit=clamp(process.env.KIMI_VOICE_TURN_LIMIT,3,50,20);
const sessionUsage=new Map();
const tickets=new Map();
const voiceClasses=new Map();
const authFailures=new Map();
const ticketTtlMs=10*60*1000;
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.webmanifest':'application/manifest+json; charset=utf-8','.svg':'image/svg+xml','.ico':'image/x-icon'};

if(cloudMode){
  if(accessToken.length<24)throw new Error('云代理拒绝启动：APP_ACCESS_TOKEN 至少需要 24 个字符。');
  if(signingSecret.length<32)throw new Error('云代理拒绝启动：SESSION_SIGNING_SECRET 至少需要 32 个字符。');
  if(!apiKey)throw new Error('云代理拒绝启动：MOONSHOT_API_KEY 未配置。');
  if(!/^https:\/\/[^/]+$/i.test(publicOrigin))throw new Error('云代理拒绝启动：PUBLIC_ORIGIN/RENDER_EXTERNAL_URL 必须是 HTTPS 源站地址。');
}

function loadEnv(file){
  if(!fs.existsSync(file))return;
  for(const raw of fs.readFileSync(file,'utf8').split(/\r?\n/)){
    const line=raw.trim();if(!line||line.startsWith('#'))continue;
    const i=line.indexOf('=');if(i<1)continue;
    const key=line.slice(0,i).trim();let value=line.slice(i+1).trim();
    if((value.startsWith('"')&&value.endsWith('"'))||(value.startsWith("'")&&value.endsWith("'")))value=value.slice(1,-1);
    if(!Object.prototype.hasOwnProperty.call(process.env,key)||!String(process.env[key]||'').trim())process.env[key]=value;
  }
}
function clamp(v,min,max,fallback){v=Number(v);return Number.isFinite(v)?Math.max(min,Math.min(max,v)):fallback}
function safeEqual(a,b){const ah=crypto.createHash('sha256').update(String(a)).digest(),bh=crypto.createHash('sha256').update(String(b)).digest();return crypto.timingSafeEqual(ah,bh)}
function parseCookies(req){const out={};for(const part of String(req.headers.cookie||'').split(';')){const at=part.indexOf('=');if(at<1)continue;try{out[part.slice(0,at).trim()]=decodeURIComponent(part.slice(at+1).trim())}catch{}}return out}
function signSession(payload){return crypto.createHmac('sha256',signingSecret).update(payload).digest('base64url')}
function createAuthCookie(){const issued=Math.floor(Date.now()/1000),nonce=crypto.randomBytes(18).toString('base64url'),payload=`v1.${issued}.${nonce}`,value=`${payload}.${signSession(payload)}`;return{value,session:`cloud-${nonce}`}}
function verifyAuth(req){if(!cloudMode)return{session:null};const value=parseCookies(req).forward_cloud_session||'',parts=value.split('.');if(parts.length!==4||parts[0]!=='v1')return null;const issued=Number(parts[1]),payload=parts.slice(0,3).join('.'),sig=parts[3];if(!Number.isInteger(issued)||issued>Date.now()/1000+60||Date.now()/1000-issued>authTtlSeconds||!safeEqual(sig,signSession(payload)))return null;return{session:`cloud-${parts[2]}`}}
function authCookieHeader(value,maxAge=authTtlSeconds){return`forward_cloud_session=${encodeURIComponent(value)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`}
function requestIp(req){return String(req.headers['x-forwarded-for']||req.socket.remoteAddress||'unknown').split(',')[0].trim().slice(0,80)}
function loginAllowed(req){const key=requestIp(req),now=Date.now(),windowMs=15*60*1000,item=authFailures.get(key);if(!item||now-item.since>windowMs){authFailures.set(key,{since:now,count:1});return true}item.count++;return item.count<=10}
function clearLoginFailures(req){authFailures.delete(requestIp(req))}
function sameOrigin(req){if(!cloudMode)return true;return String(req.headers.origin||'')===publicOrigin}
function securityHeaders(res){res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Frame-Options','DENY');res.setHeader('Permissions-Policy','camera=(self), microphone=(self), display-capture=(self)');res.setHeader('Content-Security-Policy',"default-src 'self'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob:; font-src 'self' data:; connect-src 'self'; worker-src 'self' blob:");if(cloudMode)res.setHeader('Strict-Transport-Security','max-age=31536000; includeSubDomains')}
function cleanPlotEvent(raw){if(!raw||raw.type!=='function_plot')return null;const pair=(v,a,b)=>v==null?[a,b]:Array.isArray(v)&&v.length===2&&v.every(Number.isFinite)&&v[0]<v[1]&&v[1]-v[0]<=10000?v.map(Number):null,allowed=/^[\d\s.xpie+\-*/^()a-z]+$/i;let expressions=(Array.isArray(raw.expressions)?raw.expressions:[]).slice(0,4).map((e,i)=>({source:String(e?.source||'').slice(0,160),color:/^#[\da-f]{6}$/i.test(e?.color||'')?e.color:['#2979ff','#e85d4a','#18a06a','#8a55d7'][i]})).filter(e=>e.source&&allowed.test(e.source));if(!expressions.length)return null;let domain=pair(raw.domain,-5,5),range=pair(raw.range,-5,5),fill=null;if(!domain||!range)return null;if(raw.fill){if(!Number.isFinite(raw.fill.from)||!Number.isFinite(raw.fill.to)||raw.fill.from<domain[0]||raw.fill.to>domain[1]||raw.fill.from>=raw.fill.to)return null;let between=Array.isArray(raw.fill.between)?raw.fill.between.slice(0,2):[0,1];if(between.length!==2||!between.every(i=>Number.isInteger(i)&&i>=0&&i<expressions.length))return null;fill={from:raw.fill.from,to:raw.fill.to,between}}return{type:'function_plot',title:String(raw.title||'函数图像').slice(0,60),expressions,domain,range,fill}}
function cleanMotionEvent(raw){
  if(!raw||!['kinematics','projectile','incline'].includes(raw.type))return null;
  const duration=Number(raw.duration),bounded=(values,limit=10000)=>values.every(Number.isFinite)&&Math.max(...values.map(Math.abs))<=limit;
  if(!Number.isFinite(duration)||duration<=0||duration>60)return null;
  if(raw.type==='kinematics'){const x0=Number(raw.x0||0),v0=Number(raw.v0||0),a=Number(raw.a||0);if(!bounded([x0,v0,a]))return null;return{type:raw.type,title:String(raw.title||'匀加速直线运动').slice(0,60),duration,x0,v0,a}}
  if(raw.type==='projectile'){const x0=Number(raw.x0||0),y0=Number(raw.y0||0),vx0=Number(raw.vx0||0),vy0=Number(raw.vy0||0),ax=Number(raw.ax||0),ay=Number(raw.ay??-9.8);if(!bounded([x0,y0,vx0,vy0,ax,ay]))return null;return{type:raw.type,title:String(raw.title||'抛体运动').slice(0,60),duration,x0,y0,vx0,vy0,ax,ay}}
  const angle=Number(raw.angle),s0=Number(raw.s0||0),v0=Number(raw.v0||0),a=Number(raw.a||0);if(!bounded([s0,v0,a])||!Number.isFinite(angle)||angle<5||angle>80)return null;return{type:raw.type,title:String(raw.title||'斜面运动').slice(0,60),duration,angle,s0,v0,a};
}
function sendJSON(res,status,data){const body=JSON.stringify(data);res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Content-Length':Buffer.byteLength(body)});res.end(body)}
function sessionId(req){const auth=verifyAuth(req);if(cloudMode)return auth?.session||'unauthorized';const raw=String(req.headers['x-study-session']||'');return /^[a-zA-Z0-9_-]{12,80}$/.test(raw)?raw:'anonymous'}
function statusFor(req){const id=sessionId(req),used=sessionUsage.get(id)||0;return{configured:Boolean(apiKey),cloudMode,defaultModel,availableModels:['kimi-k2.6','kimi-k3'],sessionLimit,voiceTurnLimit,used,remaining:Math.max(0,sessionLimit-used),privacy:cloudMode?'题图仅在用户主动请求后发送到受口令保护的同源云代理；不持久化题图、录音或学习数据，Kimi 密钥不会发送到浏览器。':'题目图像仅在用户点击请求后经本机代理发送给 Kimi API；密钥不会发送到浏览器。'}}
function readJSON(req,max=16*1024*1024){return new Promise((resolve,reject)=>{let size=0,chunks=[];req.on('data',c=>{size+=c.length;if(size>max){reject(Object.assign(new Error('请求体过大'),{code:413}));req.destroy()}else chunks.push(c)});req.on('end',()=>{try{resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')))}catch{reject(Object.assign(new Error('JSON 格式错误'),{code:400}))}});req.on('error',reject)})}
function validateInput(body){
  if(!body||typeof body!=='object')throw Object.assign(new Error('请求内容无效'),{code:400});
  const question=String(body.question||'').trim();if(!question||question.length>1200)throw Object.assign(new Error('问题需要 1—1200 个字符'),{code:400});
  const image=String(body.image||'');if(!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(image)||image.length>15*1024*1024)throw Object.assign(new Error('仅支持不超过约 15MB 的 PNG/JPEG/WEBP 当前画布'),{code:400});
  const model=body.model==='kimi-k3'?'kimi-k3':'kimi-k2.6',detail=body.detail===true,context=String(body.context||'').trim().slice(0,600);return{question,image,model,detail,context};
}
function cleanSuggestions(items){
  if(!Array.isArray(items))return[];
  return items.slice(0,8).map(x=>{if(!x||!['circle','rect','arrow','text'].includes(x.type))return null;const out={type:x.type,color:/^#[0-9a-fA-F]{6}$/.test(x.color||'')?x.color:'#2d6cdf'};for(const k of ['x1','y1','x2','y2'])out[k]=clamp(x[k],0,1000,500);if(x.type==='text')out.text=String(x.text||'').slice(0,80);out.reason=String(x.reason||'').slice(0,160);return out}).filter(Boolean);
}
function cleanAssessment(x){
  if(!x||typeof x!=='object')return{clarity:'unclear',difficulty:'advanced',confidence:'low',imageDependence:'high',reason:'能力自检未返回有效结构，已安全停止讲解。请重试一次或换更清晰的原题图。'};
  const pick=(v,allowed,fallback)=>allowed.includes(v)?v:fallback;
  return{clarity:pick(x.clarity,['clear','unclear'],'unclear'),difficulty:pick(x.difficulty,['basic','intermediate','advanced'],'advanced'),confidence:pick(x.confidence,['high','medium','low'],'low'),imageDependence:pick(x.imageDependence,['low','medium','high'],'high'),reason:String(x.reason||'未提供判断理由').slice(0,300)};
}
function extractJson(text){
  const clean=String(text||'').trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'').trim();
  try{return JSON.parse(clean)}catch{}
  const start=clean.indexOf('{'),end=clean.lastIndexOf('}');
  if(start>=0&&end>start)return JSON.parse(clean.slice(start,end+1));
  throw new Error('模型没有返回有效 JSON');
}
function apiError(res,status,remaining,detail=''){return sendJSON(res,status>=500?502:status,{error:'Kimi API 请求失败。请检查本机密钥、余额、模型权限或稍后重试。',code:'KIMI_UPSTREAM_ERROR',upstreamStatus:status,detail:String(detail).slice(0,500),remaining})}
function purgeTickets(){const now=Date.now();for(const [id,t] of tickets)if(t.expires<now)tickets.delete(id)}
function validateVoiceStart(body){
  if(!body||typeof body!=='object')throw Object.assign(new Error('请求内容无效'),{code:400});
  const image=String(body.image||'');if(!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(image)||image.length>15*1024*1024)throw Object.assign(new Error('请先导入清晰题目图片'),{code:400});
  return{image,model:body.model==='kimi-k3'?'kimi-k3':'kimi-k2.6',context:String(body.context||'').trim().slice(0,6000)};
}
function purgeVoiceClasses(){const now=Date.now();for(const [id,item] of voiceClasses)if(item.expires<now)voiceClasses.delete(id)}

async function startVoiceClass(req,res){
  if(!apiKey)return sendJSON(res,503,{error:'Kimi 尚未配置。请先在本机 .env 配置密钥。',code:'KIMI_NOT_CONFIGURED'});
  try{
    const input=validateVoiceStart(await readJSON(req));
    const system='你是中文网课老师的快速读题助手。准确读取图片中的完整题干、公式、选项和图形，为后续连续语音问答建立文字与位置上下文；此步不要解题。只输出简洁 JSON：problem（完整题目转写）、concepts（知识点数组）、anchors（关键区域数组，每项含 id、label、x1、y1、x2、y2，坐标相对整图 0-1000；覆盖题干公式、各小问或选项，最多12项）、clarity（clear/unclear）、confidence（high/medium/low）。公式使用普通 Unicode 或可直接朗读的中文，不要 Markdown。看不清的内容必须标为不确定，禁止猜测。';
    const text=`为实时语音课堂准备这道题。${input.context?`补充说明：${input.context}`:''}`;
    const upstream=await fetch(`${apiBase}/chat/completions`,{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${apiKey}`},body:JSON.stringify({model:input.model,messages:[{role:'system',content:system},{role:'user',content:[{type:'image_url',image_url:{url:input.image}},{type:'text',text}]}],response_format:{type:'json_object'},stream:false,max_tokens:1000,...(input.model==='kimi-k2.6'?{thinking:{type:'disabled'}}:{reasoning_effort:'low'})})});
    if(!upstream.ok)return apiError(res,upstream.status,voiceTurnLimit,await upstream.text());
    const data=await upstream.json(),message=data?.choices?.[0]?.message||{};let lesson;
    try{lesson=extractJson(message.content||message.reasoning_content)}catch{return sendJSON(res,502,{error:'Kimi 没有完成题目备课，请换更清晰的题目图。',code:'VOICE_PREP_FAILED'})}
    lesson.anchors=(Array.isArray(lesson.anchors)?lesson.anchors:[]).slice(0,12).map((a,i)=>({id:String(a.id||`area_${i+1}`).replace(/[^a-zA-Z0-9_-]/g,'').slice(0,40),label:String(a.label||'题目区域').slice(0,80),x1:clamp(a.x1,0,1000,0),y1:clamp(a.y1,0,1000,0),x2:clamp(a.x2,0,1000,1000),y2:clamp(a.y2,0,1000,1000)}));
    purgeVoiceClasses();const classId=crypto.randomBytes(24).toString('base64url');voiceClasses.set(classId,{owner:sessionId(req),model:input.model,lesson,context:input.context,history:[],turns:0,expires:Date.now()+45*60*1000});
    const greeting=lesson.clarity==='unclear'?'这张题目有部分内容看不清。你可以告诉我缺失条件，或者换一张更清晰的图片。':'题目我已经看清并备好课了。你可以直接问我哪里不会，也可以说“从头完整讲一遍”。';
    return sendJSON(res,200,{classId,greeting,problem:String(lesson.problem||'').slice(0,6000),clarity:lesson.clarity||'unclear',confidence:lesson.confidence||'low',voiceTurnLimit,model:data.model||input.model});
  }catch(e){return sendJSON(res,e.code||500,{error:e.code?e.message:'语音课堂准备失败。',code:'VOICE_PREP_ERROR'})}
}

async function voiceTurn(req,res){
  if(!apiKey)return sendJSON(res,503,{error:'Kimi 尚未配置。',code:'KIMI_NOT_CONFIGURED'});
  try{
    const body=await readJSON(req,6*1024*1024),classId=String(body?.classId||''),text=String(body?.text||'').trim().slice(0,1000),referenceImage=String(body?.referenceImage||''),referencePageName=String(body?.referencePageName||'用户批注页').slice(0,80);purgeVoiceClasses();const item=voiceClasses.get(classId);
    if(!item||item.owner!==sessionId(req))return sendJSON(res,400,{error:'语音课堂已结束，请重新开始。',code:'VOICE_CLASS_EXPIRED'});
    if(!text)return sendJSON(res,400,{error:'没有识别到可发送的问题。',code:'EMPTY_TRANSCRIPT'});
    if(referenceImage&&(!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(referenceImage)||referenceImage.length>5*1024*1024))return sendJSON(res,400,{error:'课堂批注图仅支持不超过约 5MB 的 PNG/JPEG/WEBP。',code:'INVALID_CLASSROOM_REFERENCE'});
    if(item.turns>=voiceTurnLimit)return sendJSON(res,429,{error:`本节语音课堂已达到 ${voiceTurnLimit} 轮上限。`,code:'VOICE_TURN_LIMIT'});
    item.turns++;item.expires=Date.now()+45*60*1000;
    const system='你是一位在实时网课中与学生一对一交流、会边讲边指和写板书的中文老师。根据备课材料准确回答。若本轮附带“用户主动批注页”，图中的红圈、箭头或笔迹是学生主动标记；当学生说“红圈处”等指代时，必须结合该图解释。学生要求完整讲解时必须完整分步讲，不要只给提示。你的输出必须是 JSONL：每行一个完整 JSON，不能有代码围栏或其他文字。为了尽快开口，第一行必须先输出一句简短、只做导入且不引用尚未显示图像的 say，再继续讲解。可用事件：1）{"type":"say","text":"适合自然朗读的一至两句话"}；2）{"type":"mark","anchor":"备课材料中的区域id","style":"highlight或circle或rect或arrow","color":"#十六进制颜色"}；3）{"type":"board","title":"板书标题","newPage":false,"items":[{"text":"一条完整公式或一步推导","color":"#颜色"}]}；4）积分或函数题用 {"type":"plot","spec":{"type":"function_plot","title":"标题","expressions":[{"source":"x^2","color":"#2979ff"}],"domain":[-2,2],"range":[-1,4],"fill":{"from":0,"to":2,"between":[0,1]}}}；5）物理动画用 motion，安全类型为：直线运动 kinematics（duration,x0,v0,a），抛体 projectile（duration,x0,y0,vx0,vy0,ax,ay），斜面 incline（duration,angle,s0,v0,a）。示例：{"type":"motion","spec":{"type":"projectile","title":"平抛运动","duration":3,"x0":0,"y0":10,"vx0":4,"vy0":0,"ax":0,"ay":-9.8}}。板书 items 必须按讲解顺序给出，每项只写一个公式或一步推导，不得自行安排坐标、重复前文或把多步挤在同一项；版面由客户端自动排版，空间不足会自动续页。表达式只用 x、数字、pi、e、sin/cos/tan/abs/sqrt/exp/ln/log 和基本运算，不得输出代码。学生明确要求画函数图像时，只要可由上述表达式表示，就必须输出 plot；明确要求物理动图时，只要属于三种安全情景，就必须输出 motion。无法表示时必须在 say 中说明限制，不能假装已经画出。按真实上课顺序交替输出事件；需要讲解某个标记、板书或图像时，必须先输出对应的 mark、board、plot 或 motion 事件，紧接着再输出说明它的 say，让客户端在该句开始朗读时切换到对应页面。say 禁止 Markdown、LaTeX、星号、JSON术语；公式改写成适合中文语音朗读的表达。';
    const recent=item.history.slice(-6),messages=[{role:'system',content:system},{role:'user',content:`本节课备课材料：${JSON.stringify(item.lesson)}${item.context?`\n课堂方案与角色要求：${item.context}`:''}`}];for(const h of recent)messages.push(h);messages.push({role:'user',content:referenceImage?[{type:'image_url',image_url:{url:referenceImage}},{type:'text',text:`用户主动批注页“${referencePageName}”。本轮问题：${text}`}]:text});
    const upstream=await fetch(`${apiBase}/chat/completions`,{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${apiKey}`},body:JSON.stringify({model:item.model,messages,stream:true,stream_options:{include_usage:true},max_tokens:1800,...(item.model==='kimi-k2.6'?{thinking:{type:'disabled'}}:{reasoning_effort:'low'})})});
    if(!upstream.ok)return apiError(res,upstream.status,Math.max(0,voiceTurnLimit-item.turns),await upstream.text());
    res.writeHead(200,{'Content-Type':'text/event-stream; charset=utf-8','Cache-Control':'no-store','Connection':'keep-alive','X-Accel-Buffering':'no'});const emit=(event,data)=>res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    const reader=upstream.body.getReader(),decoder=new TextDecoder();let buffer='',modelBuffer='',answer='',usage=null,returnedModel=item.model,first=true,finishReason='',parsedEvents=0,parseFailures=0,visualCount=0;
    const anchorMap=new Map((item.lesson.anchors||[]).map(a=>[a.id,a]));
    const processLine=line=>{line=String(line||'').trim().replace(/^```(?:jsonl?|ndjson)?/i,'').replace(/```$/,'').trim();if(!line)return;let event;try{event=JSON.parse(line)}catch{parseFailures++;return}if(event.type==='say'&&event.text){const spoken=String(event.text).slice(0,1400);answer+=(answer?'\n':'')+spoken;emit('delta',{text:spoken,first});first=false;parsedEvents++}else if(event.type==='mark'){const a=anchorMap.get(String(event.anchor||''));if(!a){parseFailures++;return}const style=['highlight','circle','rect','arrow'].includes(event.style)?event.style:'highlight',color=/^#[0-9a-fA-F]{6}$/.test(event.color||'')?event.color:'#ef6b5b';let mark={type:style,color,x1:a.x1,y1:a.y1,x2:a.x2,y2:a.y2,width:7};if(style==='arrow'){mark.x1=Math.max(0,a.x1-120);mark.y1=(a.y1+a.y2)/2;mark.x2=a.x1;mark.y2=(a.y1+a.y2)/2}emit('annotation',{target:'source',label:a.label,items:[mark]});parsedEvents++}else if(event.type==='board'&&Array.isArray(event.items)){const items=event.items.slice(0,8).map(x=>({type:'text',text:String(x.text||'').slice(0,180),color:/^#[0-9a-fA-F]{6}$/.test(x.color||'')?x.color:'#245d4d',width:7})).filter(x=>x.text);if(items.length){emit('board',{title:String(event.title||'老师板书').slice(0,60),newPage:event.newPage===true,items});parsedEvents++}else parseFailures++}else if(event.type==='plot'){const spec=cleanPlotEvent(event.spec);if(spec){emit('visual',{kind:'plot',spec});visualCount++;parsedEvents++}else parseFailures++}else if(event.type==='motion'){const spec=cleanMotionEvent(event.spec);if(spec){emit('visual',{kind:'motion',spec});visualCount++;parsedEvents++}else parseFailures++}else parseFailures++};
    const processModel=text=>{modelBuffer+=text;const lines=modelBuffer.split(/\r?\n/);modelBuffer=lines.pop()||'';for(const line of lines)processLine(line)};
    while(true){const {done,value}=await reader.read();if(done)break;buffer+=decoder.decode(value,{stream:true});const lines=buffer.split(/\r?\n/);buffer=lines.pop()||'';for(const line of lines){if(!line.startsWith('data:'))continue;const raw=line.slice(5).trim();if(!raw||raw==='[DONE]')continue;let chunk;try{chunk=JSON.parse(raw)}catch{parseFailures++;continue}returnedModel=chunk.model||returnedModel;if(chunk.usage)usage=chunk.usage;finishReason=chunk?.choices?.[0]?.finish_reason||finishReason;const delta=chunk?.choices?.[0]?.delta?.content||'';if(delta)processModel(delta)}}if(modelBuffer.trim())processLine(modelBuffer);
    item.history.push({role:'user',content:text},{role:'assistant',content:answer});if(item.history.length>12)item.history=item.history.slice(-12);
    const wantsVisual=/画|图像|图象|动图|动画|演示|再现|轨迹/.test(text);
    if(finishReason==='length')emit('error',{error:'这次讲解达到长度上限，后半段没有完整生成。请点“重试本题”继续，不会再无声停住。',code:'VOICE_TRUNCATED',retryable:true});
    else if(!answer||!parsedEvents)emit('error',{error:'这次课堂事件没有完整生成，请点“重试本题”。',code:'VOICE_PROTOCOL_ERROR',retryable:true});
    else{if(parseFailures)emit('notice',{message:'有一小段课堂内容格式不完整，已跳过；如讲解缺步可重试。',code:'VOICE_PARTIAL_PROTOCOL',retryable:true});if(wantsVisual&&!visualCount)emit('notice',{message:'老师这次没有生成可校验的图像或动画，请点“重试本题”再次要求画图。',code:'VOICE_VISUAL_MISSING',retryable:true});emit('done',{model:returnedModel,turn:item.turns,remaining:Math.max(0,voiceTurnLimit-item.turns),usage:usage?{totalTokens:usage.total_tokens}:null,finishReason:finishReason||'stop',visualCount,parseFailures});}res.end();
  }catch(e){if(res.headersSent){res.write(`event: error\ndata: ${JSON.stringify({error:'语音回答中断，请再说一遍。'})}\n\n`);return res.end()}return sendJSON(res,e.code||500,{error:e.code?e.message:'语音课堂请求失败。',code:'VOICE_TURN_ERROR'})}
}
async function endVoiceClass(req,res){try{const body=await readJSON(req,16*1024),id=String(body?.classId||''),item=voiceClasses.get(id);if(item&&item.owner===sessionId(req))voiceClasses.delete(id);return sendJSON(res,200,{ended:true})}catch{return sendJSON(res,200,{ended:true})}}

async function reviewVoiceClass(req,res){
  if(!apiKey)return sendJSON(res,503,{error:'Kimi 尚未配置，课堂文字记录仍已保存在本机。',code:'KIMI_NOT_CONFIGURED'});
  const id=sessionId(req),used=sessionUsage.get(id)||0;
  if(used>=sessionLimit)return sendJSON(res,429,{error:`本次浏览器会话已达到 ${sessionLimit} 次 AI 请求上限，课堂档案不受影响。`,code:'SESSION_LIMIT'});
  try{
    const body=await readJSON(req,128*1024);if(!body||typeof body!=='object')throw Object.assign(new Error('复盘请求无效'),{code:400});
    const problem=String(body.problem||'').trim().slice(0,6000),model=body.model==='kimi-k3'?'kimi-k3':'kimi-k2.6',rawOptions=body.options&&typeof body.options==='object'?body.options:{},options={summary:rawOptions.summary===true,homework:rawOptions.homework===true||rawOptions.answers===true,answers:rawOptions.answers===true};
    if(!options.summary&&!options.homework&&!options.answers)throw Object.assign(new Error('请至少选择一项复盘内容'),{code:400});
    if(!Array.isArray(body.transcript)||body.transcript.length>160)throw Object.assign(new Error('课堂文字记录格式无效'),{code:400});
    let total=0;const transcript=body.transcript.map(item=>{const role=item?.role==='student'?'student':item?.role==='teacher'?'teacher':'';const text=String(item?.text||'').trim().slice(0,5000);total+=text.length;if(!role||!text)throw Object.assign(new Error('课堂文字记录格式无效'),{code:400});return{role,text}});if(total>50000)throw Object.assign(new Error('课堂文字记录过长，请拆分复盘'),{code:400});
    sessionUsage.set(id,used+1);
    const system=`你是一位严谨、负责的中文老师，正在进行课后复盘。只依据题目和课堂文字记录判断，不能虚构学生表现。必须只输出一个 JSON 对象。用户选择：summary=${options.summary}，homework=${options.homework}，answers=${options.answers}。字段固定为 summary、homework、answers。summary 在未选择时为 null；选择时包含 overview、studentQuestions、weaknesses、nextProblemTypes、nextActions，其中后四项均为简短字符串数组。homework 未选择时为空数组；选择时给 3—5 道针对性新题，每项含 id、type、difficulty、question、objective，difficulty 只能是基础、进阶、挑战。answers 未选择时为空数组；选择时与作业 id 对应，每项含 homeworkId、answer、explanation。不要照抄原题，不要声称看到了文字记录之外的行为；证据不足的薄弱点应表述为“建议检查”。公式用清晰的普通文本或 Unicode。`;
    const user=`原题：${problem||'未保留题目转写'}\n课堂文字记录：\n${transcript.map(item=>`${item.role==='student'?'学生':'老师'}：${item.text}`).join('\n')}`;
    const upstream=await fetch(`${apiBase}/chat/completions`,{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${apiKey}`},body:JSON.stringify({model,messages:[{role:'system',content:system},{role:'user',content:user}],response_format:{type:'json_object'},stream:false,max_tokens:options.answers?3200:2200,...(model==='kimi-k2.6'?{thinking:{type:'disabled'}}:{reasoning_effort:'low'})}),signal:AbortSignal.timeout(90000)});
    if(!upstream.ok)return apiError(res,upstream.status,Math.max(0,sessionLimit-used-1),await upstream.text());
    const data=await upstream.json(),message=data?.choices?.[0]?.message||{},raw=extractJson(message.content||message.reasoning_content),review=cleanClassReview(raw,options),usage=data.usage?{promptTokens:data.usage.prompt_tokens,completionTokens:data.usage.completion_tokens,totalTokens:data.usage.total_tokens}:null;
    return sendJSON(res,200,{review,model:data.model||model,usage,remaining:Math.max(0,sessionLimit-used-1)});
  }catch(e){if(e.name==='TimeoutError')return sendJSON(res,504,{error:'Kimi 复盘等待超时，请稍后重试。',code:'REVIEW_TIMEOUT'});return sendJSON(res,e.code||500,{error:e.code?e.message:'课堂复盘生成失败。',code:'REVIEW_ERROR'})}
}

async function assess(req,res){
  if(!apiKey)return sendJSON(res,503,{error:'Kimi 尚未配置。请在本机 .env 中设置 MOONSHOT_API_KEY 后重启应用。',code:'KIMI_NOT_CONFIGURED'});
  const id=sessionId(req),used=sessionUsage.get(id)||0;
  if(used>=sessionLimit)return sendJSON(res,429,{error:`本次浏览器会话已达到 ${sessionLimit} 次提问上限。请刷新或稍后重新开始，并留意 API 消耗。`,code:'SESSION_LIMIT'});
  try{
    const input=validateInput(await readJSON(req));
    sessionUsage.set(id,used+1);
    const system='你是谨慎的中文学习辅导入口检查器。只检查用户图像中实际可见的题目，不要解题。必须只输出一个 JSON 对象，字段固定为 clarity、difficulty、confidence、imageDependence、reason。clarity 只能是 clear/unclear；difficulty 只能是 basic/intermediate/advanced；confidence 只能是 high/medium/low；imageDependence 只能是 low/medium/high。重要：题目以图片提交本身不等于图像依赖高；只有关键文字、公式、选项或图形确实模糊、缺失、被遮挡、歧义大时才判 high。若题干和选项清楚可读，应判 clarity=clear，并依据你对解法的实际把握评估 confidence。reason 用一句简短中文说明可读性和把握，不得虚构条件。';
    const userText=`用户想问：${input.question}${input.context?`\n补充上下文：${input.context}`:''}`;
    const upstream=await fetch(`${apiBase}/chat/completions`,{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${apiKey}`},body:JSON.stringify({model:input.model,messages:[{role:'system',content:system},{role:'user',content:[{type:'image_url',image_url:{url:input.image}},{type:'text',text:userText}]}],response_format:{type:'json_object'},stream:false,max_tokens:500,...(input.model==='kimi-k2.6'?{thinking:{type:'disabled'}}:{reasoning_effort:'low'})})});
    if(!upstream.ok)return apiError(res,upstream.status,Math.max(0,sessionLimit-used-1),await upstream.text());
    const data=await upstream.json(),message=data?.choices?.[0]?.message||{};
    const rawAssessment=typeof message.content==='string'&&message.content.trim()?message.content:message.reasoning_content;
    let assessment;try{assessment=cleanAssessment(extractJson(rawAssessment))}catch{assessment=cleanAssessment(null)}
    purgeTickets();const ticket=crypto.randomBytes(24).toString('base64url');tickets.set(ticket,{...input,session:id,assessment,expires:Date.now()+ticketTtlMs});
    const usage=data.usage?{promptTokens:data.usage.prompt_tokens,completionTokens:data.usage.completion_tokens,totalTokens:data.usage.total_tokens}:null;
    return sendJSON(res,200,{assessment,ticket,model:data.model||input.model,usage,remaining:Math.max(0,sessionLimit-used-1)});
  }catch(e){return sendJSON(res,e.code||500,{error:e.code?e.message:'本机代理处理能力自检失败。',code:'LOCAL_PROXY_ERROR'})}
}

async function explain(req,res){
  if(!apiKey)return sendJSON(res,503,{error:'Kimi 尚未配置。请在本机 .env 中设置 MOONSHOT_API_KEY 后重启应用。',code:'KIMI_NOT_CONFIGURED'});
  try{
    const body=await readJSON(req,64*1024),ticketId=String(body?.ticket||'');purgeTickets();const item=tickets.get(ticketId);
    if(!item||item.session!==sessionId(req))return sendJSON(res,400,{error:'讲解凭证已失效，请重新点击“讲这一题”。',code:'INVALID_TICKET'});
    tickets.delete(ticketId);
    const style=item.detail?'用户明确选择了详细讲解：可以分步骤解释，但仍须清楚、避免无关铺陈。':'默认快速教练模式，正文严格只给：一条“下一步”、一句短“原因”、一个“检查问题”。不要长篇推导，不直接泄露后续全部答案。';
    const system=`你是耐心、直接的中文学习教练。只根据题目中可辨认的内容讲解，禁止虚构题干、数字、图形关系或推导。${style} 若仍有局部不确定，明确指出要复核的位置，但尽最大努力给出可靠的下一步。直接输出给学生看的中文讲解。正文之后可选输出标记 <<<ANNOTATIONS_JSON>>> 和一个 JSON 数组；建议坐标为相对画布 0—1000，只允许 circle/rect/arrow/text。没有建议时输出空数组。`;
    const userText=`用户问题：${item.question}${item.context?`\n用户补充的选区/上下文：${item.context}`:''}\n能力自检：${JSON.stringify(item.assessment)}`;
    const upstream=await fetch(`${apiBase}/chat/completions`,{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${apiKey}`},body:JSON.stringify({model:item.model,messages:[{role:'system',content:system},{role:'user',content:[{type:'image_url',image_url:{url:item.image}},{type:'text',text:userText}]}],stream:true,stream_options:{include_usage:true},max_tokens:item.detail?1800:700,...(item.model==='kimi-k2.6'?{thinking:{type:'disabled'}}:{reasoning_effort:'low'})})});
    if(!upstream.ok)return apiError(res,upstream.status,Math.max(0,sessionLimit-(sessionUsage.get(item.session)||0)),await upstream.text());
    res.writeHead(200,{'Content-Type':'text/event-stream; charset=utf-8','Cache-Control':'no-store','Connection':'keep-alive','X-Accel-Buffering':'no'});
    const emit=(event,data)=>res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),marker='<<<ANNOTATIONS_JSON>>>';
    let buffer='',pending='',annotationText='',stage='tutoring',usage=null,returnedModel=item.model;
    const processText=text=>{if(stage==='annotations'){annotationText+=text;return}pending+=text;const at=pending.indexOf(marker);if(at>=0){const visible=pending.slice(0,at);if(visible)emit('delta',{text:visible});annotationText+=pending.slice(at+marker.length);pending='';stage='annotations'}else if(pending.length>marker.length){const visible=pending.slice(0,pending.length-marker.length);pending=pending.slice(-marker.length);if(visible)emit('delta',{text:visible})}};
    const reader=upstream.body.getReader(),decoder=new TextDecoder();
    while(true){const {done,value}=await reader.read();if(done)break;buffer+=decoder.decode(value,{stream:true});const lines=buffer.split(/\r?\n/);buffer=lines.pop()||'';for(const line of lines){if(!line.startsWith('data:'))continue;const raw=line.slice(5).trim();if(!raw||raw==='[DONE]')continue;let chunk;try{chunk=JSON.parse(raw)}catch{continue}returnedModel=chunk.model||returnedModel;if(chunk.usage)usage=chunk.usage;const text=chunk?.choices?.[0]?.delta?.content||'';if(text)processText(text)}}
    if(stage==='tutoring'&&pending)emit('delta',{text:pending});let suggestions=[];if(stage==='annotations'){try{suggestions=cleanSuggestions(JSON.parse(annotationText.trim().replace(/^```(?:json)?/,'').replace(/```$/,'').trim()))}catch{suggestions=[]}}
    emit('done',{assessment:item.assessment,suggestions,model:returnedModel,usage:usage?{promptTokens:usage.prompt_tokens,completionTokens:usage.completion_tokens,totalTokens:usage.total_tokens}:null,remaining:Math.max(0,sessionLimit-(sessionUsage.get(item.session)||0))});res.end();
  }catch(e){if(res.headersSent){res.write(`event: error\ndata: ${JSON.stringify({error:'流式响应中断，请重新点击“讲这一题”。'})}\n\n`);return res.end()}return sendJSON(res,e.code||500,{error:e.code?e.message:'本机代理处理讲解失败。',code:'LOCAL_PROXY_ERROR'})}
}

const server=http.createServer(async(req,res)=>{
  securityHeaders(res);
  const pathname=decodeURIComponent(req.url.split('?')[0]);
  if(req.method==='GET'&&pathname==='/api/health')return sendJSON(res,200,{ok:true,mode:cloudMode?'cloud':'local'});
  if(req.method==='GET'&&pathname==='/api/auth/status')return sendJSON(res,200,{cloudMode,authenticated:!cloudMode||Boolean(verifyAuth(req))});
  if(req.method==='POST'&&pathname==='/api/auth/login'){
    if(!cloudMode)return sendJSON(res,404,{error:'本机模式不需要云代理解锁。',code:'LOCAL_MODE'});
    if(!sameOrigin(req))return sendJSON(res,403,{error:'请求来源无效。',code:'ORIGIN_REJECTED'});
    if(!loginAllowed(req))return sendJSON(res,429,{error:'尝试次数过多，请 15 分钟后重试。',code:'AUTH_RATE_LIMIT'});
    try{const body=await readJSON(req,8*1024),token=String(body?.token||'');if(!safeEqual(token,accessToken))return sendJSON(res,401,{error:'访问口令不正确。',code:'AUTH_INVALID'});clearLoginFailures(req);const auth=createAuthCookie();res.setHeader('Set-Cookie',authCookieHeader(auth.value));return sendJSON(res,200,{authenticated:true,expiresIn:authTtlSeconds})}catch{return sendJSON(res,400,{error:'解锁请求无效。',code:'AUTH_BAD_REQUEST'})}
  }
  if(req.method==='POST'&&pathname==='/api/auth/logout'){
    if(cloudMode&&!sameOrigin(req))return sendJSON(res,403,{error:'请求来源无效。',code:'ORIGIN_REJECTED'});
    res.setHeader('Set-Cookie',authCookieHeader('',0));return sendJSON(res,200,{authenticated:false});
  }
  if(cloudMode&&pathname.startsWith('/api/')&&!verifyAuth(req))return sendJSON(res,401,{error:'云代理已锁定，请先输入访问口令。',code:'AUTH_REQUIRED'});
  if(cloudMode&&req.method==='POST'&&pathname.startsWith('/api/')&&!sameOrigin(req))return sendJSON(res,403,{error:'请求来源无效。',code:'ORIGIN_REJECTED'});
  if(req.method==='GET'&&pathname==='/api/kimi/status')return sendJSON(res,200,statusFor(req));
  if(req.method==='POST'&&pathname==='/api/kimi/assess')return assess(req,res);
  if(req.method==='POST'&&pathname==='/api/kimi/explain')return explain(req,res);
  if(req.method==='POST'&&pathname==='/api/kimi/voice/start')return startVoiceClass(req,res);
  if(req.method==='POST'&&pathname==='/api/kimi/voice/turn')return voiceTurn(req,res);
  if(req.method==='POST'&&pathname==='/api/kimi/voice/end')return endVoiceClass(req,res);
  if(req.method==='POST'&&pathname==='/api/kimi/voice/review')return reviewVoiceClass(req,res);
  if(pathname.startsWith('/api/'))return sendJSON(res,404,{error:'接口不存在'});
  let u=pathname==='/'?'/index.html':pathname,file;
  if(u.startsWith('/vendor/pdfjs/')){const asset=path.basename(u);if(!['pdf.min.mjs','pdf.worker.min.mjs'].includes(asset)){res.writeHead(404);return res.end('Not found')}file=path.join(root,'node_modules','pdfjs-dist','build',asset)}else{file=path.normalize(path.join(root,u));if(!file.startsWith(root)){res.writeHead(403);return res.end('Forbidden')}}
  fs.readFile(file,(e,d)=>{if(e){res.writeHead(404);return res.end('Not found')}res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});res.end(d)});
});
server.listen(port,listenHost,()=>console.log(`学习督导台已启动：${cloudMode?publicOrigin:`http://127.0.0.1:${port}`} · ${cloudMode?'安全云代理':'本机代理'} · Kimi ${apiKey?'已配置':'未配置'}`));
