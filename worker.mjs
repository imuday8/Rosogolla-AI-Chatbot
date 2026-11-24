const api = 'https://openrouter.ai/api/v1';
const instruction = 'You are Rosogolla, a smart, warm, and helpful AI assistant. Always match the user’s exact language and script style: if the user writes in English, reply in English; if the user writes in Hinglish (Hindi written in Roman/English alphabet, like "kya haalchal", "bhai", "kaise ho"), always reply in natural, friendly Hinglish using the Roman/English script. Never switch to Devanagari Hindi script unless the user explicitly writes in Devanagari script. Keep your tone natural, helpful, and sweet.';
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization'
};
const json = (body, status = 200) => Response.json(body, {
  status,
  headers: {
    'Cache-Control': 'no-store',
    ...corsHeaders
  }
});
const problem = (message, status) => json({error:message}, status);
const mime = new Set(['application/pdf','image/png','image/jpeg','image/webp']);
const defaultModel = 'openrouter/free';
const decode = value => Uint8Array.from(atob(value.replace(/-/g,'+').replace(/_/g,'/')), char => char.charCodeAt(0));
const utf8 = new TextDecoder();
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

async function openrouter(path, key, body) {
  const headers = {
    'Authorization': 'Bearer ' + key,
    'HTTP-Referer': 'https://rosogolla.app',
    'X-Title': 'Rosogolla'
  };
  if (body) headers['Content-Type'] = 'application/json';
  const response = await fetch(api + path, {
    headers,
    method: body ? 'POST' : 'GET',
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(90000)
  });
  const data = await response.json();
  return {data, status: response.status, ok: response.ok};
}

function upstreamError(response) {
  const errObj = response.data.error;
  const message = typeof errObj === 'object'
    ? String(errObj?.message ?? 'OpenRouter could not complete this request.')
    : String(errObj ?? 'OpenRouter could not complete this request.');
  const status = response.status >= 400 && response.status <= 599 ? response.status : 502;
  const code = typeof errObj === 'object' ? errObj?.code : undefined;
  if (status === 402 || /insufficient.*credits|payment.*required|billing/i.test(message)) {
    return json({
      code: 'OPENROUTER_CREDITS_EXHAUSTED',
      error: 'OpenRouter credits have been exhausted. The site owner needs to add credits at openrouter.ai.'
    }, 402);
  }
  if (status === 429 || code === 'rate_limit_exceeded') {
    return json({
      code: 'OPENROUTER_RATE_LIMITED',
      error: 'Too many requests. Please wait a moment and try again.'
    }, 429);
  }
  if (status === 401 || code === 'invalid_api_key') {
    return json({
      code: 'OPENROUTER_AUTH_ERROR',
      error: 'The OpenRouter API key is invalid. The site owner needs to update it.'
    }, 401);
  }
  return problem(message, status);
}

function parseMessages(messages) {
  if (!Array.isArray(messages) || messages.length < 1 || messages.length > 100) return;
  const result = [];
  for (const message of messages) {
    if (!message || !['user','model'].includes(message.role) || typeof message.text !== 'string' || message.text.length > 200000) return;
    const role = message.role === 'model' ? 'assistant' : 'user';
    if (message.role === 'user' && message.files !== undefined) {
      if (!Array.isArray(message.files) || message.files.length > 4) return;
      const content = [];
      if (message.text) content.push({type: 'text', text: message.text});
      for (const file of message.files) {
        if (!file || typeof file.data !== 'string') return;
        if (file.mime === 'text/plain') {
          if (file.data.length > 1500000) return;
          content.push({type: 'text', text: 'Attached file: ' + String(file.name).slice(0, 150) + '\n' + file.data});
        } else {
          if (!mime.has(file.mime) || file.data.length > 7200000 || !/^[a-zA-Z0-9+/=]+$/.test(file.data)) return;
          content.push({type: 'image_url', image_url: {url: 'data:' + file.mime + ';base64,' + file.data}});
        }
      }
      if (content.length) result.push({role, content});
    } else {
      if (message.text) result.push({role, content: message.text});
    }
  }
  return result.length && result.at(-1).role === 'user' ? result : undefined;
}

export default {async fetch(request, env={}) {
  if (request.method === 'OPTIONS') {
    return new Response(null, {status: 204, headers: corsHeaders});
  }
  const url = new URL(request.url);
  const path = url.pathname;
  const model = env.OPENROUTER_MODEL || defaultModel;
  const liveVoiceProvider = env.VOICE_PROVIDER || '';
  if (!path.startsWith('/api/')) return env.ASSETS ? env.ASSETS.fetch(request) : new Response('Not found',{status:404});
  if (path === '/api/config' && request.method === 'GET') return json({
    model,
    liveModel: '',
    hasServerKey: !!env.OPENROUTER_API_KEY,
    googleClientId: env.GOOGLE_CLIENT_ID || '',
    liveVoiceEnabled: !!liveVoiceProvider
  });
  if (request.method !== 'POST') return problem('Method not allowed.',405);
  if (!request.headers.get('content-type')?.startsWith('application/json')) return problem('Invalid request.',403);
  if (Number(request.headers.get('content-length')) > 12000000) return problem('Attachments exceed the request limit.',413);
  try {
    if (path === '/api/google') {
      try {return json(await googleProfile((await request.json()).credential,env.GOOGLE_CLIENT_ID));}
      catch {return problem('Google sign-in could not be verified.',401);}
    }
    const key = env.OPENROUTER_API_KEY;
    if (!key) return problem('The site owner needs to configure an OpenRouter API key before chat can start.',503);
    if (path === '/api/connect') {
      const probe = await openrouter('/chat/completions', key, {
        model,
        messages: [{role: 'user', content: 'Reply with OK.'}],
        max_tokens: 16
      });
      if (!probe.ok) return upstreamError(probe);
      return json({model, temperature: 1});
    }
    if (path === '/api/live') {
      if (!liveVoiceProvider) {
        return json({
          code: 'LIVE_VOICE_UNAVAILABLE',
          error: 'Live voice is not available with OpenRouter. A compatible voice provider has not been configured.'
        }, 501);
      }
      return problem('Voice provider not implemented.', 501);
    }
    if (path === '/api/chat') {
      const body = await request.text();
      if (body.length > 12000000) return problem('Attachments exceed the request limit.',413);
      const openRouterMessages = parseMessages(JSON.parse(body).messages);
      if (!openRouterMessages) return problem('Check the message and supported attachment formats.',400);
      const result = await openrouter('/chat/completions', key, {
        model,
        messages: [
          {role: 'system', content: instruction},
          ...openRouterMessages
        ],
        temperature: 1
      });
      if (!result.ok) return upstreamError(result);
      const choice = result.data.choices?.[0];
      const reply = choice?.message?.content || '';
      const rawUsage = result.data.usage;
      const usage = rawUsage ? {
        promptTokenCount: rawUsage.prompt_tokens ?? 0,
        candidatesTokenCount: rawUsage.completion_tokens ?? 0,
        thoughtsTokenCount: 0,
        totalTokenCount: rawUsage.total_tokens ?? (rawUsage.prompt_tokens ?? 0) + (rawUsage.completion_tokens ?? 0)
      } : null;
      return json({
        reply: reply || ('The model returned no text. ' + (choice?.finish_reason ?? '')).trim(),
        usage,
        temperature: 1
      });
    }
    return problem('Not found.',404);
  } catch (error) {
    if (error instanceof SyntaxError || error instanceof TypeError && /null|undefined/.test(error.message)) return problem('Invalid request data.',400);
    return problem('The service could not be reached. Try again.',502);
  }
}};
