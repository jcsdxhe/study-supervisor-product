const assert=require('assert');
const path=require('path');
const net=require('net');
const {spawn,spawnSync}=require('child_process');

const root=path.join(__dirname,'..');
const origin='https://study.example.test';
const token='test-access-token-1234567890-abcd';
const secret='test-signing-secret-1234567890-abcdefghijklmnopqrstuvwxyz';

function freePort(){return new Promise((resolve,reject)=>{const server=net.createServer();server.once('error',reject);server.listen(0,'127.0.0.1',()=>{const port=server.address().port;server.close(()=>resolve(port))})})}
async function waitFor(url,child){for(let i=0;i<50;i++){if(child.exitCode!==null)throw new Error(`cloud server exited early: ${child.exitCode}`);try{const r=await fetch(url);if(r.ok)return}catch{}await new Promise(resolve=>setTimeout(resolve,100))}throw new Error('cloud server did not become healthy')}

(async()=>{
  const rejected=spawnSync(process.execPath,['server.js'],{cwd:root,encoding:'utf8',timeout:3000,env:{...process.env,ALLOW_CLOUD_PROXY:'true',APP_ACCESS_TOKEN:'short',SESSION_SIGNING_SECRET:secret,MOONSHOT_API_KEY:'dummy-key',PUBLIC_ORIGIN:origin,PORT:'43991'}});
  assert.notStrictEqual(rejected.status,0,'cloud mode must reject a short access token');
  assert.match(`${rejected.stdout}${rejected.stderr}`,/APP_ACCESS_TOKEN/);

  const port=await freePort(),base=`http://127.0.0.1:${port}`;
  const child=spawn(process.execPath,['server.js'],{cwd:root,stdio:['ignore','pipe','pipe'],env:{...process.env,ALLOW_CLOUD_PROXY:'true',APP_ACCESS_TOKEN:token,SESSION_SIGNING_SECRET:secret,MOONSHOT_API_KEY:'dummy-key',PUBLIC_ORIGIN:origin,PORT:String(port)}});
  let output='';child.stdout.on('data',chunk=>output+=chunk);child.stderr.on('data',chunk=>output+=chunk);
  try{
    await waitFor(`${base}/api/health`,child);
    let r=await fetch(`${base}/api/kimi/status`,{headers:{'X-Study-Session':'attacker-controlled-session'}});assert.strictEqual(r.status,401);assert.strictEqual((await r.json()).code,'AUTH_REQUIRED');
    r=await fetch(`${base}/api/auth/login`,{method:'POST',headers:{'Content-Type':'application/json','Origin':origin},body:JSON.stringify({token:'wrong-access-token'})});assert.strictEqual(r.status,401);assert.strictEqual(r.headers.get('set-cookie'),null);
    r=await fetch(`${base}/api/auth/login`,{method:'POST',headers:{'Content-Type':'application/json','Origin':'https://evil.example'},body:JSON.stringify({token})});assert.strictEqual(r.status,403);
    r=await fetch(`${base}/api/auth/login`,{method:'POST',headers:{'Content-Type':'application/json','Origin':origin},body:JSON.stringify({token})});assert.strictEqual(r.status,200);const cookie=r.headers.get('set-cookie');assert(cookie);for(const flag of ['HttpOnly','Secure','SameSite=Strict'])assert(cookie.includes(flag),`missing cookie flag ${flag}`);const sessionCookie=cookie.split(';')[0];
    r=await fetch(`${base}/api/kimi/status`,{headers:{Cookie:sessionCookie}});assert.strictEqual(r.status,200);const status=await r.json();assert.strictEqual(status.cloudMode,true);assert.strictEqual(status.configured,true);
    r=await fetch(`${base}/api/kimi/voice/end`,{method:'POST',headers:{'Content-Type':'application/json','Origin':'https://evil.example',Cookie:sessionCookie},body:'{}'});assert.strictEqual(r.status,403);
    r=await fetch(`${base}/api/kimi/voice/review`,{method:'POST',headers:{'Content-Type':'application/json','Origin':'https://evil.example',Cookie:sessionCookie},body:JSON.stringify({transcript:[],options:{summary:true}})});assert.strictEqual(r.status,403);
    r=await fetch(`${base}/api/kimi/voice/review`,{method:'POST',headers:{'Content-Type':'application/json','Origin':origin},body:JSON.stringify({transcript:[],options:{summary:true}})});assert.strictEqual(r.status,401);
    r=await fetch(`${base}/api/auth/logout`,{method:'POST',headers:{'Origin':origin,Cookie:sessionCookie}});assert.strictEqual(r.status,200);assert(r.headers.get('set-cookie').includes('Max-Age=0'));
  }finally{child.kill();}
  console.log('✓ 安全云代理启动门槛、认证 Cookie、来源校验与未授权拒绝检查通过');
})().catch(error=>{console.error(error.stack||error);process.exitCode=1});
