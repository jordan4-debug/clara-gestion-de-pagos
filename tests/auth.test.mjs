import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {authenticate} from '../server/auth.mjs';
import {hashPassword} from '../server/passwords.mjs';
function memory(){
  const sqlite=new DatabaseSync(':memory:');sqlite.exec('PRAGMA foreign_keys=ON');sqlite.exec(readFileSync('migrations/0001_schema.sql','utf8'));
  const db={prepare(sql){let values=[];return {bind(...args){values=args;return this;},async first(){return sqlite.prepare(sql).get(...values);},async run(){return {meta:{changes:sqlite.prepare(sql).run(...values).changes}};}};},async batch(statements){sqlite.exec('BEGIN');try{const rows=[];for(const statement of statements)rows.push(await statement.run());sqlite.exec('COMMIT');return rows;}catch(error){sqlite.exec('ROLLBACK');throw error;}}};
  return {sqlite,db};
}
const request=(path,body,cookie='',csrf='')=>new Request('https://clara.example/api'+path,{method:body===undefined?'GET':'POST',headers:{Origin:'https://clara.example',Cookie:cookie,'X-CSRF-Token':csrf,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
test('Private login trusts stored roles, revokes other sessions on password change, and disables public demo',async()=>{
  const {db,sqlite}=memory(),env={DB:db,DEMO_MODE:'false'},password='Cuenta local privada 2026!';
  const hash=await hashPassword(password);
  sqlite.prepare('INSERT INTO accounts(email,name,role,password_hash,demo) VALUES(?,?,?,?,0)').run('asistente@clara.example','Cuenta de prueba','assistant',hash);
  await assert.rejects(authenticate(request('/auth/demo',{role:'owner'}),env,'/auth/demo'),e=>e.status===403);
  const login=async(password)=>{const result=await authenticate(request('/auth/login',{email:'asistente@clara.example',password,role:'owner'}),env,'/auth/login');return {cookie:result.response.headers.get('set-cookie').split(';')[0],...(await result.response.json())};};
  const first=await login(password),second=await login(password);
  assert.equal(first.user.role,'assistant');assert.equal(first.user.demo,false);
  await assert.rejects(authenticate(request('/auth/password',{current:password,password:'Nueva clave privada 2026!'},first.cookie,'invalid'),env,'/auth/password'),e=>e.status===403);
  await authenticate(request('/auth/password',{current:password,password:'Nueva clave privada 2026!'},first.cookie,first.csrf),env,'/auth/password');
  await assert.rejects(authenticate(request('/auth/me',undefined,second.cookie),env,'/auth/me'),e=>e.status===401);
  await assert.rejects(login(password),e=>e.status===401);
  assert.equal((await login('Nueva clave privada 2026!')).user.role,'assistant');
  sqlite.close();
});
