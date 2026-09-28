import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {root,treeHashes,safeName,safeRelative} from '../install.mjs';
const manifest=JSON.parse(await fs.readFile(path.join(root,'manifest.json'),'utf8'));
const actualNames=(await fs.readdir(path.join(root,'skills'))).sort();
assert.deepEqual(manifest.skills.map(s=>s.name).sort(),actualNames);
for(const s of manifest.skills){
 safeName(s.name);const dir=path.join(root,'skills',s.name),text=await fs.readFile(path.join(dir,'SKILL.md'),'utf8');
 assert.match(text,new RegExp(`^---\\nname: ${s.name}\\n`));
 const description=text.match(/^description: (.+)$/m)?.[1];assert.ok(description&&JSON.parse(description).length<1024);
 assert.ok(text.split('\n').length<500);
 assert.deepEqual(await treeHashes(dir),s.files,`Stale checksum: ${s.name}`);
 for(const f of Object.keys(s.files)){
  safeRelative(f);
  if(!f.endsWith('.md'))continue;
  const content=await fs.readFile(path.join(dir,f),'utf8');
  for(const match of content.matchAll(/\]\(([^)#]+)(?:#[^)]*)?\)/g)){
   if(/^https?:/.test(match[1]))continue;
   const target=path.resolve(dir,path.dirname(f),match[1]);
   assert.ok(target.startsWith(path.join(root,'skills')+path.sep));await fs.access(target);
  }
 }
}
const coverage=JSON.parse(await fs.readFile(path.join(root,'catalog','muse-coverage.json'),'utf8'));
assert.equal(coverage.cases.length,1081);assert.equal(new Set(coverage.cases.map(x=>x.id)).size,1081);
for(const c of coverage.cases){assert.ok(actualNames.includes(c.primary_skill));for(const s of c.related_skills)assert.ok(actualNames.includes(s));assert.equal(c.validation_status,'not_run');}
const skills=JSON.parse(await fs.readFile(path.join(root,'catalog','skills.json'),'utf8')).skills;
assert.equal(skills.length,24);for(const s of skills)assert.ok(actualNames.includes(s.name));
console.log(`Validated ${actualNames.length} skill packages, relative links, file hashes, and ${coverage.cases.length} source routes. This is structural validation, not business success.`);
