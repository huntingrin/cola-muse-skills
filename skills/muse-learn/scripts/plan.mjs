#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
export function plan(input){
  if(!input||typeof input.start_date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(input.start_date)||!Number.isFinite(Date.parse(input.start_date))||new Date(input.start_date).toISOString().slice(0,10)!==input.start_date)throw Error('Valid start_date required');
  if(!Number.isInteger(input.days)||input.days<1||input.days>3660||!Number.isSafeInteger(input.daily_minutes)||input.daily_minutes<1)throw Error('Invalid day count or daily budget');
  if(!Array.isArray(input.tasks))throw Error('tasks required');
  const tasks=new Map();
  for(const t of input.tasks){
    if(!t||typeof t.id!=='string'||!t.id||tasks.has(t.id)||typeof t.title!=='string'||!t.title.trim()||!Number.isSafeInteger(t.minutes)||t.minutes<1)throw Error('Invalid or duplicate task');
    if(t.depends_on!==undefined&&(!Array.isArray(t.depends_on)||t.depends_on.some(x=>typeof x!=='string')))throw Error('depends_on must contain task ids');
    tasks.set(t.id,t);
  }
  const sorted=[],visiting=new Set(),done=new Set();
  function visit(id){if(done.has(id))return;if(visiting.has(id))throw Error('Dependency cycle');const t=tasks.get(id);if(!t)throw Error(`Unknown dependency: ${id}`);visiting.add(id);for(const dep of t.depends_on??[])visit(dep);visiting.delete(id);done.add(id);sorted.push(t);}
  for(const id of tasks.keys())visit(id);
  const total=sorted.reduce((s,t)=>s+t.minutes,0),capacity=input.days*input.daily_minutes;
  if(!Number.isSafeInteger(total)||!Number.isSafeInteger(capacity))throw Error('Minutes exceed safe integer range');
  if(total>capacity)throw Error(`Plan exceeds capacity by ${total-capacity} minutes`);
  const days=Array.from({length:input.days},(_,i)=>({date:new Date(Date.parse(input.start_date)+i*86400000).toISOString().slice(0,10),minutes:0,activities:[]}));
  let d=0;
  for(const t of sorted){let left=t.minutes;while(left){if(days[d].minutes===input.daily_minutes)d++;const minutes=Math.min(left,input.daily_minutes-days[d].minutes);days[d].activities.push({id:t.id,title:t.title,minutes});days[d].minutes+=minutes;left-=minutes;}}
  return {schema_version:1,total_minutes:total,capacity_minutes:capacity,buffer_minutes:capacity-total,daily_budget:input.daily_minutes,days};
}
async function main(){const[i,o]=process.argv.slice(2);if(!i||!o)throw Error('Usage: node plan.mjs input.json output.json');await fs.writeFile(o,JSON.stringify(plan(JSON.parse(await fs.readFile(i,'utf8'))),null,2)+'\n');}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(e=>{console.error(e.message);process.exitCode=1;});
