import {mkdir,readFile,writeFile} from 'node:fs/promises';

const files = {
  '/':'index.html','/index.html':'index.html','/style.css':'style.css',
  '/app.js':'app.js','/live.js':'live.js','/orb.webp':'orb.webp','/intro.mp4':'intro.mp4'
};
const sources = Object.fromEntries(await Promise.all([...new Set(Object.values(files))].map(async name=>[
  name,(await readFile(new URL('./public/'+name,import.meta.url))).toString('base64')
])));
const worker = (await readFile(new URL('./worker.mjs',import.meta.url),'utf8')).replace('export default {async fetch','const worker = {async fetch');
const assets = await readFile(new URL('./assets.mjs',import.meta.url),'utf8');
const output = new URL('./dist/server/',import.meta.url);
await mkdir(output,{recursive:true});
await writeFile(new URL('index.js',output),`const fileMap = ${JSON.stringify(files)};
const sources = ${JSON.stringify(sources)};
${assets}
${worker}
export default {fetch(request,env) {
  return worker.fetch(request,{...env,ASSETS:{fetch:serveAsset}});
}};
`);
