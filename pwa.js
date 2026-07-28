(()=>{
  if(!('serviceWorker' in navigator))return;
  let installPrompt=null;
  const standalone=matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;
  const button=document.createElement('button');
  button.id='installApp';button.className='ghost install-app';button.type='button';button.textContent=standalone?'已安装':'安装应用';
  button.hidden=standalone;
  document.querySelector('.header-actions')?.prepend(button);
  window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();installPrompt=event;button.hidden=false});
  window.addEventListener('appinstalled',()=>{installPrompt=null;button.hidden=true;toast('“向前”已安装到设备')});
  button.onclick=async()=>{if(installPrompt){installPrompt.prompt();await installPrompt.userChoice;installPrompt=null;return}const isiOS=/iPad|iPhone|iPod/.test(navigator.userAgent);toast(isiOS?'在 Safari 中点“分享”，再选“添加到主屏幕”':'打开浏览器菜单，选择“安装应用”或“添加到主屏幕”')};
  navigator.serviceWorker.register('/sw.js').catch(()=>{});
})();
