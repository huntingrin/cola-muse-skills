import fs from 'node:fs/promises';
import path from 'node:path';
import {root,treeHashes} from '../install.mjs';
const pkg=JSON.parse(await fs.readFile(path.join(root,'package.json'),'utf8'));
const names=(await fs.readdir(path.join(root,'skills'))).sort();
const skills=[];
for(const name of names) skills.push({name,files:await treeHashes(path.join(root,'skills',name))});
await fs.writeFile(path.join(root,'manifest.json'),JSON.stringify({schema_version:1,repository:'huntingrin/cola-muse-skills',version:pkg.version,skills},null,2)+'\n');
console.log(`Manifest: ${skills.length} skills`);
