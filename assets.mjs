const types = {html:'text/html; charset=utf-8',css:'text/css; charset=utf-8',js:'text/javascript; charset=utf-8',svg:'image/svg+xml',webp:'image/webp',mp4:'video/mp4',mp3:'audio/mpeg',png:'image/png',jpg:'image/jpeg'};
function serveAsset(request) {
  const name = fileMap[new URL(request.url).pathname];
  if (!name || !Object.hasOwn(sources,name)) return new Response('Not found',{status:404});
  if (!['GET','HEAD'].includes(request.method)) return new Response('Method not allowed',{status:405});
  const extension = name.split('.').at(-1);
  const bytes = Uint8Array.from(atob(sources[name]),char=>char.charCodeAt(0));
  const headers = {'Content-Type':types[extension],'Cache-Control':extension==='html'?'no-cache':'public, max-age=3600','X-Content-Type-Options':'nosniff','Referrer-Policy':'strict-origin-when-cross-origin'};
  let start=0,end=bytes.length-1,status=200;
  if (['mp4','mp3'].includes(extension)) {
    headers['Accept-Ranges']='bytes';
    const range=request.headers.get('range');
    if (range) {
      const match=range.match(/^bytes=(\d*)-(\d*)$/);
      if(!match||!match[1]&&!match[2]) return new Response(null,{status:416,headers:{'Content-Range':'bytes */'+bytes.length}});
      start=match[1]?Number(match[1]):Math.max(0,bytes.length-Number(match[2]));
      end=match[1]&&match[2]?Math.min(end,Number(match[2])):end;
      if(start>end||start>=bytes.length) return new Response(null,{status:416,headers:{'Content-Range':'bytes */'+bytes.length}});
      status=206;headers['Content-Range']=`bytes ${start}-${end}/${bytes.length}`;
    }
  }
  headers['Content-Length']=String(end-start+1);
  return new Response(request.method==='HEAD'?null:bytes.subarray(start,end+1),{status,headers});
}
