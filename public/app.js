import {startLive} from './live.js';

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
let current = chats[0]?.id || null;
let config = {model:'gemini-3.8-flash',liveModel:'gemini-3.8-live'};
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
  const response=await fetch('/api/'+path,{method:'POST',headers,body:JSON.stringify(body)});
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
    article.append(node('div',message.role==='user'?'You':'USION','who'));
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
    if(failure?.code==='GEMINI_PROJECT_UNAVAILABLE'){
      notice.append(action('Gemini settings',settings,'dialog-action'));
    }
    notice.append(action('Retry message',()=>sendChat(chat),'dialog-action'));
    messages.append(notice);
  }
  if (chat?.pending) messages.append(node('p','USION is thinking…','dialog-copy'));
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
  const description=node('p',config.hasServerKey
    ?'This site uses its server’s Gemini connection. You can chat without entering an API key.'
    :'Chat and Live Voice will be available once the site owner connects Gemini on the server.','dialog-copy');
  const status=node('p',config.model+' · Temperature '+temperature+' (maximum)','dialog-copy');
  if(projectBlocked)openDialog('Settings',description,status,node('p','Google has blocked this site’s Gemini project. The site owner can check project access in Google AI Studio.','dialog-copy'));
  else openDialog('Settings',description,status);
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
  openDialog('Token usage',node('p','Gemini-reported usage for this conversation. Input includes context sent with each request.','dialog-copy'),chart,total);
};
$('intro').onclick=()=>{
  const video=node('video');
  video.src='/intro.mp4';video.controls=true;video.playsInline=true;
  openDialog('Meet USION',video);
  video.play().catch(()=>{});
};
function transcriptFor(chat) {
  return ['# '+chat.title,'',...chat.messages.flatMap(message=>[
    '## '+(message.role==='user'?'You':'USION')+(message.voice?' · Live voice':''),'',message.text,
    ...(message.names?.length?['','Attachments: '+message.names.join(', ')]:[]),
    ...(message.usage?['','Tokens: '+number(message.usage.totalTokenCount)]:[]),''
  ]),'Total tokens: '+number(usageFor(chat).total)].join('\n');
}
$('share').onclick=async()=>{
  const chat=getChat();
  if(!chat)return;
  try {
    if(navigator.share)await navigator.share({title:chat.title,text:transcriptFor(chat)});
    else {await navigator.clipboard.writeText(transcriptFor(chat));toast('Transcript copied for sharing.');}
  } catch(error) {if(error.name!=='AbortError')toast('Sharing is unavailable. You can export the transcript instead.');}
};
$('export').onclick=()=>{
  const chat=getChat();if(!chat)return;
  const url=URL.createObjectURL(new Blob([transcriptFor(chat)],{type:'text/markdown;charset=utf-8'}));
  const link=node('a');link.href=url;link.download='usion-'+(chat.title.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')||'transcript').slice(0,48)+'.md';
  link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
};
document.querySelectorAll('[data-prompt]').forEach(button=>button.onclick=()=>{$('prompt').value=button.dataset.prompt;$('prompt').focus();});
$('suggest-file').onclick=$('attach').onclick=()=>$('files').click();
function renderAttachments() {
  $('attachments').replaceChildren(...files.map((file,index)=>{
    const chip=node('span','','chip');
    const remove=action('×',()=>{files.splice(index,1);renderAttachments();});
    remove.setAttribute('aria-label','Remove '+file.name);
    chip.append(icon('file'),file.name,remove);
    return chip;
  }));
}
$('files').onchange=async()=>{
  const selection=[...$('files').files];
  $('files').value='';
  const destination=files;
  readingFiles=true;$('send').disabled=true;
  try {
    for (const file of selection) {
      if(destination.length>=4||destination.reduce((sum,item)=>sum+item.size,0)+file.size>5*1024*1024){toast('Attach up to four files, totaling 5 MB.');break;}
      const extension=file.name.toLowerCase().split('.').pop();
      const type={pdf:'application/pdf',png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',webp:'image/webp',txt:'text/plain',md:'text/plain',csv:'text/plain',json:'text/plain'}[extension];
      if(!type){toast('Choose a PDF, image, or plain-text document.');continue;}
      if(type==='text/plain'&&file.size>1500000){toast('Text documents can be up to 1.5 MB.');continue;}
      const data=type==='text/plain'?await file.text():await new Promise((resolve,reject)=>{
        const reader=new FileReader();reader.onerror=reject;reader.onload=()=>resolve(reader.result.split(',')[1]);reader.readAsDataURL(file);
      });
      if(data) destination.push({name:file.name,mime:type,data,size:file.size});
      else toast('The attachment is empty.');
    }
  } catch {toast('The attachment could not be read.');}
  finally{readingFiles=false;$('send').disabled=pending;renderAttachments();}
};
async function sendChat(chat) {
  if(pending)return;
  if(!config.hasServerKey){settings();return;}
  pending=true;chat.pending=true;delete chat.failed;render(current===chat.id);
  try {
    let contextSize=0;
    const messages=[];
    for (const message of chat.messages.slice(-100).reverse()) {
      const item={role:message.role,text:message.text,files:fileCache.get(message.id)};
      const size=JSON.stringify(item).length;
      if(contextSize+size>11000000)break;
      contextSize+=size;
      messages.unshift(item);
    }
    while(messages[0]?.role==='model')messages.shift();
    const result=await api('chat',{messages});
    chat.messages.push({role:'model',text:result.reply,usage:result.usage});
    temperature=result.temperature;
    projectBlocked=false;
  } catch(error) {
    chat.failed={message:error.message,code:error.code};
    if(error.code==='GEMINI_PROJECT_UNAVAILABLE')projectBlocked=true;
  }
  finally {
    pending=false;delete chat.pending;save();render(current===chat.id);
  }
}
$('composer').onsubmit=event=>{
  event.preventDefault();
  if(pending||readingFiles)return;
  const text=$('prompt').value.trim()||(files.length?'Please help me understand the attached material.':'');
  if(!text)return;
  if(!config.hasServerKey){settings();return;}
  const chat=getChat()||createChat(text);
  if(chat.failed) {
    toast('Retry the previous message or start a new chat.');
    return;
  }
  const id=crypto.randomUUID();
  if(files.length)fileCache.set(id,files);
  chat.messages.push({id,role:'user',text,names:files.map(file=>file.name)});
  files=[];$('prompt').value='';save();sendChat(chat);
};
$('prompt').onkeydown=event=>{
  if(event.key==='Enter'&&!event.shiftKey&&!event.isComposing){event.preventDefault();$('composer').requestSubmit();}
};
function highlight() {
  const query=$('findbar').hidden?'':$('find-input').value.trim();
  const marks=[];
  if(query){
    const escaped=query.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
    const regex = new RegExp(escaped,'gi');
    const walker=document.createTreeWalker($('messages'),NodeFilter.SHOW_TEXT);
    const candidates=[];
    while(walker.nextNode())if(walker.currentNode.parentElement.closest('.message-body'))candidates.push(walker.currentNode);
    for(const text of candidates){
      const hits=[...text.data.matchAll(regex)];
      if(!hits.length)continue;
      const fragment=document.createDocumentFragment();
      let offset=0;
      for (const hit of hits) {
        const mark=node('mark',hit[0]);
        fragment.append(text.data.slice(offset,hit.index),mark);
        offset=hit.index+hit[0].length;
        marks.push(mark);
      }
      fragment.append(text.data.slice(offset));text.replaceWith(fragment);
    }
  }
  if(marks.length)match=(match+marks.length)%marks.length;
  marks[match]?.classList.add('active');
  $('find-count').textContent=marks.length?`${match+1} of ${marks.length}`:query?'0 matches':'';
  $('prev').disabled=$('next').disabled=!marks.length;
}
function openFind() {
  if(!getChat())return;
  $('findbar').hidden=false;renderMessages(getChat());$('find-input').focus();
}
function findMove(direction) {
  const marks=[...$('messages').querySelectorAll('mark')];
  if(!marks.length)return;
  marks[match]?.classList.remove('active');
  match=(match+direction+marks.length)%marks.length;
  marks[match].classList.add('active');
  marks[match].scrollIntoView({block:'center'});
  $('find-count').textContent=`${match+1} of ${marks.length}`;
}
$('find').onclick=openFind;
$('find-input').oninput=()=>{match=0;renderMessages(getChat());$('messages').querySelector('mark.active')?.scrollIntoView({block:'center'});};
$('find-input').onkeydown=event=>{if(event.key==='Enter')findMove(event.shiftKey?-1:1);};
$('next').onclick=()=>findMove(1);
$('prev').onclick=()=>findMove(-1);
$('close-find').onclick=()=>{$('findbar').hidden=true;$('find-input').value='';renderMessages(getChat());$('find').focus();};
$('search').onclick=()=>{
  const input=node('input');input.type='search';input.placeholder='Search titles and messages';input.setAttribute('aria-label','Search titles and messages');
  const results=node('div');
  const update=()=>{
    const query=input.value.trim().toLowerCase();
    const matches=chats.filter(chat=>chat.title.toLowerCase().includes(query)||chat.messages.some(message=>message.text.toLowerCase().includes(query)));
    results.replaceChildren(...matches.map(chat=>action(chat.title,()=>{
      choose(chat.id);$('modal').close();
      if(query){$('find-input').value=input.value.trim();openFind();$('messages').querySelector('mark.active')?.scrollIntoView({block:'center'});}
    },'result')));
    if(!matches.length)results.append(node('p','No matching conversations.','dialog-copy'));
  };
  input.oninput=update;update();openDialog('Search chats',input,results);input.focus();
};
document.addEventListener('keydown',event=>{
  if($('modal').open)return;
  if(event.altKey&&event.key.toLowerCase()==='n'){event.preventDefault();newChat();}
  if((event.metaKey||event.ctrlKey)&&event.key==='f'&&getChat()){event.preventDefault();openFind();}
  if(event.key==='Escape')closeSidebar();
});
$('dictate').onclick=()=>{
  if(recording){recording.stop();return;}
  const Recognition=window.SpeechRecognition||window.webkitSpeechRecognition;
  if(!Recognition){toast('Dictation needs browser speech recognition. Live voice also accepts speech directly.');return;}
  const speech=new Recognition();
  speech.lang=navigator.language;speech.interimResults=false;speech.continuous=true;
  speech.onstart=()=>{recording=speech;$('dictate').setAttribute('aria-pressed','true');toast('Listening. Say “send message” to send.');};
  speech.onend=()=>{recording=null;$('dictate').setAttribute('aria-pressed','false');};
  speech.onerror=event=>toast('Dictation: '+event.error.replaceAll('-',' ')+'.');
  speech.onresult=event=>{
    for(let index=event.resultIndex;index<event.results.length;index++){
      const text=event.results[index][0].transcript.trim();
      const command=text.match(/^(.*?)\s*\bsend message[.!?]?$/i);
      if(command){
        if(command[1])$('prompt').value+=($('prompt').value?' ':'')+command[1];
        speech.stop();$('composer').requestSubmit();break;
      }
      $('prompt').value+=($('prompt').value?' ':'')+text;
    }
  };
  try{speech.start();}catch{toast('Dictation could not start.');}
};
function switchProfile(next) {
  if(pending){toast('Wait for the current response before switching accounts.');return;}
  profile=next;
  sessionStorage.setItem('usion.profile',JSON.stringify(next));
  chats=restoreChats(profile?.id);
  fileCache.clear();
  newChat();
  $('modal').close();
}
let googleScript;
$('account').onclick=async()=>{
  if(profile){
    openDialog('Your account',node('p',profile.email||profile.name,'dialog-copy'),action('Sign out',()=>{window.google?.accounts.id.disableAutoSelect();switchProfile(null);},'dialog-action'));
    return;
  }
  if(!config.googleClientId){
    openDialog('Sign in with Google',node('p','This installation needs a Google OAuth Web client ID in GOOGLE_CLIENT_ID. See the project setup guide.','dialog-copy'));
    return;
  }
  const container=node('div');
  const status=node('p','Chat history is kept in this browser for each account.','dialog-copy');
  openDialog('Sign in with Google',status,container);
  try{
    if(!window.google?.accounts?.id){
      googleScript??=new Promise((resolve,reject)=>{
        const script=node('script');script.src='https://accounts.google.com/gsi/client';script.async=true;
        script.onload=resolve;script.onerror=()=>{script.remove();googleScript=null;reject();};
        document.head.append(script);
      });
      await googleScript;
    }
    google.accounts.id.initialize({client_id:config.googleClientId,callback:async({credential})=>{
      try{switchProfile(await api('google',{credential}));}catch(error){status.textContent=error.message;}
    }});
    google.accounts.id.renderButton(container,{theme:'filled_black',size:'large',text:'signin_with'});
  }catch{status.textContent='Google sign-in could not load.';}
};
function showLive() {
  if(activeLive)return;
  const stage=node('div','','voice-stage');
  const orbit=node('div','','orbit');
  orbit.setAttribute('aria-hidden','true');
  const orb=node('div','','orb');
  orbit.append(orb);
  const status=node('p','Speak with USION in real time.','dialog-copy voice-status');
  status.setAttribute('role','status');
  const caption=node('p','','voice-caption');
  caption.hidden=true;
  const start=action('Start conversation',()=>{
    if(!config.hasServerKey){settings();return;}
    if(pending){toast('Wait for the current response before starting live voice.');return;}
    recording?.stop();
    status.textContent='Connecting to Gemini and requesting microphone access…';
    stage.dataset.state='connecting';
    caption.hidden=false;
    start.replaceWith(action('End session',()=>$('modal').close(),'dialog-action'));
    connectLive(stage,orb,status,caption);
  },'dialog-action');
  stage.append(orbit,status,caption,start);
  openDialog('Live with USION',stage);
  $('modal').dataset.view='voice';
}
$('hero-live').onclick=$('live').onclick=showLive;
function connectLive(stage,orb,status,caption) {
  let chat=getChat();
  const control=startLive({
    authorize:()=>api('live'),
    onStatus:(text,connected)=>{
      status.textContent=text;
      stage.dataset.state=connected?'listening':'ended';
    },
    onActivity:(state,level)=>{
      stage.dataset.state=state;
      orb.style.setProperty('--level',String(level));
    },
    onCaption:(text)=>{caption.textContent=text;caption.scrollTop=caption.scrollHeight;},
    onTurn:({input,output,usage})=>{
      if(!input&&!output&&!usage)return;
      chat??=createChat('Live voice');
      if(input)chat.messages.push({role:'user',text:input,voice:true});
      if(output||usage)chat.messages.push({role:'model',text:output||'',usage,voice:true});
      save();render(current===chat.id);
    },
    onEnd:()=>{if(activeLive===control)activeLive=null;}
  });
  activeLive=control;
}
fetch('/api/config').then(response=>response.json()).then(data=>{config=data;render();}).catch(()=>{});
render();
