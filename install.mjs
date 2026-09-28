#!/usr/bin/env node
// No dependencies, network calls, credentials, or edits to Cola settings.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createHash, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const root = path.dirname(fileURLToPath(import.meta.url));
const owner = 'huntingrin/cola-muse-skills';
const receiptName = '.cola-muse-receipt.json';
const digest = b => createHash('sha256').update(b).digest('hex');
async function exists(p) { try { await fs.lstat(p); return true; } catch (e) { if(e.code === 'ENOENT') return false; throw e; } }
async function json(p) { return JSON.parse(await fs.readFile(p, 'utf8')); }
export function safeName(n) { if (typeof n !== 'string' || !/^muse-[a-z0-9-]+$/.test(n)) throw Error(`Invalid skill name: ${n}`); return n; }
export function safeRelative(p) {
  if (typeof p !== 'string' || !p || p.includes('\\') || path.posix.isAbsolute(p) || p.split('/').some(x => !x || x === '.' || x === '..') || p.includes(':')) throw Error(`Invalid relative path: ${p}`);
  return p;
}
export async function treeHashes(dir, prefix = '') {
  const out = {};
  for (const e of (await fs.readdir(path.join(dir, prefix), { withFileTypes: true })).sort((a,b)=>a.name.localeCompare(b.name))) {
    const rel = prefix ? `${prefix}/${e.name}` : e.name;
    if (rel === receiptName) continue;
    if (e.isSymbolicLink()) throw Error(`Symbolic links are not allowed: ${rel}`);
    if (e.isDirectory()) Object.assign(out, await treeHashes(dir, rel));
    else if (e.isFile()) out[rel] = digest(await fs.readFile(path.join(dir, rel)));
    else throw Error(`Unsupported file: ${rel}`);
  }
  return out;
}
const equalHashes = (a,b) => JSON.stringify(Object.entries(a).sort()) === JSON.stringify(Object.entries(b).sort());
export async function resolveDataDir(explicit, env = process.env, home = os.homedir()) {
  if (explicit || env.COLA_DATA_DIR) return path.resolve(explicit || env.COLA_DATA_DIR);
  const dirs = [];
  for (const name of ['.cola', '.cola-cn']) if (await exists(path.join(home,name))) dirs.push(path.join(home,name));
  if (dirs.length === 1) return dirs[0];
  if (dirs.length > 1) throw Error('检测到国际版和中国版：请使用 --data-dir 指定正在使用的 Cola 数据目录。');
  throw Error('未找到 Cola 数据目录。请先打开 Cola，或使用 --data-dir 指定目录。');
}
async function verifySource(sourceRoot) {
  const m = await json(path.join(sourceRoot,'manifest.json'));
  if (m.schema_version !== 1 || m.repository !== owner || !Array.isArray(m.skills) || !m.skills.length) throw Error('Invalid manifest');
  const names = new Set();
  for (const s of m.skills) {
    safeName(s.name);
    if (names.has(s.name)) throw Error('Duplicate skill');
    names.add(s.name);
    if (!s.files || !s.files['SKILL.md']) throw Error('Missing skill entrypoint');
    Object.keys(s.files).forEach(safeRelative);
    const dir = path.join(sourceRoot,'skills',s.name);
    if ((await fs.lstat(dir)).isSymbolicLink()) throw Error('Source skill cannot be a symbolic link');
    if (!equalHashes(await treeHashes(dir), s.files)) throw Error(`源文件校验失败：${s.name}`);
  }
  return m;
}
async function ownedReceipt(dir, name) {
  if ((await fs.lstat(dir)).isSymbolicLink()) throw Error(`拒绝修改符号链接：${name}`);
  let r;
  try { r = await json(path.join(dir,receiptName)); } catch { throw Error(`同名目录不是本项目安装的，已保留：${name}`); }
  if (r.repository !== owner || r.skill !== name || !r.files) throw Error(`无效安装记录：${name}`);
  if (!equalHashes(await treeHashes(dir),r.files)) throw Error(`技能有本地修改，已保留：${name}。请先备份后处理。`);
  return r;
}
export async function operate(action, dataDir, { sourceRoot = root, dryRun = false } = {}) {
  if (!['install','uninstall','doctor'].includes(action)) throw Error(`Unknown action: ${action}`);
  const m = await verifySource(sourceRoot);
  const target = path.join(dataDir,'skills');
  if (await exists(target) && (await fs.lstat(target)).isSymbolicLink()) throw Error('Skills root cannot be a symbolic link');
  const states = [];
  for (const s of m.skills) {
    const dst = path.join(target,s.name);
    if (!(await exists(dst))) { states.push({name:s.name,state:'missing'}); continue; }
    try {
      const r = await ownedReceipt(dst,s.name);
      states.push({name:s.name,state:equalHashes(r.files,s.files)?'installed':'update_available',version:r.version});
    } catch(e) {
      if (action !== 'doctor') throw e;
      states.push({name:s.name,state:'conflict',reason:e.message});
    }
  }
  if (action === 'doctor' || dryRun) return {action,dry_run:dryRun,data_dir:dataDir,version:m.version,skills:states,account_connections:'not_checked'};
  await fs.mkdir(target,{recursive:true});
  const lock = path.join(target,'.cola-muse-install.lock');
  let handle;
  try { handle = await fs.open(lock,'wx'); } catch(e) { if(e.code==='EEXIST') throw Error('另一个安装/卸载操作正在进行；确认没有进程运行后再清理安装锁。'); throw e; }
  const stage = path.join(target,`.cola-muse-stage-${randomUUID()}`);
  const applied = [];
  let committed = false;
  try {
    // Re-check after acquiring the lock; preflight must hold at mutation time.
    for (const s of m.skills) if (await exists(path.join(target,s.name))) await ownedReceipt(path.join(target,s.name),s.name);
    await fs.mkdir(stage);
    if(action === 'install') for(const s of m.skills) {
      const staged=path.join(stage,'new',s.name);
      await fs.cp(path.join(sourceRoot,'skills',s.name),staged,{recursive:true});
      await fs.writeFile(path.join(staged,receiptName),JSON.stringify({repository:owner,skill:s.name,version:m.version,files:s.files},null,2)+'\n');
    }
    await fs.mkdir(path.join(stage,'old'));
    for (const s of m.skills) {
      const dst=path.join(target,s.name), backup=path.join(stage,'old',s.name);
      const hadOld=await exists(dst);
      if(hadOld) await fs.rename(dst,backup);
      applied.push({dst,backup,hadOld,installed:false});
      if(action==='install') { await fs.rename(path.join(stage,'new',s.name),dst); applied.at(-1).installed=true; }
    }
    committed = true;
    await fs.rm(stage,{recursive:true,force:true});
    return {action,data_dir:dataDir,version:m.version,count:action==='install'?m.skills.length:applied.filter(x=>x.hadOld).length,account_connections:'not_changed'};
  } catch(e) {
    if(committed) throw Error(`文件已${action==='install'?'安装':'移除'}，备份清理失败；请保留 ${stage} 并运行 doctor 检查。`);
    for(const item of applied.reverse()) {
      if(item.installed) await fs.rm(item.dst,{recursive:true,force:true});
      if(item.hadOld) await fs.rename(item.backup,item.dst);
    }
    await fs.rm(stage,{recursive:true,force:true});
    throw e;
  } finally { await handle.close(); await fs.unlink(lock); }
}
async function main() {
  const args=process.argv.slice(2);
  if(args.includes('--help') || !args.length) {
    console.log('node install.mjs install|doctor|uninstall [--data-dir PATH] [--dry-run]\n安装不连接账号、不购买服务、不改 Cola 设置。'); return;
  }
  const action=args.shift(); let explicit, dryRun=false;
  while(args.length) { const a=args.shift(); if(a==='--data-dir') { explicit=args.shift(); if(!explicit || explicit.startsWith('--')) throw Error('--data-dir needs a path'); } else if(a==='--dry-run') dryRun=true; else throw Error(`Unknown option: ${a}`); }
  const dataDir=await resolveDataDir(explicit);
  console.log(JSON.stringify(await operate(action,dataDir,{dryRun}),null,2));
}
if (process.argv[1] && await fs.realpath(process.argv[1]).catch(()=>null) === await fs.realpath(fileURLToPath(import.meta.url))) main().catch(e=>{console.error(e.message);process.exitCode=1;});
