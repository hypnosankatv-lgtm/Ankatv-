const SITE = 'https://diziizle.cafe';
const CACHE_TTL = 86400;
const CACHE_RETRY = 300;
const MAX_HTML_BYTES = 5 * 1024 * 1024;
const CATEGORIES = [
  ['Aile','aile'], ['Aksiyon','aksiyon'], ['Aksiyon & Macera','aksiyon-macera'],
  ['Animasyon','animasyon'], ['Belgesel','belgesel'],
  ['Bilim Kurgu & Fantazi','bilim-kurgu-fantastik'], ['Bilim-Kurgu','bilim-kurgu'],
  ['Çocuklar','cocuklar'], ['Dram','dram'], ['Fantastik','fantastik'],
  ['Gerçeklik','reality'], ['Gizem','gizem'], ['Komedi','komedi'],
  ['Macera','macera'], ['Savaş','savas'], ['Savaş & Politik','savas-politika'],
  ['Suç','suc'], ['Talk','talk'], ['Vahşi Batı','western']
];
function json(data, status=200) {
  return new Response(JSON.stringify(data, null, 2), {
    status, headers: {'Content-Type':'application/json; charset=utf-8','X-Content-Type-Options':'nosniff','Cache-Control':'no-store'}
  });
}
function cleanText(s) {
  return String(s ?? '').replace(/\s+/gu,' ').trim();
}
function decodeEntities(s) {
  return String(s ?? '').replace(/&(#(?:x[0-9a-f]+|\d+)|amp|quot|apos|lt|gt|nbsp|hellip|ndash|mdash|rsquo|lsquo|ldquo|rdquo);/gi, (_,e) => {
    const named={amp:'&',quot:'"',apos:"'",lt:'<',gt:'>',nbsp:' ',hellip:'…',ndash:'–',mdash:'—',rsquo:'’',lsquo:'‘',ldquo:'“',rdquo:'”'};
    if (e[0]==='#') {const n=e[1]?.toLowerCase()==='x'?parseInt(e.slice(2),16):parseInt(e.slice(1),10);return Number.isInteger(n)&&n>0&&n<=0x10ffff?String.fromCodePoint(n):'';}
    return named[e.toLowerCase()]??_;
  });
}
function text(s){return cleanText(decodeEntities(decodeEntities(s)));}
function absoluteUrl(value) {
  const s=decodeEntities(value).trim();
  if (!s || /^(data|blob|javascript):/i.test(s)) return '';
  try { const u=new URL(s,SITE+'/');return /^https?:$/.test(u.protocol)?u.href:''; } catch {return '';}
}
function allowedUrl(url) {
  try {const u=new URL(url);return u.protocol==='https:'&&u.hostname==='diziizle.cafe'&&!u.username&&!u.password&&!u.port;}catch{return false;}
}
function imageCandidate(value,srcset=false) {
  const raw=srcset?String(value||'').split(',')[0].trim().split(/\s+/)[0]:value;
  return absoluteUrl(raw);
}
function getImage(el) {
  for(const a of ['data-src','data-original','data-lazy-src','data-srcset','srcset','src']) {
    const v=el.getAttribute(a);
    if(v){const u=imageCandidate(v,a.includes('srcset'));if(u)return u;}
  }
  return '';
}
function imdb(s){const m=String(s||'').match(/(?:10(?:[.,]0)?|[0-9](?:[.,][0-9])?)/);return m?m[0].replace(',','.'):'';}
function positiveInt(s){if(!/^\d+$/.test(String(s??'')))return null;const n=Number(s);return Number.isSafeInteger(n)&&n>0?n:null;}
function apiLink(base,params){const u=new URL(base);for(const [k,v] of Object.entries(params))u.searchParams.set(k,String(v));return u.href;}
function episodeApi(base,slug,season,episode){return apiLink(base,{dizi:slug,sezon:season,bolum:episode});}
function safePath(href){try{return new URL(decodeEntities(href),SITE).pathname;}catch{return '';}}
async function sha256(s){const b=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s));return Array.from(new Uint8Array(b),x=>x.toString(16).padStart(2,'0')).join('');}
async function downloadHtml(url) {
  if(!allowedUrl(url))return '';
  try {
    const res=await fetch(url,{redirect:'manual',headers:{'User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0 Safari/537.36','Accept':'text/html,application/xhtml+xml','Accept-Language':'tr-TR,tr;q=0.9,en;q=0.8'},signal:AbortSignal.timeout(25000)});
    const ct=res.headers.get('content-type')||'';
    if(!res.ok||(ct&&!/text\/html|application\/xhtml\+xml/i.test(ct)))return '';
    const length=Number(res.headers.get('content-length')||0);
    if(length>MAX_HTML_BYTES)return '';
    const reader=res.body?.getReader();if(!reader)return '';
    const chunks=[];let size=0;
    while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>MAX_HTML_BYTES){await reader.cancel();return '';}chunks.push(value);}
    const all=new Uint8Array(size);let offset=0;for(const c of chunks){all.set(c,offset);offset+=c.length;}
    return new TextDecoder('utf-8').decode(all);
  }catch{return '';}
}
async function getPageHtml(url,refresh,env) {
  if(!allowedUrl(url))return '';
  const kv=env.DIZI_CACHE;
  if(!kv||typeof kv.get!=='function')return downloadHtml(url);
  const hash=await sha256(url), key='html:'+hash, retryKey='retry:'+hash;
  let stale=null;
  try {
    const raw=await kv.get(key,'json');
    if(raw&&typeof raw.html==='string'&&raw.html){stale=raw.html;if(!refresh&&Date.now()-Number(raw.time||0)<CACHE_TTL*1000)return stale;}
    if(!refresh&&await kv.get(retryKey))return stale||'';
  }catch{}
  const html=await downloadHtml(url);
  if(html){try{await kv.put(key,JSON.stringify({html,time:Date.now()}),{expirationTtl:Math.max(CACHE_TTL*7,604800)});await kv.delete(retryKey);}catch{}return html;}
  try{await kv.put(retryKey,'1',{expirationTtl:CACHE_RETRY});}catch{}
  return stale||'';
}
class TreeNode {
  constructor(tag='',attrs={},parent=null){this.tag=tag;this.attrs=attrs;this.parent=parent;this.children=[];this.parts=[];}
  attr(k){return this.attrs[k]||'';}
  allText(){return this.parts.map(p=>typeof p==='string'?p:p.allText()).join('');}
  descendants(test){const out=[];for(const c of this.children){if(test(c))out.push(c);out.push(...c.descendants(test));}return out;}
  first(test){for(const c of this.children){if(test(c))return c;const x=c.first(test);if(x)return x;}return null;}
}
class NodeBuilder {
  constructor(){this.root=new TreeNode('root');this.stack=[this.root];}
  element(el){const attrs={};for(const name of ['href','class','src','data-src','data-original','data-lazy-src','data-srcset','srcset']){const v=el.getAttribute(name);if(v!==null)attrs[name]=v;}
    const parent=this.stack[this.stack.length-1],node=new TreeNode(el.tagName.toLowerCase(),attrs,parent);parent.children.push(node);parent.parts.push(node);if(!['area','base','br','col','embed','hr','img','input','link','meta','param','source','track','wbr'].includes(node.tag))this.stack.push(node);}
  characters(t){this.stack[this.stack.length-1].parts.push(t.text);}
  end(){if(this.stack.length>1)this.stack.pop();}
}
// HTMLRewriter parses source HTML; selectors capture only relevant tags to reduce work.
async function parseHtml(html) {
  if(!html)return null;
  const builder=new NodeBuilder();
  const rewriter=new HTMLRewriter().on('*',{
    element(el){builder.element(el);if(!['area','base','br','col','embed','hr','img','input','link','meta','param','source','track','wbr'].includes(el.tagName.toLowerCase()))el.onEndTag(()=>builder.end());},
    text(t){builder.characters(t);}
  });
  await rewriter.transform(new Response(html,{headers:{'content-type':'text/html; charset=utf-8'}})).arrayBuffer();
  return builder.root;
}
const isTag=(tag)=>(n)=>n.tag===tag;
function hasClass(n,c){return n.attr('class').split(/\s+/).includes(c);}
function nodeImage(node){const candidates=node.descendants(n=>n.tag==='img'||n.tag==='source');for(const n of candidates){const u=getImage({getAttribute:(k)=>n.attrs[k]??null});if(u)return u;}return '';}
function firstText(node,test){const n=node.first(test);return n?text(n.allText()):'';}
function findSeriesCards(root){return root.descendants(n=>n.tag==='a'&&n.attr('href').includes('/dizi/')&&n.first(isTag('h3')));}
async function getSeries(slug,page,refresh,env,base){
  const u=new URL('/diziler',SITE);u.searchParams.set('tur',slug);u.searchParams.set('sirala','populer');u.searchParams.set('page',String(page));
  const root=await parseHtml(await getPageHtml(u.href,refresh,env));if(!root)return [];
  const result=[],seen=new Set();
  for(const card of findSeriesCards(root)){
    const m=safePath(card.attr('href')).match(/^\/dizi\/([a-zA-Z0-9_-]+)\/?$/);if(!m||seen.has(m[1]))continue;
    const name=firstText(card,isTag('h3'));if(!name)continue;
    const h3=card.first(isTag('h3'));let year='';
    if(h3&&h3.parent){const siblings=h3.parent.children;const i=siblings.indexOf(h3);for(let j=i+1;j<siblings.length;j++){if(siblings[j].tag==='p'){year=text(siblings[j].allText());break;}}}
    if(!/^(19|20)\d{2}$/.test(year))year='';
    result.push({link:apiLink(base,{dizi:m[1]}),resim:nodeImage(card),isim:name,imdb:imdb(firstText(card,n=>n.tag==='span'&&hasClass(n,'badge-rating'))),yil:year});seen.add(m[1]);
  }
  return result;
}
function seasonNumbers(root,slug){
  const nums=new Set();
  for(const n of root.descendants(n=>n.tag==='a'&&(/sezon=|\/sezon-/.test(n.attr('href'))))){
    const href=decodeEntities(n.attr('href'));let u;try{u=new URL(href,SITE);}catch{continue;}
    const match=u.pathname.match(new RegExp('^/dizi/'+slug+'/sezon-(\\d+)/bolum-\\d+/?$'));
    if(match){const k=positiveInt(match[1]);if(k)nums.add(k);}
    if(u.pathname===''||u.pathname.replace(/\/$/,'')==='/dizi/'+slug){const k=positiveInt(u.searchParams.get('sezon'));if(k)nums.add(k);}
  }
  if(!nums.size)nums.add(1);return [...nums].sort((a,b)=>a-b);
}
function getEpisodes(root,slug,season,poster,base){
  const episodes=new Map();if(!root)return [];
  for(const n of root.descendants(n=>n.tag==='a'&&n.attr('href').includes('/sezon-'))){
    const href=decodeEntities(n.attr('href'));const m=safePath(href).match(new RegExp('^/dizi/'+slug+'/sezon-(\\d+)/bolum-(\\d+)/?$'));
    if(!m||Number(m[1])!==season)continue;const num=positiveInt(m[2]);if(!num)continue;
    const url=absoluteUrl(href);if(!allowedUrl(url))continue;
    const title=firstText(n,isTag('p'))||num+'. Bölüm',img=nodeImage(n);
    const item={bolum:num,isim:title,resim:img||poster,api_link:episodeApi(base,slug,season,num),page_url:url,episode_url:url};
    if(!episodes.has(num))episodes.set(num,item);else if(img&&episodes.get(num).resim===poster)episodes.get(num).resim=img;
  }
  return [...episodes.values()].sort((a,b)=>a.bolum-b.bolum);
}
function sectionForDetails(root){
  const sections=root.descendants(isTag('section'));
  return sections.find(n=>n.first(isTag('h1'))&&n.descendants(isTag('h3')).some(h=>text(h.allText()).includes('Tüm Veriler')))
    ||sections.find(n=>n.first(isTag('h1')))||null;
}
function detailData(section){
  const data={};
  for(const dl of section.descendants(isTag('dl'))){
    for(const row of dl.children.filter(n=>n.tag==='div')){
      const dt=row.first(isTag('dt')),dd=row.first(isTag('dd'));
      if(dt&&dd){const k=text(dt.allText());if(k)data[k]=text(dd.allText());}
    }
  }
  return data;
}
async function getSeriesDetails(slug,requestedSeason,refresh,env,base){
  const source=SITE+'/dizi/'+encodeURIComponent(slug);
  const root=await parseHtml(await getPageHtml(source,refresh,env));
  if(!root)return {error:'Dizi sayfasına ulaşılamadı'};
  const section=sectionForDetails(root);if(!section)return {error:'Dizi detay alanı bulunamadı'};
  const name=firstText(section,isTag('h1')),poster=nodeImage(section);
  const summary=firstText(section,n=>n.tag==='p'&&hasClass(n,'leading-relaxed'));
  const genres=[];
  for(const n of section.descendants(n=>n.tag==='a'&&n.attr('href').includes('/tur/'))){const g=text(n.allText());if(g&&!genres.includes(g))genres.push(g);}
  const data=detailData(section),allSeasons=seasonNumbers(root,slug);
  if(requestedSeason!==null&&!allSeasons.includes(requestedSeason))return {error:'İstenen sezon bulunamadı'};
  const seasons=[];
  for(const season of requestedSeason===null?allSeasons:[requestedSeason]){
    const seasonRoot=await parseHtml(await getPageHtml(source+'?sezon='+season,refresh,env))||(season===1?root:null);
    let episodes=getEpisodes(seasonRoot,slug,season,poster,base);
    if(!episodes.length)episodes=getEpisodes(root,slug,season,poster,base);
    seasons.push({sezon:season,isim:season+'. Sezon',api_link:apiLink(base,{dizi:slug,sezon}),bolum_sayisi:episodes.length,bolumler:episodes});
  }
  return {isim:name,resim:poster,ozet:summary,turler:genres,imdb:imdb(data['IMDB Puanı']||''),izlenme:data['İzlenme Sayısı']||'',tur:data['Tür']||'',yil:data['Yapım Yılı']||'',durum:data['Durum']||'',platform:data['Platform']||'',eklenme_tarihi:data['Eklenme Tarihi']||'',tum_veriler:data,sezon_sayisi:allSeasons.length,sezonlar:seasons};
}
export default {
  async fetch(request,env){
    try {
      if(request.method!=='GET')return json({error:'Yalnızca GET destekleniyor'},405);
      if(!env.API_TOKEN)return json({error:'API_TOKEN tanımlanmamış'},503);
      const token=request.headers.get('Authorization')||'';
      if(token!=='Bearer '+env.API_TOKEN)return json({error:'Yetkisiz erişim'},401);
      const u=new URL(request.url);
      if(u.pathname!=='/api/diziler')return json({error:'API bulunamadı'},404);
      const q=u.searchParams,refresh=q.get('refresh')==='1',page=positiveInt(q.get('page')??'1')??1;
      const base=u.origin+'/api/diziler';
      if(q.has('dizi')){
        const slug=(q.get('dizi')||'').trim();if(!/^[a-zA-Z0-9_-]+$/.test(slug))return json({error:'Geçersiz dizi adresi'},400);
        const season=q.has('sezon')?positiveInt(q.get('sezon')):null;
        if(q.has('sezon')&&season===null)return json({error:'Geçersiz sezon numarası'},400);
        const episode=q.has('bolum')?positiveInt(q.get('bolum')):null;
        if(q.has('bolum')&&(episode===null||season===null))return json({error:'Geçerli sezon ve bölüm numarası gerekli'},400);
        const details=await getSeriesDetails(slug,season,refresh,env,base);
        if(details.error)return json(details,details.error==='İstenen sezon bulunamadı'?404:502);
        if(episode!==null){for(const s of details.sezonlar)for(const item of s.bolumler)if(item.bolum===episode)return json({dizi_adi:details.isim,sezon,bolum:item});return json({error:'Bölüm bulunamadı'},404);}
        return json(details);
      }
      if(q.has('tur')){
        const slug=(q.get('tur')||'').trim();if(!CATEGORIES.some(c=>c[1]===slug))return json({error:'Geçersiz kategori'},400);
        return json(await getSeries(slug,page,refresh,env,base));
      }
      const result=[];
      for(const [name,slug] of CATEGORIES){result.push({category_name:name,category_link:apiLink(base,{tur:slug,page}),movies:await getSeries(slug,page,refresh,env,base)});}
      return json(result);
    }catch(err){return json({error:'Sunucu hatası',detail:String(err?.message||err)},500);}
  }
};



// ANKA TV+ GitHub deployment
