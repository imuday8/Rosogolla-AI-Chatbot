const api = 'https://generativelanguage.googleapis.com';
const instruction = 'You are USION, a thoughtful, creative AI assistant powered by Gemini. Respond in the language the user is speaking unless they request another language.';
const json = (body, status = 200) => Response.json(body, {status, headers: {'Cache-Control':'no-store'}});
const problem = (message, status) => json({error:message}, status);
const mime = new Set(['application/pdf','image/png','image/jpeg','image/webp']);
const defaultModel = 'gemini-3.8-flash';
const defaultLive = 'gemini-3.8-live';
const decode = value => Uint8Array.from(atob(value.replace(/-/g,'+').replace(/_/g,'/')), char => char.charCodeAt(0));
const utf8 = new TextDecoder();
const temperatureCache = new Map();
let googleKeys;

async function googleProfile(credential, clientId) {
  if (!clientId || typeof credential !== 'string' || credential.length > 12000) throw new Error();
  const pieces = credential.split('.');
  if (pieces.length !== 3) throw new Error();
  const [head, payload, signature] = pieces;
  const header = JSON.parse(utf8.decode(decode(head)));
  const claims = JSON.parse(utf8.decode(decode(payload)));
  if (header.alg !== 'RS256' || typeof claims.exp !== 'number' || claims.exp * 1000 <= Date.now() ||
      !['accounts.google.com','https://accounts.google.com'].includes(claims.iss) ||
      claims.aud !== clientId || !claims.sub) throw new Error();
  if (!googleKeys || googleKeys.until < Date.now() || !googleKeys.keys.some(key => key.kid === header.kid)) {
    const response = await fetch('https://www.googleapis.com/oauth2/v3/certs');
    if (!response.ok) throw new Error();
    googleKeys = {keys:(await response.json()).keys,until:Date.now()+300000};
  }
  const key = googleKeys.keys.find(item => item.kid === header.kid);
  if (!key) throw new Error();
  const publicKey = await crypto.subtle.importKey('jwk', key, {name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'}, false, ['verify']);
  if (!await crypto.subtle.verify('RSASSA-PKCS1-v1_5', publicKey, decode(signature), new TextEncoder().encode(head+'.'+payload))) throw new Error();
  return {id:claims.sub,name:claims.name||claims.email||'Google user',email:claims.email||''};
}

async function gemini(path,key,body) {
  const headers = {'x-goog-api-key':key};
  if (body) headers['Content-Type'] = 'application/json';
  const response = await fetch(api + path, {headers, method:body?'POST':'GET',body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(90000)});
  const data = await response.json();
  return {data,status:response.status,ok:response.ok};
}
const upstreamError = response => problem(
  String(response.data.error?.message ?? 'Gemini could not complete this request.'),
  response.status >= 400 && response.status <= 599 ? response.status : 502
);

async function modelTemperature(model,key,verify=false) {
  const cached = temperatureCache.get(model);
  if (!verify && cached?.until > Date.now()) return {value:cached.value};
  const result = await gemini('/v1beta/models/' + model,key);
  if (!result.ok) return verify ? {error:upstreamError(result)} : {value:cached?.value ?? 2};
  const value = result.data.maxTemperature ?? 2;
  temperatureCache.set(model,{value,until:Date.now()+3600000});
  return {value};
}

function parseMessages(messages) {
  if (!Array.isArray(messages) || messages.length < 1 || messages.length > 100) return;
  const contents = [];
  for (const message of messages) {
    if (!message || !['user','model'].includes(message.role) || typeof message.text !== 'string' || message.text.length > 200000) return;
    const parts = message.text ? [{text:message.text}] : [];
    if (message.role === 'user' && message.files !== undefined) {
      if (!Array.isArray(message.files) || message.files.length > 4) return;
      for (const file of message.files) {
        if (!file || typeof file.data !== 'string') return;
        if (file.mime === 'text/plain') {
          if (file.data.length > 1500000) return;
          parts.push({text:'Attached file: '+String(file.name).slice(0,150)+'\n'+file.data});
        } else {
          if (!mime.has(file.mime) || file.data.length > 7200000 || !/^[a-zA-Z0-9+/=]+$/.test(file.data)) return;
          parts.push({inlineData:{mimeType:file.mime,data:file.data}});
        }
      }
    }
    if (parts.length) contents.push({role:message.role,parts});
  }
  return contents.length && contents.at(-1).role === 'user' ? contents : undefined;
}

export default {async fetch(request, env={}) {
  const url = new URL(request.url);
  const path = url.pathname;
  const model = env.GEMINI_CHAT_MODEL || defaultModel;
  const liveModel = env.GEMINI_LIVE_MODEL || defaultLive;
  if (!path.startsWith('/api/')) return env.ASSETS ? env.ASSETS.fetch(request) : new Response('Not found',{status:404});
  if (path === '/api/config' && request.method === 'GET') return json({model,liveModel,hasServerKey:!!env.GEMINI_API_KEY,googleClientId:env.GOOGLE_CLIENT_ID || ''});
  if (request.method !== 'POST') return problem('Method not allowed.',405);
  if (request.headers.get('sec-fetch-site') === 'cross-site' || !request.headers.get('content-type')?.startsWith('application/json')) return problem('Invalid request.',403);
  if (Number(request.headers.get('content-length')) > 12000000) return problem('Attachments exceed the request limit.',413);
  try {
    if (path === '/api/google') {
      try {return json(await googleProfile((await request.json()).credential,env.GOOGLE_CLIENT_ID));}
      catch {return problem('Google sign-in could not be verified.',401);}
    }
    const key = request.headers.get('x-usion-gemini-key') || env.GEMINI_API_KEY;
    if (!key) return problem('Connect a Gemini API key in Settings first.',401);
    if (key.length > 300) return problem('Check your Gemini API key.',400);
    if (path === '/api/connect') {
      const temperature = await modelTemperature(model,key,true);
      return temperature.error || json({model,temperature:temperature.value});
    }
    if (path === '/api/live') {
      const temperature = await modelTemperature(liveModel,key);
      const setup = {model:'models/'+liveModel,generationConfig:{responseModalities:['AUDIO'],temperature:temperature.value},
        inputAudioTranscription:{},outputAudioTranscription:{},systemInstruction:{parts:[{text:instruction}]}};
      const result = await gemini('/v1alpha/auth_tokens',key,{
        uses:1,expireTime:new Date(Date.now()+30*60000).toISOString(),
        newSessionExpireTime:new Date(Date.now()+60000).toISOString(),
        bidiGenerateContentSetup:setup
      });
      return result.ok ? json({token:result.data.name,setup}) : upstreamError(result);
    }
    if (path === '/api/chat') {
      const body = await request.text();
      if (body.length > 12000000) return problem('Attachments exceed the request limit.',413);
      const contents = parseMessages(JSON.parse(body).messages);
      if (!contents) return problem('Check the message and supported attachment formats.',400);
      const {value:temperature} = await modelTemperature(model,key);
      const result = await gemini('/v1beta/models/'+model+':generateContent',key,{contents,systemInstruction:{parts:[{text:instruction}]},generationConfig:{temperature}});
      if (!result.ok) return upstreamError(result);
      const candidate = result.data.candidates?.[0];
      const reply = candidate?.content?.parts?.filter(part=>!part.thought).map(part=>part.text||'').join('');
      return json({reply:reply || ('Gemini returned no text. ' + (result.data.promptFeedback?.blockReason ?? candidate?.finishReason ?? '')).trim(),
        usage:result.data.usageMetadata || null,temperature});
    }
    return problem('Not found.',404);
  } catch (error) {
    if (error instanceof SyntaxError || error instanceof TypeError && /null|undefined/.test(error.message)) return problem('Invalid request data.',400);
    return problem('The service could not be reached. Try again.',502);
  }
}};
