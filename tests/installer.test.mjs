import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {operate,resolveDataDir,safeRelative,root} from '../install.mjs';
async function temporary(t){const dir=await fs.mkdtemp(path.join(os.tmpdir(),'cola-muse-test-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));return dir;}
test('install, idempotent update, doctor and uninstall preserve unrelated files',async t=>{
 const dir=await temporary(t);await fs.mkdir(path.join(dir,'skills','personal'),{recursive:true});await fs.writeFile(path.join(dir,'skills','personal','SKILL.md'),'mine');
 assert.equal((await operate('install',dir)).count,25);
 assert.equal((await operate('doctor',dir)).skills.filter(s=>s.state==='installed').length,25);
 assert.equal((await operate('install',dir)).count,25);
 await operate('uninstall',dir);
 assert.equal(await fs.readFile(path.join(dir,'skills','personal','SKILL.md'),'utf8'),'mine');
 assert.equal((await operate('doctor',dir)).skills.filter(s=>s.state==='missing').length,25);
});
test('dry run creates no files',async t=>{const dir=await temporary(t);await operate('install',path.join(dir,'new'),{dryRun:true});await assert.rejects(fs.access(path.join(dir,'new')));});
test('local edits block both upgrade and uninstall without changing them',async t=>{const dir=await temporary(t);await operate('install',dir);const file=path.join(dir,'skills','muse-money','SKILL.md');await fs.appendFile(file,'\nlocal-edit\n');await assert.rejects(operate('install',dir),/本地修改/);await assert.rejects(operate('uninstall',dir),/本地修改/);assert.match(await fs.readFile(file,'utf8'),/local-edit/);assert.equal((await operate('doctor',dir)).skills.find(s=>s.name==='muse-money').state,'conflict');});
test('foreign same-name directory stops entire install before mutation',async t=>{const dir=await temporary(t);await fs.mkdir(path.join(dir,'skills','muse-work'),{recursive:true});await fs.writeFile(path.join(dir,'skills','muse-work','SKILL.md'),'mine');await assert.rejects(operate('install',dir),/不是本项目/);await assert.rejects(fs.access(path.join(dir,'skills','muse-admin')));});
test('tampered source fails before touching destination',async t=>{const dir=await temporary(t),source=path.join(dir,'source');await fs.mkdir(source);await fs.copyFile(path.join(root,'manifest.json'),path.join(source,'manifest.json'));await fs.cp(path.join(root,'skills'),path.join(source,'skills'),{recursive:true});await fs.appendFile(path.join(source,'skills','muse-money','SKILL.md'),'tamper');await assert.rejects(operate('install',path.join(dir,'data'),{sourceRoot:source}),/校验失败/);await assert.rejects(fs.access(path.join(dir,'data')));});
test('existing install lock prevents mutation',async t=>{const dir=await temporary(t);await fs.mkdir(path.join(dir,'skills'));await fs.writeFile(path.join(dir,'skills','.cola-muse-install.lock'),'');await assert.rejects(operate('install',dir),/正在进行/);assert.deepEqual(await fs.readdir(path.join(dir,'skills')),['.cola-muse-install.lock']);});
test('region detection rejects ambiguity and honors explicit/env paths',async t=>{const dir=await temporary(t);await assert.rejects(resolveDataDir(null,{},dir),/未找到/);await fs.mkdir(path.join(dir,'.cola-cn'));assert.equal(await resolveDataDir(null,{},dir),path.join(dir,'.cola-cn'));await fs.mkdir(path.join(dir,'.cola'));await assert.rejects(resolveDataDir(null,{},dir),/国际版和中国版/);assert.equal(await resolveDataDir(path.join(dir,'custom'),{},dir),path.join(dir,'custom'));assert.equal(await resolveDataDir(null,{COLA_DATA_DIR:path.join(dir,'env')},dir),path.join(dir,'env'));});
test('unsafe manifest paths rejected',()=>{for(const p of ['../escape','/absolute','a/../../b','a\\b','C:/x','a//b','a/./b'])assert.throws(()=>safeRelative(p));});
test('failed update rolls back previously replaced skill directories',async t=>{
 const dir=await temporary(t);await operate('install',dir);
 const original=await fs.readFile(path.join(dir,'skills','muse-admin','SKILL.md'),'utf8');
 const rename=fs.rename;
 t.mock.method(fs,'rename',async function(src,dst){if(src.includes(`${path.sep}new${path.sep}muse-bills`))throw Object.assign(Error('simulated disk error'),{code:'EACCES'});return rename(src,dst);});
 await assert.rejects(operate('install',dir),/simulated/);
 assert.equal(await fs.readFile(path.join(dir,'skills','muse-admin','SKILL.md'),'utf8'),original);
 assert.equal((await operate('doctor',dir)).skills.filter(s=>s.state==='installed').length,25);
 assert.equal((await fs.readdir(path.join(dir,'skills'))).some(x=>x.startsWith('.cola-muse')),false);
});
test('symlink destination never follows or deletes external files',{skip:process.platform==='win32'},async t=>{const dir=await temporary(t),external=path.join(dir,'external');await fs.mkdir(external);await fs.writeFile(path.join(external,'keep'),'keep');await fs.mkdir(path.join(dir,'data','skills'),{recursive:true});await fs.symlink(external,path.join(dir,'data','skills','muse-money'));await assert.rejects(operate('install',path.join(dir,'data')),/符号链接/);assert.equal(await fs.readFile(path.join(external,'keep'),'utf8'),'keep');});
test('installer and all helper CLIs execute through directory aliases instead of silently exiting',{skip:process.platform==='win32'},async t=>{
 const {execFile}=await import('node:child_process');const {promisify}=await import('node:util');const exec=promisify(execFile);
 const dir=await temporary(t),alias=path.join(dir,'alias');await fs.symlink(root,alias);
 const installer=await exec(process.execPath,[path.join(alias,'install.mjs'),'--help']);assert.match(installer.stdout,/install\|doctor\|uninstall/);
 for(const relative of ['skills/muse-money/scripts/audit-subscriptions.mjs','skills/muse-money/scripts/record-cancellation.mjs','skills/muse-family/scripts/calendar.mjs','skills/muse-learn/scripts/plan.mjs']){
  await assert.rejects(exec(process.execPath,[path.join(alias,relative)]),e=>e.code===1 && /Usage:/.test(e.stderr));
 }
});
