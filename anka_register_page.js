export function handleAnkaRegisterPage(request) {
    if (request.method !== 'GET') {
        return new Response(JSON.stringify({success:false,error:'Method not allowed'}), {status:405,headers:{'Content-Type':'application/json; charset=utf-8','Allow':'GET'}});
    }
    const html = `<!doctype html>
<html lang="tr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>ANKA TV+ | Kullanıcı Kaydı</title>
<style>
*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;background:#151419;color:#fff;font-family:Arial,sans-serif;padding:20px}.panel{width:100%;max-width:440px;background:#1d1c21;border:1px solid #45454b;border-radius:20px;padding:26px;box-shadow:0 20px 60px #0003}.brand{font-size:28px;font-weight:800;color:#2db88a;text-align:center}.sub{text-align:center;color:#b8b8be;margin:8px 0 24px;line-height:1.5}label{display:block;font-size:14px;font-weight:600;margin:14px 0 7px}input{width:100%;background:#151419;color:white;border:1px solid #45454b;border-radius:11px;padding:14px;font:inherit;outline:none}input:focus{border-color:#2db88a}button{border:0;border-radius:11px;padding:14px;font:inherit;font-weight:700;cursor:pointer}.submit{width:100%;background:#2db88a;color:#10221b;margin-top:22px}.submit:disabled{opacity:.6;cursor:wait}.notice{display:none;margin-top:18px;padding:13px;border-radius:10px;line-height:1.55;overflow-wrap:anywhere}.notice.error{display:block;color:#ffd3d3;background:#47272c;border:1px solid #824148}.notice.ok{display:block;color:#b2f5d4;background:#20392e;border:1px solid #2db88a}.hint{font-size:12px;color:#a7a7af;margin-top:7px;line-height:1.4}.footer{text-align:center;color:#a7a7af;font-size:12px;margin-top:22px}a{color:#2db88a}
</style>
</head>
<body>
<main class="panel">
<div class="brand">ANKA TV+</div>
<p class="sub">Yeni Kullanıcı Kaydı<br>Hesabınız yönetici onayından sonra kullanılabilir.</p>
<form id="registerForm" autocomplete="on">
<label for="username">Kullanıcı Adı</label>
<input id="username" name="username" minlength="3" maxlength="50" pattern="[A-Za-z0-9_]{3,50}" autocomplete="username" required>
<div class="hint">3–50 karakter; harf, rakam veya alt çizgi.</div>
<label for="email">E-posta Adresi</label>
<input id="email" name="email" type="email" maxlength="254" autocomplete="email" required>
<label for="password">Şifre</label>
<input id="password" name="password" type="password" minlength="12" maxlength="128" autocomplete="new-password" required>
<div class="hint">En az 12 karakterlik güçlü bir şifre kullanın.</div>
<label for="confirm">Şifre Tekrarı</label>
<input id="confirm" name="confirm" type="password" minlength="12" maxlength="128" autocomplete="new-password" required>
<button class="submit" id="submit" type="submit">Kayıt Ol</button>
</form>
<div id="notice" class="notice" role="status" aria-live="polite"></div>
<p class="footer">ANKA TV+ • Test kayıt sayfası</p>
</main>
<script>
'use strict';
const form=document.getElementById('registerForm');
const notice=document.getElementById('notice');
const submit=document.getElementById('submit');
function message(text,ok){notice.textContent=text;notice.className='notice '+(ok?'ok':'error');}
form.addEventListener('submit',async event=>{
 event.preventDefault();
 const username=form.username.value.trim();
 const email=form.email.value.trim();
 const password=form.password.value;
 if(password!==form.confirm.value){message('Şifreler eşleşmiyor.',false);return;}
 submit.disabled=true;submit.textContent='Kaydediliyor...';notice.className='notice';
 try{
  const response=await fetch('/api/app/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username,email,password}),credentials:'same-origin',cache:'no-store'});
  const data=await response.json();
  if(!response.ok||data.success!==true){throw new Error(data.error||data.message||'Kayıt işlemi başarısız.');}
  form.reset();
  message('Kayıt talebiniz alındı. Hesabınız yönetici onayı bekliyor.',true);
 }catch(error){message(error.message||'Bağlantı hatası oluştu.',false);}
 finally{submit.disabled=false;submit.textContent='Kayıt Ol';}
});
</script>
</body></html>`;
    return new Response(html, {status:200,headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'"}});
}
