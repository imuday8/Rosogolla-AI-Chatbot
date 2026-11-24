let clientKey = load('usion.openrouter_key', '');

async function callOpenRouterDirect(messages, model, key) {
  const openRouterMessages = [];
  const mime = new Set(['application/pdf','image/png','image/jpeg','image/webp']);
  for (const message of messages) {
    const role = message.role === 'model' ? 'assistant' : 'user';
    if (message.role === 'user' && message.files && message.files.length) {
      const content = [];
      if (message.text) content.push({type: 'text', text: message.text});
      for (const file of message.files) {
        if (file.mime === 'text/plain') {
          content.push({type: 'text', text: 'Attached file: ' + String(file.name).slice(0, 150) + '\n' + file.data});
        } else if (mime.has(file.mime)) {
          content.push({type: 'image_url', image_url: {url: 'data:' + file.mime + ';base64,' + file.data}});
        }
      }
      openRouterMessages.push({role, content});
    } else {
      if (message.text) openRouterMessages.push({role, content: message.text});
    }
  }

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + key,
      'Content-Type': 'application/json',
      'HTTP-Referer': window.location.href,
      'X-Title': 'Rosogolla'
    },
    body: JSON.stringify({
      model: model || 'openrouter/free',
      messages: [
        {role: 'system', content: 'You are Rosogolla, a thoughtful, creative AI assistant. Respond in the language the user is speaking unless they request another language.'},
        ...openRouterMessages
      ],
      temperature: 1
    })
  });

  const data = await response.json();
  if (!response.ok) {
    const msg = data.error?.message || data.error || 'OpenRouter error';
    const err = new Error(msg);
    if (response.status === 402) err.code = 'OPENROUTER_CREDITS_EXHAUSTED';
    if (response.status === 401) err.code = 'OPENROUTER_AUTH_ERROR';
    if (response.status === 429) err.code = 'OPENROUTER_RATE_LIMITED';
    throw err;
  }
  const choice = data.choices?.[0];
  const reply = choice?.message?.content || '';
  const rawUsage = data.usage;
  const usage = rawUsage ? {
    promptTokenCount: rawUsage.prompt_tokens ?? 0,
    candidatesTokenCount: rawUsage.completion_tokens ?? 0,
    thoughtsTokenCount: 0,
    totalTokenCount: rawUsage.total_tokens ?? 0
  } : null;
  return { reply, usage, temperature: 1 };
}

import {startLive} from './live.js?v=2';

