import assert from 'node:assert/strict';
const base='https://clara-gestion-de-pagos.pages.dev';
const response=await fetch(base);assert.equal(response.status,200);
assert.ok((await response.text()).includes('Clara Gestión de Pagos'));
async function login(role){
  const r=await fetch(base+'/api/auth/login',{method:'POST',headers:{Origin:base,'Content-Type':'application/json'},body:JSON.stringify({email:role==='owner'?'propietario@demo.local':'asistente@demo.local',password:role==='owner'?'Propietario2026!':'Asistente2026!'})});
  const data=await r.json();assert.equal(r.status,200,JSON.stringify(data));
  return {cookie:r.headers.get('set-cookie').split(';')[0],csrf:data.csrf};
}
async function call(session,path,method='GET',body){
  const r=await fetch(base+'/api'+path,{method,headers:{Origin:base,Cookie:session.cookie,'X-CSRF-Token':session.csrf,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
  return {status:r.status,data:await r.json()};
}
const owner=await login('owner'),assistant=await login('assistant');
assert.equal((await call(owner,'/auth/me')).data.user.role,'owner');
assert.equal((await call(assistant,'/auth/me')).data.user.role,'assistant');
const first=await call(owner,'/dashboard'),second=await call(assistant,'/dashboard');
assert.equal(first.status,200);assert.deepEqual(first.data.bills,second.data.bills);
assert.ok(first.data.bills.length>=6);
const backup=await call(owner,'/export');assert.equal(backup.status,200);
assert.equal((await call(assistant,'/export')).status,403);
assert.equal((await call(assistant,'/settings','PUT',{threshold_cents:50000,reminder_days:3,recipient:'both'})).status,403);
assert.equal((await call(owner,'/settings')).data.payment.enabled,false);
assert.equal((await call(owner,`/bills/${first.data.bills[0].id}/checkout`,'POST',{})).status,503);
await call(owner,'/auth/logout','POST',{});await call(assistant,'/auth/logout','POST',{});
console.log(`PASS: ${base} · correo y contraseña, dos sesiones, roles y ${backup.data.state.bills.length} obligaciones trasladadas; pagos reales desactivados. No se alteraron obligaciones ni comprobantes.`);
