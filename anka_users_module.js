// ANKA TV+ app users: independent from admin_users.
const enc = new TextEncoder();
const json = (data, status = 200) => new Response(JSON.stringify(data), {status, headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const err = (message,status=400) => json({success:false,error:message},status);
const hex = bytes => [...bytes].map(x=>x.toString(16).padStart(2,'0')).join('');
const random = () => {const b=new Uint8Array(24);crypto.getRandomValues(b);return hex(b);};
async function derive(password,salt){const key=await crypto.subtle.importKey('raw',enc.encode(password),'PBKDF2',false,['deriveBits']);return hex(new Uint8Array(await crypto.subtle.deriveBits({name:'PBKDF2',salt:enc.encode(salt),iterations:210000,hash:'SHA-256'},key,256)));}
function safePost(request){const origin=request.headers.get('Origin');const site=request.headers.get('Sec-Fetch-Site');const expected=new URL(request.url).origin;return site!=='cross-site'&&origin!== 'null'&&(!origin||origin===expected)&&request.headers.get('X-Anka-Admin')==='1'&&site==='same-origin';}
async function bodyJson(request){if(!(request.headers.get('Content-Type')||'').toLowerCase().startsWith('application/json'))throw new Error('JSON gerekli.');const raw=await request.text();if(enc.encode(raw).byteLength>8192)throw new Error('İstek çok büyük.');return JSON.parse(raw);}
const esc = v => String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function adminPage(){return `<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ANKA TV+ Kullanıcı Yönetimi</title><style>*{box-sizing:border-box}body{margin:0;background:#151419;color:#fff;font:15px Arial,sans-serif}header{display:flex;align-items:center;justify-content:space-between;padding:17px;background:#1d1c21;border-bottom:1px solid #45454b}h1{font-size:20px;color:#2db88a;margin:0}a{color:#2db88a}main{max-width:1100px;margin:auto;padding:18px}.filters{display:flex;gap:8px;overflow-x:auto;margin:18px 0}.filters button{white-space:nowrap}button{background:#2db88a;color:#11251d;border:0;border-radius:10px;padding:12px;font-weight:bold;cursor:pointer}button.alt{background:#303038;color:#fff}button.danger{background:#62343c;color:#fff}.card{background:#1d1c21;border:1px solid #45454b;border-radius:13px;padding:17px;margin:12px 0;overflow-wrap:anywhere}.meta{color:#b8b8be;line-height:1.8}.actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:14px}.badge{display:inline-block;background:#33343a;border-radius:20px;padding:5px 10px;font-size:12px}.count{color:#b8b8be}#notice{color:#a5ebc9;min-height:22px}input{padding:12px;background:#1d1c21;border:1px solid #45454b;border-radius:10px;color:white;width:100%;font-size:16px}@media(min-width:700px){.cards{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}.card{margin:0}}</style></head><body><header><h1>ANKA TV+ · Kullanıcı Yönetimi</h1><a href="/admin/manage">Panele Dön</a></header><main><p class="count" id="count">Yükleniyor...</p><input id="search" placeholder="Kullanıcı adı veya e-posta ara"><div class="filters"><button data-status="pending">Onay Bekleyen</button><button data-status="approved" class="alt">Onaylanan</button><button data-status="rejected" class="alt">Reddedilen</button><button data-status="disabled" class="alt">Pasif</button><button data-status="all" class="alt">Tümü</button></div><p id="notice" role="status"></p><div class="cards" id="rows"></div></main><script>let status='pending',users=[];const $=x=>document.getElementById(x);const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));async function api(action,data){const r=await fetch('/admin/users/api?action='+action+(data?'':'&status='+encodeURIComponent(status)),{method:data?'POST':'GET',credentials:'same-origin',headers:data?{'Content-Type':'application/json','X-Anka-Admin':'1'}:{},body:data?JSON.stringify(data):undefined,cache:'no-store'});const v=await r.json();if(!r.ok||!v.success)throw Error(v.error||'İşlem başarısız');return v}function render(){const q=$('search').value.toLocaleLowerCase('tr');const list=users.filter(u=>(u.username+' '+u.email).toLocaleLowerCase('tr').includes(q));$('count').textContent=users.length+' kullanıcı';$('rows').innerHTML=list.map(u=>'<article class="card"><h3>'+esc(u.username)+'</h3><div class="meta">'+esc(u.email)+'<br><span class="badge">'+esc(u.status)+'</span><br>Kayıt: '+esc(new Date(u.created_at*1000).toLocaleString('tr-TR'))+'</div><div class="actions">'+(u.status!=='approved'?'<button data-id="'+esc(u.id)+'" data-status="approved">Onayla</button>':'')+(u.status!=='rejected'?'<button class="alt" data-id="'+esc(u.id)+'" data-status="rejected">Reddet</button>':'')+(u.status!=='disabled'?'<button class="danger" data-id="'+esc(u.id)+'" data-status="disabled">Pasif Yap</button>':'')+'</div></article>').join('')||'<p class="count">Bu bölümde kullanıcı bulunamadı.</p>'}async function load(){try{const v=await api('list');users=v.items;render();$('notice').textContent=''}catch(e){$('notice').textContent=e.message}}document.querySelectorAll('.filters button').forEach(b=>b.onclick=()=>{status=b.dataset.status;document.querySelectorAll('.filters button').forEach(x=>x.className=x===b?'':'alt');load()});$('search').oninput=render;$('rows').onclick=async e=>{const b=e.target.closest('button[data-id]');if(!b)return;if(!confirm('Kullanıcı durumu değiştirilsin mi?'))return;b.disabled=true;try{await api('status',{id:b.dataset.id,status:b.dataset.status});await load()}catch(e){$('notice').textContent=e.message}finally{b.disabled=false}};load();</script></body></html>`;}
export async function handleAnkaUsers(request,env,getAdmin){
 if(!env.DB)return err('D1 DB binding bulunamadı.',503);
 const url=new URL(request.url),path=url.pathname,action=url.searchParams.get('action');
 if(path==='/api/app/register'){
  if(request.method!=='POST')return err('POST gerekli.',405);
  // Public registration endpoint: deploy Cloudflare WAF/rate limit before production.
  let b;try{b=await bodyJson(request)}catch{return err('Geçersiz JSON.',400)}
  const username=String(b.username??'').trim(),email=String(b.email??'').trim().toLowerCase(),password=String(b.password??'');
  if(!/^[a-zA-Z0-9_]{3,40}$/.test(username))return err('Kullanıcı adı 3-40 karakter ve harf/rakam/_ olmalı.',422);
  if(email.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return err('Geçerli e-posta giriniz.',422);
  if(password.length<12||password.length>128)return err('Şifre 12-128 karakter olmalıdır.',422);
  const salt=random(),hash=await derive(password,salt),id=crypto.randomUUID(),now=Math.floor(Date.now()/1000);
  try{await env.DB.prepare('INSERT INTO app_users(id,username,email,password_hash,password_salt,status,created_at) VALUES(?,?,?,?,?,?,?)').bind(id,username,email,hash,salt,'pending',now).run()}
  catch(e){if(/UNIQUE constraint failed/i.test(String(e.message)))return err('Kullanıcı adı veya e-posta zaten kayıtlı.',409);throw e}
  return json({success:true,status:'pending',message:'Kayıt alındı. Yönetici onayı bekleniyor.'},201);
 }
 const admin=await getAdmin(request,env);
 if(!admin)return path==='/admin/users'?new Response(null,{status:303,headers:{Location:'/admin'}}):err('Yönetici oturumu gerekli.',401);
 if(path==='/admin/users'){
  if(request.method!=='GET')return err('GET gerekli.',405);
  return new Response(adminPage(),{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Frame-Options':'DENY','Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'"}});
 }
 if(path!=='/admin/users/api')return err('Not found',404);
 if(action==='list'){
  if(request.method!=='GET')return err('GET gerekli.',405);
  const status=url.searchParams.get('status')||'pending';if(!['pending','approved','rejected','disabled','all'].includes(status))return err('Geçersiz filtre.');
  const stmt=status==='all'?env.DB.prepare('SELECT id,username,email,status,created_at,reviewed_at FROM app_users ORDER BY created_at DESC LIMIT 500'):env.DB.prepare('SELECT id,username,email,status,created_at,reviewed_at FROM app_users WHERE status=? ORDER BY created_at DESC LIMIT 500').bind(status);
  const result=await stmt.all();return json({success:true,items:result.results||[]});
 }
 if(action==='status'){
  if(request.method!=='POST')return err('POST gerekli.',405);
  if(!safePost(request))return err('Geçersiz istek kaynağı.',403);
  let b;try{b=await bodyJson(request)}catch{return err('Geçersiz JSON.',400)}
  if(!['approved','rejected','disabled'].includes(b.status)||typeof b.id!=='string'||!/^[0-9a-f-]{36}$/.test(b.id))return err('Geçersiz işlem.',422);
  const result=await env.DB.prepare('UPDATE app_users SET status=?,reviewed_at=?,reviewed_by=? WHERE id=?').bind(b.status,Math.floor(Date.now()/1000),admin.id,b.id).run();
  if(!result.meta?.changes)return err('Kullanıcı bulunamadı.',404);
  return json({success:true});
 }
 return err('Bilinmeyen işlem.',404);
}