const $ = id => document.getElementById(id);
const icons = {
  spark:'<path d="M12 2v20M2 12h20M5 5l14 14M5 19 19 5"/>',
  plus:'<path d="M12 5v14M5 12h14"/>', search:'<circle cx="10.8" cy="10.8" r="6.5"/><path d="m16 16 4 4"/>',
  share:'<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m9 10 6-3m-6 7 6 3"/>',
  download:'<path d="M12 3v12m-4-4 4 4 4-4M4 16v4h16v-4"/>',
  settings:'<circle cx="12" cy="12" r="3"/><path d="m9 3-.6 2.5-2 .9L4 5.7 2 9l1.8 1.7v2.6L2 15l2 3.3 2.4-.7 2 .9L9 21h6l.6-2.5 2-.9 2.4.7 2-3.3-1.8-1.7v-2.6L22 9l-2-3.3-2.4.7-2-.9L15 3z"/>',
  user:'<circle cx="12" cy="8" r="3"/><path d="M5 20v-2a7 7 0 0 1 14 0v2"/>',
  chevron:'<path d="m9 6 6 6-6 6"/>',menu:'<path d="M4 6h16M4 12h16M4 18h16"/>',
  activity:'<path d="M3 14h4l3-8 4 12 3-6h4"/>',play:'<path d="m8 5 12 7-12 7z"/>',
  bulb:'<path d="M8 16c0-2-3-3-3-7a7 7 0 1 1 14 0c0 4-3 5-3 7m-8 1h8m-7 3h6"/>',
  pen:'<path d="m4 15 12-12 5 5L9 20l-6 1zm10-10 5 5"/>',
  book:'<path d="M12 5v16M3 4h5a4 4 0 0 1 4 2 4 4 0 0 1 4-2h5v14h-5a4 4 0 0 0-4 2 4 4 0 0 0-4-2H3z"/>',
  file:'<path d="M6 3h8l4 4v14H6zM14 3v5h4M9 12h6m-6 4h6"/>',
  clip:'<path d="M8 13l6-6a3 3 0 0 1 4 4l-8 8a5 5 0 0 1-7-7l8-8m-4 12 7-7"/>',
  mic:'<rect x="9" y="3" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0 0 14 0m-7 7v4m-3 0h6"/>',
  wave:'<path d="M3 10v4m4-7v10m5-14v18m5-14v10m4-7v4"/>',send:'<path d="M12 20V4m-6 6 6-6 6 6"/>',close:'<path d="m6 6 12 12M18 6 6 18"/>',
  chat:'<path d="M20 11a8 8 0 0 1-8 8H5l1.5-3A8 8 0 1 1 20 11Z"/>',
  copy:'<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 4H6a2 2 0 0 0-2 2v10"/>'
};
function icon(name) {
  const node = document.createElementNS('http://www.w3.org/2000/svg','svg');
  node.setAttribute('viewBox','0 0 24 24');
  node.setAttribute('aria-hidden','true');
  node.innerHTML = icons[name];
  return node;
}
document.querySelectorAll('[data-icon]').forEach(element=>element.append(icon(element.dataset.icon)));
function node(tag,text='',className='') {
  const element=document.createElement(tag);
  if (text) element.textContent=text;
  if (className) element.className=className;
  return element;
}
function action(label, handler, className='') {
  const button=node('button',label,className);
  button.type='button';
  button.onclick=handler;
  return button;
}
const load = (key,fallback) => {try {return JSON.parse(localStorage.getItem(key)) ?? fallback;} catch {return fallback;}};
const tab = (key,fallback) => {try {return JSON.parse(sessionStorage.getItem(key)) ?? fallback;} catch {return fallback;}};
let profile = tab('usion.profile',null);
function restoreChats(id) {
  return load('usion.chats.'+(id||'guest'),[]).map(chat=>{
    delete chat.pending;
    const last=chat.messages.at(-1);
    if(last?.role==='user'&&!last.voice)chat.failed ||= true;
    return chat;
  });
}
let chats = restoreChats(profile?.id);
let current = null;
let config = {model:'openrouter/free',liveModel:'',liveVoiceEnabled:false};
let projectBlocked = false;
let temperature = 2;
let files = [];
let pending = false;
let readingFiles = false;
let activeLive;
let recording;
let match = 0;
let toastTimer;
const fileCache = new Map();
const number = value => (value??0).toLocaleString();
const getChat = () => chats.find(chat=>chat.id === current);
const archiveKey = () => 'usion.chats.'+(profile?.id||'guest');
const save = () => {
  try {localStorage.setItem(archiveKey(),JSON.stringify(chats));}
  catch {toast('This browser could not save the chat history. Export a transcript to keep it.');}
};
function toast(text) {
  $('toast').textContent=text;
  $('toast').hidden=false;
  clearTimeout(toastTimer);
  toastTimer=setTimeout(()=>$('toast').hidden=true,5500);
}
async function api(path,body={}) {
  const headers={'Content-Type':'application/json'};
  const response=await fetch('./api/'+path,{method:'POST',headers,body:JSON.stringify(body)});
  const data=await response.json().catch(()=>({}));
  if (!response.ok) {
    const error=new Error(data.error||'The service is unavailable.');
    error.code=data.code;
    throw error;
  }
  return data;
}
function openDialog(title,...content) {
  delete $('modal').dataset.view;
  $('modal-title').textContent=title;
  $('modal-content').replaceChildren(...content);
  if (!$('modal').open) $('modal').showModal();
}
$('close-modal').onclick=()=>$('modal').close();
$('modal').addEventListener('close',()=>{
  $('modal-content').querySelector('video')?.pause();
  if (activeLive) activeLive.stop();
});
function newChat() {
  if (activeLive) activeLive.stop();
  current=null;
  files=[];
  $('prompt').value='';
  $('findbar').hidden=true;
  $('find-input').value='';
  closeSidebar();
  render();
  $('prompt').focus();
}
function choose(id) {
  if (activeLive) activeLive.stop();
  current=id;
  $('findbar').hidden=true;
  $('find-input').value='';
  closeSidebar();
  render(true);
}
function createChat(title) {
  const chat={id:crypto.randomUUID(),title:title.slice(0,85),messages:[]};
  chats.unshift(chat);
  current=chat.id;
  return chat;
}
function usageFor(chat) {
  const usage={input:0,output:0,thinking:0,total:0};
  for (const {usage:u} of chat?.messages||[]) {
    if (!u) continue;
    usage.input+=u.promptTokenCount??0;
    usage.output+=u.candidatesTokenCount??u.responseTokenCount??0;
    usage.thinking+=u.thoughtsTokenCount??0;
    usage.total+=u.totalTokenCount??0;
  }
  return usage;
}
function appendInline(parent,text) {
  const emphasis = /(`[^`\n]+`|\*\*[^*\n]+\*\*)/g;
  let last=0;
  for(const item of text.matchAll(emphasis)) {
    parent.append(text.slice(last,item.index));
    const code=item[0].startsWith('`');
    parent.append(node(code?'code':'strong',item[0].slice(code?1:2,code?-1:-2)));
    last=item.index+item[0].length;
  }
  parent.append(text.slice(last));
}
function format(parent,text) {
  for (const [index,block] of text.split(/```/).entries()) {
    if (index%2) {
      const pre=node('pre');
      pre.append(node('code',block.replace(/^[\w+-]*\n/,'').trimEnd()));
      parent.append(pre);
      continue;
    }
    let list;
    for (const line of block.split('\n')) {
      const heading=line.match(/^(#{1,4})\s+(.*)$/);
      const bullet=line.match(/^(?:[-*]|\d+\.)\s+(.*)$/);
      if (!bullet) list=null;
      if (!line.trim()) continue;
      if (bullet) {
        const kind=/^\d/.test(line)?'ol':'ul';
        if (list?.localName !== kind) {list=node(kind);parent.append(list);}
        const item=node('li');appendInline(item,bullet[1]);list.append(item);
      } else {
        const item=node(heading?'h'+Math.min(heading[1].length+1,5):'p');
        appendInline(item,heading?.[2]??line);
        parent.append(item);
      }
    }
  }
}
function renderMessages(chat) {
  const messages=$('messages');
  messages.replaceChildren();
  for(const message of chat?.messages||[]) {
    const article=node('article','', 'message '+message.role);
    article.append(node('div',message.role==='user'?'You':'Rosogolla','who'));
    const body=node('div','','message-body');
    if (message.role==='model') format(body,message.text);
    else body.textContent=message.text;
    article.append(body);
    const meta=node('div','','message-meta');
    if (message.voice) meta.append(node('span','Live voice'));
    for (const name of message.names||[]) {
      const chip=node('span','','chip');
      chip.append(icon('file'),name);
      meta.append(chip);
    }
    if(message.usage) meta.append(node('span',number(message.usage.totalTokenCount)+' tokens'));
    if(message.text) {
      const copy=action('',async()=>{try {await navigator.clipboard.writeText(message.text);toast('Message copied.');} catch {toast('Clipboard access is unavailable.');}});
      copy.setAttribute('aria-label','Copy message');copy.title='Copy message';copy.append(icon('copy'));
      meta.append(copy);
    }
    if(meta.childNodes.length) article.append(meta);
    messages.append(article);
  }
  if (chat?.failed && !chat.pending) {
    const notice=node('div','','request-error');
    const failure=typeof chat.failed==='object'?chat.failed:null;
    if(failure)notice.append(node('p',failure.message,'dialog-copy'));
    if(failure?.code==='OPENROUTER_CREDITS_EXHAUSTED'||failure?.code==='OPENROUTER_AUTH_ERROR'){
      notice.append(action('Gemini settings',settings,'dialog-action'));
    }
    notice.append(action('Retry message',()=>sendChat(chat),'dialog-action'));
    messages.append(notice);
  }
  if (chat?.pending) messages.append(node('p','Rosogolla is thinking…','dialog-copy'));
  highlight();
}
function render(bottom=false) {
  const chat=getChat();
  $('welcome').hidden=!!chat;
  $('conversation').hidden=!chat;
  $('breadcrumb').textContent=chat?.title||'Workspace';
  $('thread-title').textContent=chat?.title||'';
  $('history').replaceChildren();
  for (const item of chats) {
    const row=action('',()=>choose(item.id));
    row.append(icon('chat'),node('span',item.title));
    if (item.id===current) row.setAttribute('aria-current','true');
    $('history').append(row);
  }
  if (!chats.length) $('history').append(node('p','Your chats will appear here.','empty-history'));
  $('token-count').textContent=number(usageFor(chat).total)+' tokens';
  $('account-name').textContent=profile?.name||'Guest workspace';
  $('account-detail').textContent=profile?.email||'Sign in with Google';
  $('export').disabled=$('share').disabled=!chat?.messages.length;
  $('send').disabled=pending||readingFiles;
  renderAttachments();
  renderMessages(chat);
  if (bottom) $('scroll').scrollTop=$('scroll').scrollHeight;
}
function settings() {
  const elements = [];
  if (config.hasServerKey && !config.isStatic) {
    elements.push(node('p', 'This site uses its server’s OpenRouter connection. You can chat without entering an API key.', 'dialog-copy'));
    elements.push(node('p', config.model + ' · Temperature ' + temperature, 'dialog-copy'));
  } else {
    elements.push(node('p', 'This site is running on GitHub Pages (static mode). Enter your OpenRouter API key below to chat. It is stored securely in your browser.', 'dialog-copy'));
    const keyField = node('div', '', 'field');
    const keyLabel = node('label', 'OpenRouter API Key');
    const keyInput = node('input');
    keyInput.type = 'password';
    keyInput.placeholder = 'sk-or-v1-...';
    keyInput.value = clientKey;
    keyField.append(keyLabel, keyInput);
    elements.push(keyField);

    const modelField = node('div', '', 'field');
    const modelLabel = node('label', 'Model (default: openrouter/free)');
    const modelInput = node('input');
    modelInput.type = 'text';
    modelInput.placeholder = 'openrouter/free';
    modelInput.value = config.model || 'openrouter/free';
    modelField.append(modelLabel, modelInput);
    elements.push(modelField);

    const saveBtn = action('Save Settings', () => {
      const val = keyInput.value.trim();
      clientKey = val;
      localStorage.setItem('usion.openrouter_key', JSON.stringify(val));
      const mod = modelInput.value.trim() || 'openrouter/free';
      config.model = mod;
      localStorage.setItem('usion.openrouter_model', JSON.stringify(mod));
      config.hasServerKey = !!clientKey;
      toast(val ? 'OpenRouter key saved!' : 'Key removed.');
      $('modal').close();
      render();
    }, 'dialog-action');
    elements.push(saveBtn);
  }

  if (projectBlocked) {
    elements.push(node('p', 'OpenRouter returned an authorization or billing error. Please check your API key and credits at openrouter.ai.', 'dialog-copy'));
  }
  openDialog('Settings', ...elements);
}
$('settings').onclick=settings;
$('new').onclick=newChat;
function closeSidebar() {
  $('sidebar').classList.remove('open');
  $('menu').setAttribute('aria-expanded','false');
}
$('menu').onclick=()=>{$('menu').setAttribute('aria-expanded',$('sidebar').classList.toggle('open'));};
$('scroll').addEventListener('scroll',()=>$('navigation').classList.toggle('scrolled',$('scroll').scrollTop>3),{passive:true});
$('usage').onclick=()=>{
  const usage=usageFor(getChat());
  const chart=node('div','','usage-chart');
  const maximum=Math.max(1,usage.input,usage.output,usage.thinking);
  for(const [label,value] of [['Input',usage.input],['Output',usage.output],['Thinking',usage.thinking]]) {
    const row=node('div','','usage-line');
    const meter=node('meter');
    meter.max=maximum;meter.value=value;meter.setAttribute('aria-label',label+' tokens');
    row.append(node('span',label),meter,node('strong',number(value)));
    chart.append(row);
  }
  const total=node('div','','usage-total');
  total.append(node('span','Total'),node('strong',number(usage.total)+' tokens'));
  openDialog('Token usage',node('p','Token usage for this conversation. Input includes context sent with each request.','dialog-copy'),chart,total);
};
function setupBackgroundVoice() {
  const audio = $('bg-voice');
  const toggleBtn = $('voice-toggle');
  const statusText = $('voice-toggle-text');
  if (!audio) return;

  audio.loop = true;
  let isPlaying = false;

  function playVoice() {
    if (isPlaying) return;
    audio.play().then(() => {
      isPlaying = true;
      if (toggleBtn) toggleBtn.classList.add('voice-pill');
      if (statusText) statusText.textContent = 'Voice ON';
    }).catch(() => {});
  }

  function pauseVoice() {
    audio.pause();
    isPlaying = false;
    if (toggleBtn) toggleBtn.classList.remove('voice-pill');
    if (statusText) statusText.textContent = 'Voice OFF';
  }

  if (toggleBtn) {
    toggleBtn.onclick = () => {
      if (isPlaying) pauseVoice();
      else playVoice();
    };
  }

  // Auto-play voice on any user interaction (clicks, typing, touching)
  const gestures = ['click', 'keydown', 'touchstart', 'pointerdown'];
  function onGesture() {
    playVoice();
    gestures.forEach(g => document.removeEventListener(g, onGesture));
  }
  gestures.forEach(g => document.addEventListener(g, onGesture, { passive: true }));

  // Expose to window for intro overlay to trigger directly
  window.rosogollaVoice = { play: playVoice, pause: pauseVoice };
}

function setupIntroOverlay() {
  const overlay = $('intro-overlay');
  const video = $('intro-video');
  const skipBtn = $('intro-skip');
  const muteBtn = $('intro-mute');
  const muteText = $('intro-mute-text');
  const progressFill = $('intro-progress-fill');
  if (!overlay || !video) return;

  let dismissed = false;
  function dismiss() {
    if (dismissed) return;
    dismissed = true;
    overlay.classList.add('fade-out');
    // Start continuous background voice
    if (window.rosogollaVoice) window.rosogollaVoice.play();
    setTimeout(() => {
      overlay.hidden = true;
      try { video.pause(); } catch (_) {}
    }, 550);
  }

  video.play().catch(() => {});

  video.ontimeupdate = () => {
    if (video.duration && progressFill) {
      const pct = Math.min(100, Math.max(0, (video.currentTime / video.duration) * 100));
      progressFill.style.width = pct + '%';
    }
  };

  video.onended = () => dismiss();

  if (skipBtn) skipBtn.onclick = () => dismiss();

  overlay.addEventListener('click', (e) => {
    if (e.target.classList.contains('intro-overlay-vignette') || e.target === overlay) {
      dismiss();
    }
  });

  if (muteBtn) {
    muteBtn.onclick = (e) => {
      e.stopPropagation();
      video.muted = !video.muted;
      if (muteText) muteText.textContent = video.muted ? 'Sound on' : 'Mute';
      if (!video.muted && window.rosogollaVoice) window.rosogollaVoice.play();
    };
  }

  document.addEventListener('keydown', (e) => {
    if (!overlay.hidden && (e.key === 'Escape' || e.key === ' ' || e.key === 'Enter')) {
      if (e.target.tagName !== 'TEXTAREA' && e.target.tagName !== 'INPUT') {
        dismiss();
      }
    }
  });
}

function setupRosogollaBowl() {
  const canvas = $('rosogolla-bowl');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const size = 400;
  canvas.width = size * dpr;
  canvas.height = size * dpr;
  ctx.scale(dpr, dpr);

  let angle = 0;
  let speed = 0.013;
  let targetSpeed = 0.013;
  let mouseTiltX = 0;
  let mouseTiltY = 0;
  let currentTiltX = 0;
  let currentTiltY = 0;

  // 7 authentic plump spongy rosogollas in natural mound
  const sweets = [
    { x: 0, y: -16, z: 0, r: 36, seed: 1.2 },       // Center king rosogolla
    { x: 56, y: -9, z: 0, r: 31, seed: 2.7 },
    { x: 28, y: -7, z: 49, r: 31, seed: 4.1 },
    { x: -28, y: -10, z: 49, r: 31, seed: 5.6 },
    { x: -56, y: -8, z: 0, r: 31, seed: 0.9 },
    { x: -28, y: -9, z: -49, r: 30, seed: 3.3 },
    { x: 28, y: -11, z: -49, r: 30, seed: 6.2 }
  ];

  // Pre-generate 35 realistic spongy micro-pores per rosogolla
  const pores = sweets.map((s, idx) => {
    const list = [];
    for (let p = 0; p < 32; p++) {
      const u = (p * 1.618) % 1;
      const v = p / 32;
      const theta = u * Math.PI * 2;
      const phi = Math.acos(2 * v - 1) - Math.PI / 2;
      list.push({
        x: Math.cos(phi) * Math.cos(theta),
        y: Math.sin(phi),
        z: Math.cos(phi) * Math.sin(theta),
        size: 0.8 + (p % 4) * 0.4
      });
    }
    return list;
  });

  // Green ambient sparkles in #00ff00 orbiting the bowl
  const sparkles = [];
  for (let s = 0; s < 12; s++) {
    sparkles.push({
      dist: 125 + (s * 9) % 35,
      angle: (s * Math.PI * 2) / 12,
      speed: 0.008 + (s % 3) * 0.004,
      y: (s % 5) * 8 - 15,
      size: 1.2 + (s % 3) * 0.8
    });
  }

  const stage = canvas.parentElement;
  if (stage) {
    stage.addEventListener('pointermove', (e) => {
      const rect = canvas.getBoundingClientRect();
      const nx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const ny = ((e.clientY - rect.top) / rect.height) * 2 - 1;
      mouseTiltX = nx * 14;
      mouseTiltY = ny * 8;
      targetSpeed = 0.026;
    });
    stage.addEventListener('pointerleave', () => {
      mouseTiltX = 0;
      mouseTiltY = 0;
      targetSpeed = 0.013;
    });
  }

  function draw() {
    ctx.clearRect(0, 0, size, size);

    speed += (targetSpeed - speed) * 0.06;
    currentTiltX += (mouseTiltX - currentTiltX) * 0.08;
    currentTiltY += (mouseTiltY - currentTiltY) * 0.08;
    angle = (angle + speed) % (Math.PI * 2);

    const cx = 200 + currentTiltX;
    const cy = 205 + currentTiltY;
    const pitch = 0.42;

    // 1. Table Ambient Glow & Cast Shadow beneath the bowl
    ctx.save();
    // Glowing #00ff00 lime halo
    const glowGrad = ctx.createRadialGradient(cx, cy + 96, 25, cx, cy + 96, 150);
    glowGrad.addColorStop(0, 'rgba(0, 255, 0, 0.18)');
    glowGrad.addColorStop(0.45, 'rgba(0, 255, 0, 0.07)');
    glowGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = glowGrad;
    ctx.beginPath();
    ctx.ellipse(cx, cy + 96, 150, 50, 0, 0, Math.PI * 2);
    ctx.fill();

    // Deep contact shadow
    const shadowGrad = ctx.createRadialGradient(cx, cy + 94, 15, cx, cy + 94, 115);
    shadowGrad.addColorStop(0, 'rgba(0, 0, 0, 0.82)');
    shadowGrad.addColorStop(0.55, 'rgba(8, 14, 6, 0.5)');
    shadowGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = shadowGrad;
    ctx.beginPath();
    ctx.ellipse(cx, cy + 94, 115, 38, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // 2. Ceramic Bowl Base (Foot ring)
    ctx.save();
    ctx.fillStyle = '#0a0d08';
    ctx.strokeStyle = '#1e2814';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(cx, cy + 90, 56, 17, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Outer Ceramic Bowl Wall
    const bowlGrad = ctx.createLinearGradient(cx - 146, cy - 20, cx + 146, cy + 90);
    bowlGrad.addColorStop(0, '#151b11');
    bowlGrad.addColorStop(0.35, '#222c18');
    bowlGrad.addColorStop(0.7, '#13180f');
    bowlGrad.addColorStop(1, '#090c07');

    ctx.fillStyle = bowlGrad;
    ctx.strokeStyle = '#32401f';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx - 144, cy - 14);
    ctx.bezierCurveTo(cx - 142, cy + 52, cx - 88, cy + 88, cx - 54, cy + 88);
    ctx.ellipse(cx, cy + 88, 54, 16, 0, Math.PI, 0, true);
    ctx.bezierCurveTo(cx + 88, cy + 88, cx + 142, cy + 52, cx + 144, cy - 14);
    ctx.ellipse(cx, cy - 14, 144, 55, 0, 0, Math.PI, true);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Inner bowl rear wall
    const innerCavityGrad = ctx.createRadialGradient(cx, cy - 14, 30, cx, cy - 14, 140);
    innerCavityGrad.addColorStop(0, '#313f1d');
    innerCavityGrad.addColorStop(0.55, '#1e2612');
    innerCavityGrad.addColorStop(1, '#0c1008');
    ctx.fillStyle = innerCavityGrad;
    ctx.beginPath();
    ctx.ellipse(cx, cy - 14, 140, 52, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // 3. Golden Sweet Syrup (Chashni) Pool
    ctx.save();
    const syrupY = cy - 6;
    const syrupRx = 128;
    const syrupRy = 46;
    const syrupGrad = ctx.createRadialGradient(cx - 25, syrupY - 10, 15, cx, syrupY, syrupRx);
    syrupGrad.addColorStop(0, '#fae6a6');
    syrupGrad.addColorStop(0.35, '#e0a133');
    syrupGrad.addColorStop(0.7, '#b36f16');
    syrupGrad.addColorStop(1, '#7a4205');
    ctx.fillStyle = syrupGrad;
    ctx.beginPath();
    ctx.ellipse(cx, syrupY, syrupRx, syrupRy, 0, 0, Math.PI * 2);
    ctx.fill();

    // Specular liquid reflection ripples
    ctx.strokeStyle = 'rgba(255, 248, 210, 0.5)';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.ellipse(cx - 8, syrupY - 4, syrupRx * 0.86, syrupRy * 0.83, -0.04, Math.PI * 0.72, Math.PI * 1.86);
    ctx.stroke();
    ctx.restore();

    // 4. Project and depth-sort the 7 Rosogollas
    const projectedSweets = sweets.map((s, idx) => {
      // 3D Rotation on vertical Y-axis
      const rx = s.x * Math.cos(angle) - s.z * Math.sin(angle);
      const rz = s.x * Math.sin(angle) + s.z * Math.cos(angle);
      // Gentle floating bob in sweet syrup
      const ry = s.y + Math.sin(angle * 2.2 + idx) * 2.5;

      const sx = cx + rx;
      const sy = (cy - 14) + ry * Math.cos(pitch) + rz * Math.sin(pitch);
      const rad = s.r * (1 + rz * 0.0015);
      return { idx, sx, sy, rad, rx, ry, rz, s };
    }).sort((a, b) => a.rz - b.rz);

    // 5. Draw each Hyper-Realistic Rosogolla
    projectedSweets.forEach(({ idx, sx, sy, rad, rz, s }) => {
      ctx.save();

      // Contact shadow in sweet syrup
      ctx.fillStyle = 'rgba(80, 38, 5, 0.44)';
      ctx.beginPath();
      ctx.ellipse(sx, sy + rad * 0.54, rad * 0.9, rad * 0.44, 0, 0, Math.PI * 2);
      ctx.fill();

      // Organic Soft Chhena Contour (subtle irregular curd lumps)
      ctx.beginPath();
      const numPts = 32;
      for (let pt = 0; pt <= numPts; pt++) {
        const phi = (pt / numPts) * Math.PI * 2;
        // Natural hand-rolled chhena shape variation
        const deform = 1 + 0.032 * Math.sin(phi * 3 + s.seed) + 0.018 * Math.cos(phi * 5 + s.seed * 2);
        const px = sx + Math.cos(phi) * rad * deform;
        const py = sy + Math.sin(phi) * rad * deform;
        if (pt === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();

      // 3D Multi-Stage Spherical Radial Lighting
      const lightX = sx - rad * 0.35;
      const lightY = sy - rad * 0.38;
      const sweetGrad = ctx.createRadialGradient(lightX, lightY, rad * 0.05, sx, sy, rad);
      sweetGrad.addColorStop(0, '#ffffff');       // Glossy specular highlight
      sweetGrad.addColorStop(0.14, '#fffef8');    // Fresh pure white milk chhena
      sweetGrad.addColorStop(0.48, '#fcf5e6');    // Creamy ivory curd body
      sweetGrad.addColorStop(0.74, '#f1dec2');    // Sweet syrup infusion
      sweetGrad.addColorStop(0.92, '#e2caa2');    // Ambient warm shadow
      sweetGrad.addColorStop(1, '#cca774');       // Warm golden rim shadow

      ctx.fillStyle = sweetGrad;
      ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
      ctx.shadowBlur = 10;
      ctx.shadowOffsetY = 5;
      ctx.fill();
      ctx.shadowColor = 'transparent';

      // Realistic Spongy Texture Micro-Pores (rotating with 3D sphere)
      pores[idx].forEach(p => {
        // Rotate 3D pore coordinates with ball rotation
        const px = p.x * Math.cos(angle) - p.z * Math.sin(angle);
        const pz = p.x * Math.sin(angle) + p.z * Math.cos(angle);
        const py = p.y;

        // Only draw visible pores facing forward
        if (pz > -0.15) {
          const poreScreenX = sx + px * rad * 0.88;
          const poreScreenY = sy + py * rad * 0.88;

          // Shadow depth of pore
          ctx.fillStyle = 'rgba(170, 135, 95, 0.42)';
          ctx.beginPath();
          ctx.arc(poreScreenX, poreScreenY, p.size, 0, Math.PI * 2);
          ctx.fill();

          // Pore rim light highlight
          ctx.fillStyle = 'rgba(255, 255, 255, 0.48)';
          ctx.beginPath();
          ctx.arc(poreScreenX - 0.4, poreScreenY - 0.4, p.size * 0.5, 0, Math.PI * 2);
          ctx.fill();
        }
      });

      // Liquid Syrup Glaze Curved Sheen Highlight
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.65)';
      ctx.lineWidth = 1.6;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.arc(sx, sy, rad * 0.72, -Math.PI * 0.88, -Math.PI * 0.48);
      ctx.stroke();

      // Tiny glistening sugar syrup droplet
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(lightX + 2, lightY + 1, 1.8, 0, Math.PI * 2);
      ctx.fill();

      // Garnish: Crushed Pistachio Slivers in vibrant #00ff00
      const garnishAngle = angle + idx * 0.9;
      const gx = sx + Math.cos(garnishAngle) * (rad * 0.18);
      const gy = sy - rad * 0.28 + Math.sin(garnishAngle) * (rad * 0.14);

      // Electric #00ff00 pistachio flakes
      ctx.fillStyle = '#00ff00';
      ctx.shadowColor = 'rgba(0, 255, 0, 0.5)';
      ctx.shadowBlur = 4;
      ctx.beginPath();
      ctx.ellipse(gx + 3, gy - 2, 2.5, 1.4, 0.4, 0, Math.PI * 2);
      ctx.ellipse(gx - 4, gy + 3, 2.2, 1.2, -0.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowColor = 'transparent';

      // Deep green pistachio accent
      ctx.fillStyle = '#3b7a14';
      ctx.beginPath();
      ctx.ellipse(gx + 5, gy + 4, 1.8, 1.0, 0.2, 0, Math.PI * 2);
      ctx.ellipse(gx - 3, gy - 4, 1.6, 0.9, -0.3, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
    });

    // 6. Front Lip of Ceramic Bowl (overlapping front rosogollas for 3D realism)
    ctx.save();
    const frontRimGrad = ctx.createLinearGradient(cx - 144, cy - 14, cx + 144, cy + 32);
    frontRimGrad.addColorStop(0, '#1c2215');
    frontRimGrad.addColorStop(0.4, '#2d381c');
    frontRimGrad.addColorStop(0.7, '#1c2215');
    frontRimGrad.addColorStop(1, '#0f130a');

    ctx.fillStyle = frontRimGrad;
    ctx.strokeStyle = '#3a4a22';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx - 144, cy - 14);
    ctx.ellipse(cx, cy - 14, 144, 55, 0, Math.PI, 0, true);
    ctx.bezierCurveTo(cx + 132, cy + 20, cx + 62, cy + 45, cx, cy + 47);
    ctx.bezierCurveTo(cx - 62, cy + 45, cx - 132, cy + 20, cx - 144, cy - 14);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Top Rim Glowing #00ff00 Specular Highlight
    ctx.strokeStyle = '#00ff00';
    ctx.lineWidth = 2.2;
    ctx.shadowColor = '#00ff00';
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.ellipse(cx, cy - 14, 142, 53, 0, Math.PI * 0.08, Math.PI * 0.92, false);
    ctx.stroke();
    ctx.shadowColor = 'transparent';

    // 7. Rotating Axis Orbit Marker in #00ff00
    ctx.setLineDash([5, 7]);
    ctx.strokeStyle = 'rgba(0, 255, 0, 0.42)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.ellipse(cx, cy + 98, 76, 24, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

    // 8. Floating #00ff00 Ambient Sparkles
    sparkles.forEach((sp, i) => {
      sp.angle = (sp.angle + sp.speed) % (Math.PI * 2);
      const spX = cx + Math.cos(sp.angle) * sp.dist;
      const spY = cy + Math.sin(sp.angle) * (sp.dist * 0.36) + sp.y;
      ctx.fillStyle = '#00ff00';
      ctx.shadowColor = '#00ff00';
      ctx.shadowBlur = 6;
      ctx.beginPath();
      ctx.arc(spX, spY, sp.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowColor = 'transparent';
    });

    ctx.restore();

    requestAnimationFrame(draw);
  }

  requestAnimationFrame(draw);
}

setupBackgroundVoice();
setupIntroOverlay();
setupRosogollaBowl();
