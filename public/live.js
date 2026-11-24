const audioEndpoint='wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContentConstrained';
function formatSamples(samples,sampleRate){
  const ratio=sampleRate/16000;
  const count=Math.floor(samples.length/ratio);
  const bytes=new Uint8Array(count*2);
  const view=new DataView(bytes.buffer);
  for(let i=0;i<count;i++){
    let sum=0;
    const from=Math.floor(i*ratio),to=Math.max(from+1,Math.floor((i+1)*ratio));
    for(let j=from;j<to;j++)sum+=samples[j];
    const sample=Math.max(-1,Math.min(1,sum/(to-from)));
    view.setInt16(i*2,sample*(sample<0?32768:32767),true);
  }
  return btoa(String.fromCharCode(...bytes));
}
function audioLevel(samples) {
  let energy=0;
  for (const value of samples) energy+=value*value;
  return Math.min(1,Math.sqrt(energy/Math.max(1,samples.length))*6);
}
export function startLive({authorize,onStatus,onTurn,onEnd,onActivity=()=>{},onCaption=()=>{}}){
  let socket,context,stream,microphone,processor;
  let ended=false, ready=false, nextTime=0, timeout;
  let input='',output='',usage=null;
  const playing=new Set();
  function flush(){
    if(input||output||usage)onTurn({input:input.trim(),output:output.trim(),usage});
    input='';output='';usage=null;
  }
  function interrupt(){
    for(const source of playing)source.stop();
    playing.clear();
    nextTime=0;
  }
  function stop(message='Live session ended.'){
    if(ended)return;
    ended=true;
    clearTimeout(timeout);
    socket?.close();
    processor?.disconnect();
    microphone?.disconnect();
    stream?.getTracks().forEach(track=>track.stop());
    interrupt();
    context?.close().catch(()=>{});
    flush();
    onStatus(message,false);
    onEnd();
  }
  function play(part){
    const raw=atob(part.data);
    const sampleRate=Number(part.mimeType.match(/rate=(\d+)/)?.[1]||24000);
    const buffer=context.createBuffer(1,Math.floor(raw.length/2),sampleRate);
    const samples=buffer.getChannelData(0);
    for(let i=0;i<samples.length;i++){
      const value=raw.charCodeAt(i*2)|(raw.charCodeAt(i*2+1)<<8);
      samples[i]=(value>=32768?value-65536:value)/32768;
    }
    const source=context.createBufferSource();
    source.buffer=buffer;
    source.connect(context.destination);
    source.onended=()=>{
      playing.delete(source);
      source.disconnect();
      if(!ended&&!playing.size)onActivity('listening',0);
    };
    playing.add(source);
    nextTime=Math.max(context.currentTime+.015,nextTime);
    source.start(nextTime);
    onActivity('speaking',audioLevel(samples));
    nextTime+=buffer.duration;
  }
  async function connect(){
    if(!navigator.mediaDevices?.getUserMedia)throw new Error('Microphone access requires HTTPS or localhost.');
    context=new AudioContext();
    await context.resume();
    if(ended)return;
    stream=await navigator.mediaDevices.getUserMedia({audio:{channelCount:1,echoCancellation:true,noiseSuppression:true,autoGainControl:true}});
    if(ended){stream.getTracks().forEach(track=>track.stop());return;}
    const {token,setup}=await authorize();
    if(ended)return;
    if(!token)throw new Error('Gemini did not issue a live session token.');
    socket=new WebSocket(audioEndpoint+'?access_token='+encodeURIComponent(token));
    socket.binaryType='arraybuffer';
    timeout=setTimeout(()=>stop('Gemini did not finish connecting. Close this window and try again.'),20000);
    socket.onopen=()=>socket.send(JSON.stringify({setup}));
    socket.onclose=event=>{
      const reason=event.reason?.trim();
      stop(reason?'Gemini Live: '+reason:ready?'Gemini disconnected.':'Could not connect to Gemini Live. Check the key and Live model access.');
    };
    socket.onerror=()=>stop('Could not connect to Gemini Live. Check the key and Live model access.');
    socket.onmessage=event=>{
      if(ended)return;
      try {
        const message=JSON.parse(typeof event.data==='string'?event.data:new TextDecoder().decode(event.data));
        if(message.error){stop(message.error.message||'Gemini Live returned an error.');return;}
        if(message.setupComplete&&!ready){
          ready=true;
          clearTimeout(timeout);
          microphone=context.createMediaStreamSource(stream);
          processor=context.createScriptProcessor(4096,1,1);
          microphone.connect(processor);
          processor.connect(context.destination);
          processor.onaudioprocess=event=>{
            if(ended||socket.readyState!==WebSocket.OPEN||socket.bufferedAmount>300000)return;
            const samples=event.inputBuffer.getChannelData(0);
            if(!playing.size)onActivity('listening',audioLevel(samples));
            const data=formatSamples(samples,context.sampleRate);
            socket.send(JSON.stringify({realtimeInput:{audio:{data,mimeType:'audio/pcm;rate=16000'}}}));
          };
          onStatus('Listening. Speak naturally or interrupt USION at any time.',true);
        }
        if(message.usageMetadata)usage=message.usageMetadata;
        const content=message.serverContent;
        if(content){
          if(content.interrupted)interrupt();
          if(content.inputTranscription?.text){
            input+=content.inputTranscription.text;
            if(!output)onCaption(input.trim());
          }
          if(content.outputTranscription?.text){
            output+=content.outputTranscription.text;
            onCaption(output.trim());
          }
          for(const part of content.modelTurn?.parts||[]){
            if(part.inlineData?.mimeType?.startsWith('audio/pcm'))play(part.inlineData);
          }
          if(content.turnComplete)flush();
        }
        if(message.goAway)onStatus('Gemini will end this session soon.',true);
      } catch {stop('Gemini sent an unexpected live response.');}
    };
  }
  Promise.resolve().then(connect).catch(error=>stop(error.name==='NotAllowedError'?'Microphone permission was denied.':error.message));
  return {stop};
}
