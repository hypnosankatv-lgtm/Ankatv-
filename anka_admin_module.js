const TYPES = ['platforms', 'media', 'announcements', 'film_sources', 'dizi_sources'];
const NAMES = {
    platforms: 'Platform Yönetimi',
    media: 'Film / Dizi API',
    announcements: 'Duyurular',
    film_sources: 'Film Siteleri',
    dizi_sources: 'Dizi Siteleri'
};
const FIELDS = {
    platforms: [
        ['title', 'Platform Adı', true],
        ['logo', 'Logo URL'],
        ['list_url', 'Liste JSON URL', true],
        ['js_url', 'İzleme JS URL'],
        ['token', 'Platform Token (boş bırakılırsa değişmez)']
    ],
    media: [
        ['title', 'Kaynak Başlığı', true],
        ['kind', 'Tür', true],
        ['site_url', 'Film Sitesi URL'],
        ['api_js_url', 'Film API.js URL'],
        ['izle_js_url', 'Film İzle.js URL'],
        ['film_api', 'TV Dizileri API URL'],
        ['search_api', 'TV Dizileri Arama API URL'],
        ['js_url', 'TV Dizileri İzleme JS URL']
    ],
    announcements: [
        ['title', 'Duyuru Başlığı', true],
        ['message', 'Duyuru Metni', true]
    ],
    film_sources: [
        ['title', 'Film Sitesi Adı', true],
        ['site_url', 'Site URL', true],
        ['api_js_url', 'Film API.js URL', true],
        ['izle_js_url', 'İzle.js URL']
    ],
    dizi_sources: [
        ['title', 'Dizi Sitesi Adı', true],
        ['base_url', 'Site Ana Adresi', true],
        ['dizi_api_js_url', 'Dizi API JS URL', true],
        ['js_url', 'İzle JS URL']
    ]
};
function respond(data, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'Cache-Control': 'no-store',
            'X-Content-Type-Options': 'nosniff'
        }
    });
}
function fail(message, status = 400) {
    return respond({success: false, error: message}, status);
}
function textField(value, max = 2048) {
    return String(value ?? '').trim().slice(0, max);
}
function validUrl(value) {
    try {
        const url = new URL(value);
        return url.protocol === 'https:' && !url.username && !url.password;
    } catch (_) {
        return false;
    }
}
function validMutationOrigin(request) {
    const expected = new URL(request.url).origin;
    const origin = request.headers.get('Origin');
    const referer = request.headers.get('Referer');
    const site = request.headers.get('Sec-Fetch-Site');
    if (site === 'cross-site') return false;
    if (origin && origin !== 'null' && origin !== expected) return false;
    if (!origin || origin === 'null') {
        if (referer) {
            try {
                if (new URL(referer).origin !== expected) return false;
            } catch (_) {
                return false;
            }
        } else if (site !== 'same-origin') {
            return false;
        }
    }
    return request.headers.get('X-Anka-Admin') === '1';
}
function clean(type, input, old) {
    const item = {
        id: old?.id || crypto.randomUUID(),
        active: input.active === true
    };
    for (const [key, , required] of FIELDS[type]) {
        if (key === 'token') continue;
        item[key] = textField(input[key], key === 'message' ? 3000 : 2048);
        if (required && !item[key]) throw new Error(key + ' alanı zorunludur.');
        if ((key.endsWith('_url') || ['logo', 'js_url', 'film_api', 'search_api'].includes(key)) && item[key] && !validUrl(item[key])) {
            throw new Error(key + ' geçerli bir HTTPS adresi olmalıdır.');
        }
    }
    if (type === 'media') {
        if (!['film', 'tv_dizi'].includes(item.kind)) throw new Error('Tür film veya tv_dizi olmalıdır.');
        const required = item.kind === 'film' ? ['site_url', 'api_js_url'] : ['film_api', 'search_api', 'js_url'];
        for (const key of required) if (!item[key]) throw new Error(key + ' alanı zorunludur.');
        if (item.kind === 'film') {
            item.base_url = item.site_url;
            item.baseUrl = item.site_url;
            item.watch_js_url = item.izle_js_url;
            item.js_url = item.api_js_url;
        }
    }
    if (type === 'platforms') {
        item.token = old?.token || '';
        if (textField(input.token)) item.token = textField(input.token, 8192);
        item.allowed_api_hosts = old?.allowed_api_hosts || [];
    }
    if (type === 'dizi_sources') {
        for (const key of ['list_url', 'search_url', 'detail_url', 'season_url']) item[key] = old?.[key] || '';
        item.parser = old?.parser || {};
        item.parser_rules = old?.parser_rules || {};
        item.categories = old?.categories || [];
    }
    return item;
}
function publicRecord(type, row) {
    const record = JSON.parse(row.payload);
    if (type === 'platforms') {
        delete record.token;
        delete record.allowed_api_hosts;
    }
    return record;
}
async function listRecords(env, type) {
    const result = await env.DB.prepare(
        'SELECT payload FROM anka_records WHERE type = ? ORDER BY updated_at DESC, id DESC'
    ).bind(type).all();
    return (result.results || []).map(row => publicRecord(type, row));
}
function page() {
    const css = `
:root{color-scheme:dark;--bg:#151419;--surface:#1d1c21;--border:#45454b;--green:#2db88a;--muted:#b8b8be}
*{box-sizing:border-box}
html,body{margin:0;min-height:100%;max-width:100%;overflow-x:hidden}
body{background:var(--bg);color:#fff;font:14px/1.5 Arial,sans-serif}
button,input,textarea,select{font:inherit}
button{cursor:pointer;border:0;border-radius:11px;padding:11px 15px;font-weight:700;background:var(--green);color:#102119;min-height:42px}
button:disabled{opacity:.55;cursor:not-allowed}
a{color:var(--green)}
.topbar{height:68px;display:flex;align-items:center;justify-content:space-between;padding:0 22px;background:var(--surface);border-bottom:1px solid var(--border);gap:12px}
.brand{display:flex;align-items:center;gap:12px;min-width:0}
.brand h1{font-size:21px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin:0;color:var(--green)}
.menu-btn{display:none;background:#303038;color:white;font-size:23px;padding:5px 12px}
.top-actions{display:flex;align-items:center;gap:12px;flex-shrink:0}
.logout{margin:0}.logout button{background:#303038;color:#fff;padding:9px 13px}
.layout{display:flex;min-height:calc(100vh - 68px)}
.sidebar{width:248px;flex-shrink:0;padding:18px 12px;background:var(--surface);border-right:1px solid var(--border)}
.sidebar .side-title{padding:8px 12px 16px;color:var(--muted);font-size:12px;letter-spacing:1px;text-transform:uppercase}
.sidebar button{display:flex;align-items:center;width:100%;margin-bottom:7px;background:transparent;color:#ddd;text-align:left;font-weight:600}
.sidebar button.selected{background:#294438;color:#fff;border:1px solid #3b8d6a}
.sidebar button:hover{background:#303c36}
.content{flex:1;min-width:0;max-width:1150px;margin:0 auto;padding:27px}
.heading{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:16px}
.heading h2{font-size:23px;margin:0}
.hint{color:var(--muted);margin:0 0 16px}
.notice{min-height:20px;margin:12px 0;color:#a5ebc9;overflow-wrap:anywhere}
.notice.error{color:#ff9b9b}
.toolbar{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:18px 0}
.search{max-width:360px}
input,textarea,select{display:block;width:100%;min-width:0;background:var(--bg);border:1px solid var(--border);border-radius:10px;color:#fff;padding:12px;outline:none}
input:focus,textarea:focus,select:focus{border-color:var(--green)}
textarea{min-height:120px;resize:vertical}
label{display:block;margin:15px 0 7px;font-size:13px;color:#e5e5e8}
.cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(270px,1fr));gap:14px}
.record{min-width:0;background:var(--surface);border:1px solid var(--border);border-radius:15px;padding:18px;overflow-wrap:anywhere}
.record h3{margin:0 0 8px;font-size:17px}
.record p{color:var(--muted);margin:7px 0;font-size:13px;word-break:break-word}
.status{display:inline-flex;border-radius:30px;padding:4px 10px;font-size:12px;background:#453034;color:#ffd5d5}
.status.active{background:#203d31;color:#9df2c8}
.actions{display:flex;gap:7px;flex-wrap:wrap;margin-top:15px}
.actions button{font-size:12px;padding:9px 11px;min-height:37px}
.secondary{background:#33323a;color:white}
.danger{background:#5a3037;color:#ffe2e5}
.empty{padding:35px 20px;text-align:center;background:var(--surface);border:1px dashed var(--border);border-radius:15px;color:var(--muted)}
.form-wrap{display:none;background:var(--surface);border:1px solid var(--border);border-radius:15px;padding:22px;margin:18px 0 24px}
.form-wrap h3{margin:0 0 12px}
.form-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:0 16px}
.form-field.full{grid-column:1/-1}
.checkline{display:flex;align-items:center;gap:10px;margin:17px 0}
.checkline input{width:19px;height:19px;flex-shrink:0}
.form-actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:16px}
.backdrop{display:none}
@media(max-width:800px){
 .topbar{height:62px;padding:0 13px}
 .brand h1{font-size:17px}
 .menu-btn{display:inline-flex;align-items:center;justify-content:center}
 .top-actions>a{display:none}
 .logout button{font-size:12px;padding:8px 10px;min-height:38px}
 .layout{display:block;min-height:calc(100vh - 62px)}
 .sidebar{position:fixed;z-index:30;top:62px;bottom:0;left:0;width:min(285px,83vw);overflow-y:auto;transform:translateX(-110%);transition:transform .2s ease;box-shadow:12px 0 30px #0005}
 .sidebar.open{transform:translateX(0)}
 .backdrop.show{display:block;position:fixed;inset:62px 0 0;background:#0009;z-index:25}
 .content{padding:19px 14px}
 .heading h2{font-size:20px}
 .toolbar{flex-wrap:wrap}
 .search{max-width:none;width:100%}
 .cards{grid-template-columns:1fr}
 .form-grid{grid-template-columns:1fr}
 .form-wrap{padding:16px}
 input,textarea,select{font-size:16px}
 .actions button{flex:1 1 auto}
}
@media(max-width:370px){.brand h1{font-size:15px}.topbar{gap:5px}.logout button{padding:8px}}
`;
    const js = `
const FIELDS=${JSON.stringify(FIELDS)};
const NAMES=${JSON.stringify(NAMES)};
let currentType='platforms';
let items=[];
let editId=null;
const $=id=>document.getElementById(id);
const esc=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
function notice(message,isError=false){$('notice').textContent=message;$('notice').classList.toggle('error',isError)}
function closeMenu(){$('sidebar').classList.remove('open');$('backdrop').classList.remove('show')}
$('menuBtn').onclick=()=>{$('sidebar').classList.toggle('open');$('backdrop').classList.toggle('show')};
$('backdrop').onclick=closeMenu;
async function api(action,type,body){
 const params=new URLSearchParams({action,type});
 const options={method:body===undefined?'GET':'POST',credentials:'same-origin',cache:'no-store'};
 if(body!==undefined){options.headers={'Content-Type':'application/json','X-Anka-Admin':'1'};options.body=JSON.stringify({...body,type})}
 const response=await fetch('/admin/manage/api?'+params.toString(),options);
 let result;
 try{result=await response.json()}catch(_){throw new Error('Sunucudan geçerli JSON alınamadı (HTTP '+response.status+').')}
 if(!response.ok||!result.success)throw new Error(result.error||'İşlem başarısız (HTTP '+response.status+').');
 return result;
}
async function load(){
 notice('Kayıtlar yükleniyor...');
 try{const result=await api('list',currentType);items=Array.isArray(result.items)?result.items:[];notice('');render()}
 catch(error){items=[];render();notice(error.message,true)}
}
function render(){
 document.querySelectorAll('[data-type]').forEach(button=>button.classList.toggle('selected',button.dataset.type===currentType));
 $('heading').textContent=NAMES[currentType];
 const query=$('search').value.trim().toLocaleLowerCase('tr');
 const filtered=items.filter(item=>JSON.stringify(item).toLocaleLowerCase('tr').includes(query));
 $('count').textContent=items.length+' kayıt';
 $('rows').innerHTML=filtered.length?filtered.map(item=>{
  const detail=(item.site_url||item.base_url||item.list_url||item.film_api||item.message||'').slice(0,260);
  return '<article class="record"><h3>'+esc(item.title)+'</h3><span class="status '+(item.active?'active':'')+'">'+(item.active?'Aktif':'Pasif')+'</span><p>'+esc(detail)+'</p><div class="actions"><button data-edit="'+esc(item.id)+'">Düzenle</button><button class="secondary" data-toggle="'+esc(item.id)+'">'+(item.active?'Pasif Yap':'Aktif Yap')+'</button><button class="danger" data-delete="'+esc(item.id)+'">Sil</button></div></article>';
 }).join(''):'<div class="empty">'+(query?'Aramayla eşleşen kayıt yok.':'Henüz kayıt yok. Yeni Kayıt ile başlayabilirsin.')+'</div>';
}
function openForm(item={}){
 editId=item.id||null;
 $('formTitle').textContent=editId?'Kaydı Düzenle':'Yeni Kayıt';
 $('fields').innerHTML=FIELDS[currentType].map(([key,label,required])=>{
  const value=key==='token'?'':String(item[key]??'');
  const full=key==='message'?' full':'';
  if(key==='message')return '<div class="form-field'+full+'"><label for="f_'+key+'">'+esc(label)+'</label><textarea id="f_'+key+'" name="'+key+'" '+(required?'required':'')+'>'+esc(value)+'</textarea></div>';
  if(key==='kind')return '<div class="form-field"><label for="f_kind">Tür</label><select id="f_kind" name="kind"><option value="film" '+(value==='film'?'selected':'')+'>Film</option><option value="tv_dizi" '+(value==='tv_dizi'?'selected':'')+'>TV Dizileri</option></select></div>';
  const type=key==='token'?'password':(key.endsWith('_url')||['logo','js_url','film_api','search_api'].includes(key))?'url':'text';
  return '<div class="form-field"><label for="f_'+key+'">'+esc(label)+'</label><input id="f_'+key+'" name="'+key+'" type="'+type+'" '+(required?'required':'')+' value="'+esc(value)+'" '+(key==='token'?'autocomplete="new-password"':'')+'></div>';
 }).join('');
 $('active').checked=item.active!==false;
 $('formWrap').style.display='block';
 $('formWrap').scrollIntoView({behavior:'smooth',block:'start'});
}
function closeForm(){$('formWrap').style.display='none';editId=null}
$('new').onclick=()=>openForm();
$('cancel').onclick=closeForm;
$('search').oninput=render;
document.querySelectorAll('[data-type]').forEach(button=>button.onclick=()=>{
 currentType=button.dataset.type;closeMenu();closeForm();$('search').value='';load();
});
$('editForm').onsubmit=async event=>{
 event.preventDefault();
 const button=$('save');button.disabled=true;
 const form=new FormData(event.currentTarget);
 const item={active:$('active').checked};
 for(const [key] of FIELDS[currentType])item[key]=String(form.get(key)||'').trim();
 if(editId)item.id=editId;
 try{await api('save',currentType,{item});closeForm();await load();notice('Kayıt başarıyla kaydedildi.')}
 catch(error){notice(error.message,true)}
 finally{button.disabled=false}
};
$('rows').onclick=async event=>{
 const button=event.target.closest('button');if(!button)return;
 const id=button.dataset.edit||button.dataset.toggle||button.dataset.delete;
 const item=items.find(row=>row.id===id);if(!item)return;
 if(button.dataset.edit){openForm(item);return}
 if(button.dataset.delete&&!confirm('Bu kayıt kalıcı olarak silinsin mi?'))return;
 button.disabled=true;
 try{
  if(button.dataset.toggle)await api('status',currentType,{id,active:!item.active});
  else if(button.dataset.delete)await api('delete',currentType,{id});
  await load();notice('İşlem tamamlandı.');
 }catch(error){notice(error.message,true)}finally{button.disabled=false}
};
load();
`;
    return `<!doctype html>
<html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ANKA TV+ Yönetim Paneli</title><style>${css}</style></head>
<body>
<header class="topbar"><div class="brand"><button id="menuBtn" class="menu-btn" type="button" aria-label="Menüyü aç">☰</button><h1>ANKA TV+ Yönetim Paneli</h1></div><div class="top-actions"><a href="/admin">Ana Sayfa</a><form class="logout" method="POST" action="/admin/logout"><button type="submit">Çıkış</button></form></div></header>
<div class="backdrop" id="backdrop"></div>
<div class="layout"><aside class="sidebar" id="sidebar"><div class="side-title">Yönetim Menüsü</div>${TYPES.map(type => `<button type="button" data-type="${type}">${NAMES[type]}</button>`).join('')}</aside>
<main class="content"><div class="heading"><h2 id="heading">Platform Yönetimi</h2><button id="new" type="button">+ Yeni Kayıt</button></div><p class="hint" id="count">Kayıtlar yükleniyor...</p><input class="search" id="search" type="search" placeholder="Kayıtlarda ara..."><p class="notice" id="notice" role="status"></p>
<section class="form-wrap" id="formWrap"><h3 id="formTitle">Yeni Kayıt</h3><form id="editForm"><div class="form-grid" id="fields"></div><label class="checkline"><input id="active" type="checkbox" checked> Aktif</label><div class="form-actions"><button id="save" type="submit">Kaydet</button><button class="secondary" id="cancel" type="button">İptal</button></div></form></section>
<section class="cards" id="rows"></section></main></div><script>${js}</script></body></html>`;
}
export async function handleAnkaManage(request, env, getAdmin) {
    if (!env.DB) return fail('D1 DB bağlantısı bulunamadı.', 503);
    const url = new URL(request.url);
    const action = url.searchParams.get('action');
    const isApi = url.pathname === '/admin/manage/api';
    const admin = await getAdmin(request, env);
    if (!admin) {
        if (isApi) return fail('Yönetici oturumu gerekli.', 401);
        return new Response(null, {status: 303, headers: {Location: '/admin'}});
    }
    if (!isApi) {
        if (request.method !== 'GET') return fail('GET gerekli.', 405);
        return new Response(page(), {
            headers: {
                'Content-Type': 'text/html; charset=utf-8',
                'Cache-Control': 'no-store',
                'X-Frame-Options': 'DENY',
                'X-Content-Type-Options': 'nosniff',
                'Referrer-Policy': 'no-referrer',
                'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'"
            }
        });
    }
    const type = url.searchParams.get('type');
    if (!TYPES.includes(type)) return fail('Geçersiz kayıt türü.');
    if (action === 'list') {
        if (request.method !== 'GET') return fail('GET gerekli.', 405);
        return respond({success: true, items: await listRecords(env, type)});
    }
    if (!['save', 'status', 'delete'].includes(action)) return fail('Bilinmeyen işlem.', 404);
    if (request.method !== 'POST') return fail('POST gerekli.', 405);
    if (!validMutationOrigin(request)) return fail('Geçersiz istek kaynağı.', 403);
    if (!(request.headers.get('Content-Type') || '').toLowerCase().startsWith('application/json')) return fail('JSON gerekli.', 415);
    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > 20000) return fail('İstek çok büyük.', 413);
    let body;
    try { body = JSON.parse(raw); } catch (_) { return fail('Geçersiz JSON.'); }
    if (!body || typeof body !== 'object' || Array.isArray(body) || body.type !== type) return fail('Geçersiz istek verisi.');
    if (action === 'save') {
        const input = body.item;
        if (!input || typeof input !== 'object' || Array.isArray(input)) return fail('Geçersiz kayıt.');
        const id = textField(input.id, 80);
        let old = null;
        if (id) {
            const row = await env.DB.prepare('SELECT payload FROM anka_records WHERE type = ? AND id = ?').bind(type, id).first();
            if (!row) return fail('Düzenlenecek kayıt bulunamadı.', 404);
            old = JSON.parse(row.payload);
        }
        let item;
        try { item = clean(type, input, old); } catch (error) { return fail(error.message, 422); }
        await env.DB.prepare(`INSERT INTO anka_records(type,id,payload,active,updated_at)
            VALUES(?,?,?,?,CURRENT_TIMESTAMP)
            ON CONFLICT(type,id) DO UPDATE SET payload=excluded.payload,active=excluded.active,updated_at=CURRENT_TIMESTAMP`)
            .bind(type, item.id, JSON.stringify(item), item.active ? 1 : 0).run();
        return respond({success: true, id: item.id});
    }
    const id = textField(body.id, 80);
    if (!id) return fail('Kayıt ID gerekli.');
    const row = await env.DB.prepare('SELECT payload FROM anka_records WHERE type = ? AND id = ?').bind(type, id).first();
    if (!row) return fail('Kayıt bulunamadı.', 404);
    if (action === 'delete') {
        await env.DB.prepare('DELETE FROM anka_records WHERE type = ? AND id = ?').bind(type, id).run();
        return respond({success: true});
    }
    const item = JSON.parse(row.payload);
    item.active = body.active === true;
    await env.DB.prepare('UPDATE anka_records SET payload = ?, active = ?, updated_at = CURRENT_TIMESTAMP WHERE type = ? AND id = ?')
        .bind(JSON.stringify(item), item.active ? 1 : 0, type, id).run();
    return respond({success: true});
}
