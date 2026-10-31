// ANKA TV+ Cloudflare yönetim modülü — mevcut admin oturumuna bağlanır.
const TYPES = ['platforms','media','announcements','film_sources','dizi_sources'];
const FIELDS = {
  platforms: [['title','Platform Adı',1],['logo','Logo URL'],['list_url','Liste JSON URL',1],['js_url','İzleme JS URL'],['token','Yeni Platform Token (boş bırakılırsa değişmez)']],
  media: [['title','Kaynak Başlığı',1],['kind','Tür (film / tv_dizi)',1],['site_url','Film Sitesi URL'],['api_js_url','Film API.js URL'],['izle_js_url','Film İzle.js URL'],['film_api','TV Dizileri API URL'],['search_api','TV Dizileri Arama API URL'],['js_url','TV Dizileri İzleme JS URL']],
  announcements: [['title','Duyuru Başlığı',1],['message','Duyuru Metni',1]],
  film_sources: [['title','Film Sitesi Adı',1],['site_url','Site URL',1],['api_js_url','Film API.js URL',1],['izle_js_url','İzle.js URL']],
  dizi_sources: [['title','Dizi Sitesi Adı',1],['base_url','Site Ana Adresi',1],['dizi_api_js_url','Şifreli Dizi API JS URL',1],['js_url','Şifreli İzle JS URL']]
};
const NAMES = {platforms:'Platform Yönetimi',media:'Film / Dizi API',announcements:'Duyurular',film_sources:'Film Siteleri',dizi_sources:'Dizi Siteleri'};
function respond(data,status=200){return new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}})}
function fail(message,status=400){return respond({success:false,error:message},status)}
function validUrl(v){try{const u=new URL(v);return u.protocol==='https:'&&!u.username&&!u.password}catch{return false}}
function textField(v,max=2048){return String(v??'').trim().slice(0,max)}
function sameOriginRequest(request){
  const expected=new URL(request.url).origin;
  const origin=request.headers.get('Origin');
  const fetchSite=request.headers.get('Sec-Fetch-Site');
  if(fetchSite==='cross-site')return false;
  if(origin&&origin!=='null'&&origin!==expected)return false;
  return request.headers.get('X-Anka-Admin')==='1' && fetchSite==='same-origin';
}
function clean(type,input,old){
  const item={id:old?.id||crypto.randomUUID(),active:input.active===true};
  for(const [key,,required] of FIELDS[type]){
    if(key==='token')continue;
    item[key]=textField(input[key],key==='message'?3000:2048);
    if(required&&!item[key])throw Error(key+' alanı zorunludur.');
    if((key.endsWith('_url')||key==='logo'||key==='js_url'||key==='film_api'||key==='search_api')&&item[key]&&!validUrl(item[key]))throw Error(key+' geçerli HTTPS URL olmalıdır.');
  }
  if(type==='media'){
    if(!['film','tv_dizi'].includes(item.kind))throw Error('Tür film veya tv_dizi olmalı.');
    for(const key of item.kind==='film'?['site_url','api_js_url']:['film_api','search_api','js_url'])if(!item[key])throw Error(key+' zorunludur.');
    if(item.kind==='film'){
      item.base_url=item.site_url;item.baseUrl=item.site_url;
      item.watch_js_url=item.izle_js_url;item.js_url=item.api_js_url;
    }
  }
  if(type==='platforms'){
    // Token hiçbir zaman admin liste yanıtında gönderilmez.
    item.token=old?.token||'';
    if(textField(input.token))item.token=String(input.token);
    item.allowed_api_hosts=old?.allowed_api_hosts||[];
  }
  if(type==='dizi_sources'){
    item.list_url=old?.list_url||'';item.search_url=old?.search_url||'';
    item.detail_url=old?.detail_url||'';item.season_url=old?.season_url||'';
    item.parser=old?.parser||{};item.parser_rules=old?.parser_rules||{};
    item.categories=old?.categories||[];
  }
  return item;
}
function publicRecord(type,row){const v=JSON.parse(row.payload);if(type==='platforms'){delete v.token;delete v.allowed_api_hosts}return v}
async function list(env,type,onlyActive=false){
  const sql=onlyActive?'SELECT payload FROM anka_records WHERE type=? AND active=1 ORDER BY updated_at DESC':'SELECT payload FROM anka_records WHERE type=? ORDER BY updated_at DESC';
  const result=await env.DB.prepare(sql).bind(type).all();
  return (result.results||[]).map(row=>publicRecord(type,row));
}
function page(){
const css=`*{box-sizing:border-box}body{margin:0;background:#151419;color:white;font:14px Arial,sans-serif}header{padding:20px 25px;background:#1d1c21;border-bottom:1px solid #45454b;display:flex;justify-content:space-between;align-items:center}h1{font-size:23px;color:#2db88a;margin:0}aside{width:230px;background:#1d1c21;min-height:calc(100vh - 69px);padding:15px}main{padding:25px;flex:1;min-width:0}.layout{display:flex}button{background:#2db88a;color:#102119;border:0;padding:12px 15px;border-radius:10px;font-weight:bold;cursor:pointer}button.secondary{background:#2c2b32;color:white}button.danger{background:#593038;color:#ffd7dc}aside button{display:block;width:100%;text-align:left;margin-bottom:8px;background:transparent;color:#ddd}aside button.selected{background:#294438;color:white}article{border:1px solid #45454b;background:#1d1c21;border-radius:12px;padding:18px;margin:12px 0;overflow-wrap:anywhere}article p{color:#b8b8be;line-height:1.5}article button{margin-right:8px;margin-top:8px}#formWrap{display:none;border:1px solid #45454b;border-radius:12px;padding:20px;background:#1d1c21;margin:20px 0}label{display:block;margin:12px 0 6px}input,textarea{display:block;width:100%;background:#151419;color:white;border:1px solid #45454b;border-radius:8px;padding:12px;font:inherit}input[type=checkbox]{width:auto;display:inline-block}textarea{min-height:100px}#notice{color:#a5ebc9;min-height:20px}small{color:#b8b8be}@media(max-width:720px){.layout{display:block}aside{width:100%;min-height:auto;display:flex;overflow-x:auto;gap:8px}aside button{width:auto;white-space:nowrap}main{padding:15px}header{gap:12px}h1{font-size:19px}}`;
const js=`const FIELDS=${JSON.stringify(FIELDS)},NAMES=${JSON.stringify(NAMES)};let type='platforms',items=[],editId=null;
const $=id=>document.getElementById(id);function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
async function api(action,body){const r=await fetch('/admin/manage/api?action='+encodeURIComponent(action),{method:body===undefined?'GET':'POST',credentials:'same-origin',headers:body===undefined?{}:{'Content-Type':'application/json','X-Anka-Admin':'1'},body:body===undefined?undefined:JSON.stringify(body)});const v=await r.json();if(!r.ok)throw Error(v.error||'İşlem başarısız');return v}
function notify(v){$('notice').textContent=v}
async function load(){try{const v=await api('list&type='+type);items=v.items;render()}catch(e){notify(e.message)}}
function render(){document.querySelectorAll('aside button').forEach(b=>b.classList.toggle('selected',b.dataset.type===type));$('heading').textContent=NAMES[type];$('rows').innerHTML=items.length?items.map(x=>'<article><h3>'+esc(x.title)+'</h3><p>'+esc((x.site_url||x.base_url||x.list_url||x.film_api||x.message||'').slice(0,250))+'</p><p>'+(x.active?'Aktif':'Pasif')+'</p><button data-edit="'+esc(x.id)+'">Düzenle</button><button class="secondary" data-toggle="'+esc(x.id)+'">'+(x.active?'Pasif Yap':'Aktif Yap')+'</button><button class="danger" data-delete="'+esc(x.id)+'">Sil</button></article>').join(''):'<p>Henüz kayıt yok.</p>'}
function openForm(x={}){editId=x.id||null;$('formTitle').textContent=editId?'Kaydı Düzenle':'Yeni Kayıt';$('fields').innerHTML=FIELDS[type].map(([key,label,required])=>'<label>'+esc(label)+'</label>'+(key==='message'?'<textarea name="'+key+'" '+(required?'required':'')+'>'+esc(x[key]||'')+'</textarea>':'<input name="'+key+'" '+(required?'required':'')+' value="'+esc(key==='token'?'':x[key]||'')+'" '+(key==='token'?'type="password" autocomplete="new-password"':'')+'>')).join('')+'<label><input name="active" type="checkbox" '+(x.active!==false?'checked':'')+'> Aktif</label>';$('formWrap').style.display='block';$('formWrap').scrollIntoView({behavior:'smooth'})}
$('new').onclick=()=>openForm();$('cancel').onclick=()=>{$('formWrap').style.display='none'};
document.querySelectorAll('aside button').forEach(b=>b.onclick=()=>{type=b.dataset.type;$('formWrap').style.display='none';load()});
$('editForm').onsubmit=async e=>{e.preventDefault();const f=new FormData(e.target),item={active:f.has('active')};for(const [key]of FIELDS[type])item[key]=String(f.get(key)||'').trim();if(editId)item.id=editId;try{await api('save',{type,item});$('formWrap').style.display='none';notify('Kaydedildi');load()}catch(err){notify(err.message)}};
$('rows').onclick=async e=>{const b=e.target.closest('button');if(!b)return;const id=b.dataset.edit||b.dataset.toggle||b.dataset.delete;const x=items.find(v=>v.id===id);if(!x)return;if(b.dataset.edit){openForm(x);return}try{if(b.dataset.toggle){await api('status',{type,id,active:!x.active})}else if(b.dataset.delete){if(!confirm('Bu kayıt silinsin mi?'))return;await api('delete',{type,id})}notify('İşlem tamamlandı');load()}catch(err){notify(err.message)}};load();`;
return `<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ANKA TV+ Yönetim</title><style>${css}</style></head><body><header><h1>ANKA TV+ Yönetim Paneli</h1><a href="/admin" style="color:#2db88a">Ana sayfa</a></header><div class="layout"><aside>${TYPES.map(t=>`<button data-type="${t}">${NAMES[t]}</button>`).join('')}</aside><main><h2 id="heading"></h2><p id="notice" role="status"></p><button id="new">+ Yeni Kayıt</button><section id="formWrap"><h3 id="formTitle"></h3><form id="editForm"><div id="fields"></div><button type="submit">Kaydet</button> <button class="secondary" type="button" id="cancel">İptal</button></form></section><div id="rows"></div></main></div><script>${js}</script></body></html>`;
}
export async function handleAnkaManage(request,env,getAdmin){
  if(!env.DB)return fail('DB binding bulunamadı',503);
  const url=new URL(request.url),action=url.searchParams.get('action');
  const admin=await getAdmin(request,env);
  if(!admin)return action?fail('Yönetici oturumu gerekli',401):new Response(null,{status:303,headers:{Location:'/admin'}});
  if(!action){if(request.method!=='GET')return fail('Method not allowed',405);return new Response(page(),{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Frame-Options':'DENY','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'"}})}
  if(action==='list'){
    if(request.method!=='GET')return fail('GET gerekli',405);
    const type=url.searchParams.get('type');if(!TYPES.includes(type))return fail('Geçersiz tür');
    return respond({success:true,items:await list(env,type)});
  }
  if(request.method!=='POST')return fail('POST gerekli',405);
  if(!sameOriginRequest(request))return fail('Geçersiz istek kaynağı',403);
  if(!(request.headers.get('Content-Type')||'').startsWith('application/json'))return fail('JSON gerekli',415);
  const raw=await request.text();if(raw.length>20000)return fail('İstek çok büyük',413);
  let body;try{body=JSON.parse(raw)}catch{return fail('Geçersiz JSON')}
  const type=body?.type;if(!TYPES.includes(type))return fail('Geçersiz tür');
  if(action==='save'){
    const input=body.item;if(!input||typeof input!=='object'||Array.isArray(input))return fail('Geçersiz kayıt');
    const id=textField(input.id,80);let old=null;
    if(id){const row=await env.DB.prepare('SELECT payload FROM anka_records WHERE type=? AND id=?').bind(type,id).first();if(!row)return fail('Düzenlenecek kayıt bulunamadı',404);old=JSON.parse(row.payload)}
    let item;try{item=clean(type,input,old)}catch(e){return fail(e.message,422)}
    await env.DB.prepare('INSERT INTO anka_records(type,id,payload,active,updated_at) VALUES(?,?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(type,id) DO UPDATE SET payload=excluded.payload,active=excluded.active,updated_at=CURRENT_TIMESTAMP').bind(type,item.id,JSON.stringify(item),item.active?1:0).run();
    return respond({success:true,id:item.id});
  }
  const id=textField(body.id,80);if(!id)return fail('ID gerekli');
  const row=await env.DB.prepare('SELECT payload FROM anka_records WHERE type=? AND id=?').bind(type,id).first();if(!row)return fail('Kayıt bulunamadı',404);
  if(action==='delete'){await env.DB.prepare('DELETE FROM anka_records WHERE type=? AND id=?').bind(type,id).run();return respond({success:true})}
  if(action==='status'){
    const item=JSON.parse(row.payload);item.active=body.active===true;
    await env.DB.prepare('UPDATE anka_records SET payload=?,active=?,updated_at=CURRENT_TIMESTAMP WHERE type=? AND id=?').bind(JSON.stringify(item),item.active?1:0,type,id).run();return respond({success:true});
  }
  return fail('Bilinmeyen işlem',404);
}
