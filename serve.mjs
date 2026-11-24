import {createServer} from 'node:http';
import {Readable} from 'node:stream';
import './build.mjs';

const {default:worker}=await import('./dist/server/index.js');
const port=Number(process.env.PORT||4173);
const base='http://localhost:'+port;
createServer(async (incoming,outgoing)=>{
  try {
    const method=incoming.method;
    const body=['GET','HEAD'].includes(method)?undefined:Readable.toWeb(incoming);
    const request=new Request(new URL(incoming.url,base),{method,headers:incoming.headers,body,duplex:'half'});
    const response=await worker.fetch(request,process.env);
    outgoing.writeHead(response.status,Object.fromEntries(response.headers));
    if(response.body)Readable.fromWeb(response.body).pipe(outgoing);
    else outgoing.end();
  } catch {
    outgoing.writeHead(500).end('Server error');
  }
}).listen(port,'127.0.0.1',()=>console.log('Rosogolla is running at '+base));
