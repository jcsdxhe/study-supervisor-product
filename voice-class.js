(()=>{
  const box=document.querySelector('.wb-ai-box');
  if(!box)return;
  box.querySelector('strong').textContent='AI 语音课堂与题目辅助';
  box.querySelector(':scope>p').textContent='语音课堂是默认入口；文字讲解与批注工具收在下方备用区。';

  let sid=sessionStorage.getItem('kimi-study-session');
  if(!sid){sid=crypto.randomUUID().replaceAll('-','');sessionStorage.setItem('kimi-study-session',sid)}
  const status=box.querySelector('.kimi-status'),question=document.getElementById('wbQuestion'),controls=box.querySelector('.kimi-controls'),result=document.getElementById('kimiResult');
  const launch=document.createElement('div');
  launch.className='voice-launch';
  launch.innerHTML='<b>🎧 实时语音课堂</b><p>先快速读取当前题目，再像网课一样连续问答；回答会边生成边开口。</p><button class="primary" id="voiceClassStart" disabled title="正在检查 Kimi 安全代理">进入语音课堂</button>';
  status.after(launch);
  const manual=document.createElement('details');
  manual.className='kimi-manual';
  manual.innerHTML='<summary>展开文字讲解与批注工具（备用）</summary>';
  manual.append(question,controls,result);
  box.appendChild(manual);

  const layer=document.createElement('section');
  layer.className='voice-class';
  layer.hidden=true;
  layer.innerHTML=`
    <header class="voice-class-head"><div><h2>实时语音课堂</h2><span>当前题目 · 老师随讲随画</span></div><button class="ghost voice-stop" id="voiceClassEnd">结束课堂</button></header>
    <div class="voice-class-body"><div class="voice-question"><img id="voiceQuestionImage" alt="当前课堂题目"></div><div class="voice-room">
      <div class="voice-presence"><div class="voice-orb"></div><div><b id="voiceState">等待开始</b><small id="voiceDetail">麦克风默认屏蔽，不会因环境声音打断讲题</small></div></div>
      <div class="voice-log" id="voiceLog"></div>
      <div class="voice-controls">
        <div class="voice-options">
          <label>中文音色<select id="voiceSelect"><option>正在读取系统音色…</option></select></label>
          <label>语速 <input id="voiceRate" type="range" min="0.85" max="1.45" step="0.05" value="1.15"><b id="voiceRateValue">1.15×</b></label>
          <label class="voice-draw"><input id="voiceDraw" type="checkbox" checked>允许老师随讲随画（可撤销）</label>
          <label class="voice-draw"><input id="voiceAutoSend" type="checkbox">停顿 2.2 秒后自动发送</label>
        </div>
        <div class="voice-safety-row"><button class="ghost voice-shield active" id="voiceShield" type="button" aria-pressed="true">🔇 麦克风已屏蔽</button><button class="ghost voice-interrupt" id="voiceInterrupt" type="button" disabled>⏹ 立即打断老师</button><span>讲课时麦克风始终关闭；允许提问后，也只会在老师讲完时聆听。</span></div>
        <div class="voice-interim" id="voiceInterim">识别文字会先留在输入框，默认不会自动提交。</div>
        <div class="voice-input-row"><button class="voice-mic primary" id="voiceMic" title="开始或停止语音识别">🎙</button><input id="voiceText" placeholder="说完后可修改文字，再点发送"><button class="primary" id="voiceSend">确认发送</button></div>
        <p class="voice-privacy">语音识别由浏览器提供，可能按浏览器服务政策处理音频；只把你确认后的文字发给 Kimi，不发送原始麦克风音频。回答声音由浏览器朗读，不是 Kimi 原生音频流。随讲批注写入本机白板，可撤销或删除。</p>
      </div>
    </div></div>`;
  document.body.appendChild(layer);

  const startBtn=document.getElementById('voiceClassStart'),endBtn=document.getElementById('voiceClassEnd'),micBtn=document.getElementById('voiceMic'),shieldBtn=document.getElementById('voiceShield'),interruptBtn=document.getElementById('voiceInterrupt'),sendBtn=document.getElementById('voiceSend'),textInput=document.getElementById('voiceText'),stateEl=document.getElementById('voiceState'),detailEl=document.getElementById('voiceDetail'),log=document.getElementById('voiceLog'),interimEl=document.getElementById('voiceInterim'),imageEl=document.getElementById('voiceQuestionImage'),voiceSelect=document.getElementById('voiceSelect'),voiceRate=document.getElementById('voiceRate'),voiceRateValue=document.getElementById('voiceRateValue'),voiceDraw=document.getElementById('voiceDraw'),autoSend=document.getElementById('voiceAutoSend');
  const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
  let active=false,ready=false,listening=false,speaking=false,requesting=false,recognition=null,classId='',speechQueue=[],speechBuffer='',streamDone=true,turnStarted=0,firstSpeechAt=0,aborter=null,recentSpoken='',lastAudioEnd=0,sourcePageId='',boardPageId='',cancelVisualAnimation=null,micShielded=true,manualRecognitionStop=false,recognitionBase='',transcriptTimer=null,proxyReady=false;

  function setState(name,detail,kind=''){stateEl.textContent=name;detailEl.textContent=detail||'';layer.classList.toggle('listening',kind==='listening');layer.classList.toggle('speaking',kind==='speaking')}
  function addMessage(role,text){const el=document.createElement('div');el.className=`voice-msg ${role}`;el.textContent=text;log.appendChild(el);log.scrollTop=log.scrollHeight;return el}
  function cleanSpeech(text){return String(text).replace(/\*\*/g,'').replace(/[`#$]/g,'').replace(/\\[a-zA-Z]+/g,'').replace(/[{}]/g,'').replace(/\s+/g,' ').trim()}
  function updateInterrupt(){interruptBtn.disabled=!(speaking||requesting)}
  function setShield(value){micShielded=Boolean(value);shieldBtn.classList.toggle('active',micShielded);shieldBtn.setAttribute('aria-pressed',String(micShielded));shieldBtn.textContent=micShielded?'🔇 麦克风已屏蔽':'🎙 已允许课后提问';if(micShielded){stopListening(true);if(active&&!speaking&&!requesting)setState('麦克风已屏蔽','环境声音不会被识别或提交')}else if(active&&ready&&!speaking&&!requesting){setState('可以提问','点击麦克风开始说；文字确认后再发送');setTimeout(startListening,250)}}
  function enqueueSentences(flush=false){let match;const re=/^([\s\S]*?[。！？!?；;\n])([\s\S]*)$/;while((match=speechBuffer.match(re))){const sentence=cleanSpeech(match[1]);speechBuffer=match[2];if(sentence)speechQueue.push(sentence)}if(flush&&cleanSpeech(speechBuffer)){speechQueue.push(cleanSpeech(speechBuffer));speechBuffer=''}speakNext()}
  function loadVoices(){const voices=speechSynthesis.getVoices().filter(v=>/^zh/i.test(v.lang));if(!voices.length)return;voiceSelect.innerHTML=voices.map(v=>`<option value="${escAttr(v.voiceURI)}">${escText(v.name)}${/Natural|Online/i.test(v.name)?' · Natural':''}</option>`).join('');const saved=localStorage.getItem('voice-class-voice'),best=voices.find(v=>v.voiceURI===saved)||voices.find(v=>/Natural|Online/i.test(v.name)&&/Xiaoxiao|晓晓|Yunxi|云希/i.test(v.name))||voices.find(v=>/Natural|Online/i.test(v.name))||voices.find(v=>/Xiaoxiao|晓晓/i.test(v.name))||voices[0];voiceSelect.value=best.voiceURI}
  function chooseVoice(){return speechSynthesis.getVoices().find(v=>v.voiceURI===voiceSelect.value)||null}
  function finishTeacherTurn(){requesting=false;updateInterrupt();if(micShielded){setState('老师已讲完','麦克风保持屏蔽；需要提问时点击“麦克风已屏蔽”')}else{setState('轮到你了','说话内容先保留在输入框，确认后再发送');setTimeout(startListening,350)}}
  function speakNext(){if(!active||speaking||!speechQueue.length){if(active&&!speaking&&streamDone&&requesting)finishTeacherTurn();return}const sentence=speechQueue.shift(),u=new SpeechSynthesisUtterance(sentence);u.lang='zh-CN';u.rate=Number(voiceRate.value)||1.15;u.pitch=1.03;const voice=chooseVoice();if(voice)u.voice=voice;u.onstart=()=>{speaking=true;recentSpoken=(recentSpoken+' '+sentence).slice(-500);if(!firstSpeechAt)firstSpeechAt=performance.now();setState('老师正在讲',`首句开口 ${((firstSpeechAt-turnStarted)/1000).toFixed(1)} 秒 · 麦克风已关闭`,'speaking');updateInterrupt()};u.onend=()=>{speaking=false;lastAudioEnd=Date.now();updateInterrupt();speakNext()};u.onerror=()=>{speaking=false;lastAudioEnd=Date.now();updateInterrupt();speakNext()};speechSynthesis.speak(u)}
  function stopAudio(){speechQueue=[];speechBuffer='';speaking=false;speechSynthesis.cancel();layer.classList.remove('speaking');updateInterrupt()}
  function normalizeEcho(s){return String(s).replace(/[\s，。！？,.!?；;“”"']/g,'').toLowerCase()}
  function transcriptText(){return textInput.value.trim()}
  function isLikelyEcho(text){return Date.now()-lastAudioEnd<2600&&normalizeEcho(text).length>3&&normalizeEcho(recentSpoken).includes(normalizeEcho(text))}
  function scheduleAutoSend(){clearTimeout(transcriptTimer);if(!autoSend.checked)return;interimEl.textContent='停顿计时中；继续说话会重新计时，点击输入框可修改。';transcriptTimer=setTimeout(()=>{if(!active||requesting||speaking||!transcriptText())return;stopListening(true);sendTranscript()},2200)}
  function makeRecognition(){if(!SR)return null;const r=new SR();recognitionBase=transcriptText();manualRecognitionStop=false;r.lang='zh-CN';r.continuous=true;r.interimResults=true;r.onstart=()=>{listening=true;setState('正在听你说',autoSend.checked?'停顿 2.2 秒后提交；继续说会重新计时':'文字只暂存，点击“确认发送”才提交','listening')};r.onresult=e=>{let final='',interim='';for(let i=0;i<e.results.length;i++){const t=e.results[i][0].transcript;if(e.results[i].isFinal)final+=t;else interim+=t}const combined=[recognitionBase,final,interim].filter(Boolean).join(recognitionBase?' ':'').trim();textInput.value=combined;interimEl.textContent=interim?`正在识别：${interim}`:'已识别，可继续补充或修改。';clearTimeout(transcriptTimer);if(final)scheduleAutoSend()};r.onerror=e=>{listening=false;const names={'not-allowed':'麦克风权限未开启','no-speech':'暂时没有听到语音，已保留现有文字',network:'浏览器语音识别服务暂不可用','audio-capture':'找不到可用麦克风'};setState('语音识别暂停',names[e.error]||`语音识别错误：${e.error}`)};r.onend=()=>{listening=false;layer.classList.remove('listening');if(!active||micShielded||manualRecognitionStop||requesting||speaking)return;if(transcriptText())interimEl.textContent='浏览器暂停了识别，已有文字已保留；正在继续聆听。';setTimeout(startListening,450)};return r}
  function startListening(){if(!active||!ready||micShielded||requesting||speaking||listening)return;if(!SR){setState('请键盘输入','当前浏览器不支持语音识别，但语音回答仍可用');return}recognition=makeRecognition();try{recognition.start()}catch{setState('麦克风启动失败','请点击麦克风按钮重试')}}
  function stopListening(manual=false){clearTimeout(transcriptTimer);manualRecognitionStop=manual;try{recognition?.stop()}catch{}listening=false;layer.classList.remove('listening')}
  async function showTeachingMarks(event){if(!voiceDraw.checked)return;try{if(event.target==='source'){await window.LocalWhiteboard.applyLiveAnnotations(event.items,sourcePageId)}else{const placed=await window.LocalWhiteboard.applyTeachingBoard(event.items,boardPageId,event.title||'老师板书',event.newPage===true);boardPageId=placed.pageId}imageEl.src=window.LocalWhiteboard.getCurrentImage();imageEl.classList.remove('voice-mark-flash');requestAnimationFrame(()=>imageEl.classList.add('voice-mark-flash'))}catch(e){console.warn('随讲批注未应用',e);addMessage('teacher',`板书未显示：${e.message}`)}}
  async function showTeachingVisual(event){if(!voiceDraw.checked)return;try{cancelVisualAnimation?.();cancelVisualAnimation=null;if(event.kind==='plot'){const rendered=window.TeachingVisuals.renderPlot(event.spec);await window.LocalWhiteboard.createTeachingVisualPage(rendered.spec.title,rendered.dataUrl);imageEl.src=rendered.dataUrl}else{const spec=window.TeachingVisuals.validateMotion(event.spec),finalFrame=window.TeachingVisuals.drawMotion(spec,spec.duration);await window.LocalWhiteboard.createTeachingVisualPage(finalFrame.spec.title,finalFrame.dataUrl);const animationCanvas=document.createElement('canvas');animationCanvas.width=1200;animationCanvas.height=800;cancelVisualAnimation=window.TeachingVisuals.animateMotion(spec,animationCanvas,frame=>{if(active)imageEl.src=frame.dataUrl})}imageEl.classList.remove('voice-mark-flash');requestAnimationFrame(()=>imageEl.classList.add('voice-mark-flash'))}catch(e){console.warn('教学图像被拒绝',e);addMessage('teacher',`教学图像未显示：${e.message}`)}}
  async function sendTurn(text){if(!active||!ready||requesting||!text)return;stopListening(true);stopAudio();requesting=true;streamDone=false;turnStarted=performance.now();firstSpeechAt=0;addMessage('student',text);const teacher=addMessage('teacher','');setState('老师正在思考','收到第一句后立即开口；麦克风保持关闭');updateInterrupt();aborter=new AbortController();let answer='';
    try{const r=await fetch('/api/kimi/voice/turn',{method:'POST',headers:{'Content-Type':'application/json','X-Study-Session':sid},body:JSON.stringify({classId,text}),signal:aborter.signal});if(!r.ok){const d=await r.json();throw new Error(d.error||'语音回答失败')}const reader=r.body.getReader(),decoder=new TextDecoder();let buf='';while(true){const {done,value}=await reader.read();if(done)break;buf+=decoder.decode(value,{stream:true});const blocks=buf.split('\n\n');buf=blocks.pop()||'';for(const block of blocks){const event=block.match(/^event:\s*(.+)$/m)?.[1],raw=block.match(/^data:\s*(.+)$/m)?.[1];if(!raw)continue;const d=JSON.parse(raw);if(event==='delta'){answer+=(answer?' ':'')+d.text;teacher.textContent=cleanSpeech(answer);log.scrollTop=log.scrollHeight;speechBuffer+=d.text;enqueueSentences(false)}else if(event==='annotation')await showTeachingMarks({...d,target:'source'});else if(event==='board')await showTeachingMarks({...d,target:'board'});else if(event==='visual')await showTeachingVisual(d);else if(event==='error')throw new Error(d.error)}}streamDone=true;enqueueSentences(true);if(!answer)throw new Error('没有收到可朗读的回答')}catch(e){streamDone=true;requesting=false;updateInterrupt();teacher.textContent=e.name==='AbortError'?'回答已被你打断。':e.message;if(active){setState('可以继续问',micShielded?'麦克风保持屏蔽':e.message);if(!micShielded)setTimeout(startListening,250)}}}
  function sendTranscript(){const text=transcriptText();if(!text)return;if(isLikelyEcho(text)){textInput.value='';interimEl.textContent='已抑制扬声器回声，没有提交。';setState('回声已忽略','请重新说出你的问题');return}textInput.value='';interimEl.textContent='问题已确认发送。';sendTurn(text)}
  function interruptTeacher(){if(!speaking&&!requesting)return;aborter?.abort();stopAudio();requesting=false;streamDone=true;updateInterrupt();setState('已打断老师',micShielded?'麦克风仍屏蔽；点击屏蔽按钮后可提问':'现在可以开始说');if(!micShielded)setTimeout(startListening,200)}
  async function beginClass(){if(active)return;if(!proxyReady){toast('请先连接或解锁 Kimi 安全代理');document.querySelector('.kimi-status')?.click();return}let image;try{setState('正在压缩题图','仅降低传输体积，不修改本机原图');image=window.LocalWhiteboard.getOptimizedRequestImage?await window.LocalWhiteboard.getOptimizedRequestImage(1800):window.LocalWhiteboard.getRequestImage();sourcePageId=window.LocalWhiteboard.getPageMeta().id}catch(e){toast(e.message);return}active=true;ready=false;boardPageId='';layer.hidden=false;imageEl.src=image;log.innerHTML='';setState('正在快速备课','第一次需要读取题图；后续文字问答会更快，麦克风保持屏蔽');startBtn.disabled=true;
    try{const model=document.getElementById('kimiModel')?.value||'kimi-k2.6',context=document.getElementById('kimiContext')?.value||'',r=await fetch('/api/kimi/voice/start',{method:'POST',headers:{'Content-Type':'application/json','X-Study-Session':sid},body:JSON.stringify({image,model,context})}),d=await r.json();if(!r.ok)throw new Error(d.error||'课堂准备失败');classId=d.classId;ready=true;addMessage('teacher',d.greeting);speechBuffer=d.greeting;streamDone=true;requesting=true;turnStarted=performance.now();firstSpeechAt=0;updateInterrupt();enqueueSentences(true)}catch(e){addMessage('teacher',e.message);setState('课堂未开始',e.message);active=false;startBtn.disabled=false;updateInterrupt()}}
  async function endClass(){if(!active&&!classId){layer.hidden=true;return}active=false;ready=false;cancelVisualAnimation?.();cancelVisualAnimation=null;stopListening(true);stopAudio();aborter?.abort();const id=classId;classId='';layer.hidden=true;startBtn.disabled=false;if(sourcePageId)window.LocalWhiteboard.selectPage(sourcePageId).catch(()=>{});if(id)fetch('/api/kimi/voice/end',{method:'POST',headers:{'Content-Type':'application/json','X-Study-Session':sid},body:JSON.stringify({classId:id}),keepalive:true}).catch(()=>{})}
  function escText(s){return String(s).replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]))}
  function escAttr(s){return escText(s).replace(/"/g,'&quot;')}

  let endArmedUntil=0;
  loadVoices();
  speechSynthesis.onvoiceschanged=loadVoices;
  voiceSelect.onchange=()=>localStorage.setItem('voice-class-voice',voiceSelect.value);
  voiceRate.oninput=()=>{voiceRateValue.textContent=`${Number(voiceRate.value).toFixed(2)}×`;localStorage.setItem('voice-class-rate',voiceRate.value)};
  voiceRate.value=localStorage.getItem('voice-class-rate')||'1.15';
  voiceRateValue.textContent=`${Number(voiceRate.value).toFixed(2)}×`;
  autoSend.checked=localStorage.getItem('voice-class-auto-send')==='true';
  autoSend.onchange=()=>{localStorage.setItem('voice-class-auto-send',String(autoSend.checked));if(!autoSend.checked)clearTimeout(transcriptTimer)};
  startBtn.onclick=beginClass;
  endBtn.onclick=()=>{if(Date.now()>endArmedUntil){endArmedUntil=Date.now()+3000;endBtn.textContent='再点一次确认结束';setTimeout(()=>{if(Date.now()>endArmedUntil)endBtn.textContent='结束课堂'},3100);return}endBtn.textContent='结束课堂';endClass()};
  shieldBtn.onclick=()=>setShield(!micShielded);
  interruptBtn.onclick=interruptTeacher;
  micBtn.onclick=()=>{if(!active)return;if(micShielded)setShield(false);else if(listening){stopListening(true);setState('识别已暂停','文字已保留，可修改后确认发送')}else startListening()};
  sendBtn.onclick=sendTranscript;
  textInput.oninput=()=>clearTimeout(transcriptTimer);
  textInput.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();sendTranscript()}};
  window.addEventListener('kimi:proxy-status',event=>{proxyReady=Boolean(event.detail?.configured&&!event.detail?.locked);startBtn.disabled=!proxyReady||active;startBtn.title=proxyReady?'':'请先连接或解锁 Kimi 安全代理'});
  document.addEventListener('visibilitychange',()=>{if(document.hidden&&active){cancelVisualAnimation?.();cancelVisualAnimation=null;stopListening(true);stopAudio();setShield(true);setState('课堂已暂停','回到页面后可继续，麦克风已屏蔽')}});
  window.addEventListener('beforeunload',()=>{cancelVisualAnimation?.();stopListening(true);stopAudio()});
  setShield(true);
})();
