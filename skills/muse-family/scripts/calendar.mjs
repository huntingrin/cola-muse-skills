#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const escape=s=>String(s??'').replace(/\\/g,'\\\\').replace(/\r\n|\r|\n/g,'\\n').replace(/;/g,'\\;').replace(/,/g,'\\,');
export function validDate(s){if(typeof s!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(s)||!Number.isFinite(Date.parse(s))||new Date(s).toISOString().slice(0,10)!==s)throw Error(`Invalid date: ${s}`);return s;}
function instant(s){
  if(typeof s!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d(?::\d\d)?(?:Z|[+-]\d\d:\d\d)$/.test(s))throw Error('Timed events require explicit timezone offsets');
  validDate(s.slice(0,10));
  const hour=Number(s.slice(11,13)),minute=Number(s.slice(14,16));
  const second=s.length>=20&&s[16]===':'?Number(s.slice(17,19)):0;
  if(hour>23||minute>59||second>59||!Number.isFinite(Date.parse(s)))throw Error(`Invalid time: ${s}`);
  return new Date(s).toISOString().replace(/[-:]/g,'').replace('.000','');
}
function fold(line){let lines=[],current='';for(const c of line){if(Buffer.byteLength(current+c,'utf8')>75){lines.push(current);current=' ';}current+=c;}lines.push(current);return lines.join('\r\n');}
export function calendar(input){
  if(!input||!Array.isArray(input.events)||typeof input.namespace!=='string'||!input.namespace.trim())throw Error('namespace and events required');
  const stamp=instant(input.exported_at), lines=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//huntingrin//Cola Muse Skills//ZH','CALSCALE:GREGORIAN'];
  const seen=new Map();
  for(const e of input.events){
    if(!e||typeof e.id!=='string'||!e.id.trim()||typeof e.summary!=='string'||!e.summary.trim())throw Error('Event id and summary required');
    if('rrule' in e||'recurrence' in e)throw Error('Expand recurrence into explicit instances before export');
    if(e.status && !['confirmed','cancelled'].includes(e.status))throw Error('Invalid event status');
    if(e.sequence!==undefined&&(!Number.isSafeInteger(e.sequence)||e.sequence<0))throw Error('sequence must be a nonnegative integer');
    if(e.all_day!==undefined&&typeof e.all_day!=='boolean')throw Error('all_day must be boolean');
    const normalized=JSON.stringify([e.summary,e.start,e.end,!!e.all_day,e.location??'',e.description??'',e.status??'confirmed',e.sequence??0]);
    if(seen.has(e.id)){if(seen.get(e.id)!==normalized)throw Error(`Conflicting event revisions: ${e.id}`);continue;}seen.set(e.id,normalized);
    const start=e.all_day?validDate(e.start).replaceAll('-',''):instant(e.start);
    const end=e.all_day?validDate(e.end).replaceAll('-',''):instant(e.end);
    if(end<=start)throw Error('End must follow start; all-day end is exclusive');
    const uid=createHash('sha256').update(input.namespace+'\0'+e.id).digest('hex').slice(0,32)+'@cola-muse-skills';
    const suffix=e.all_day?';VALUE=DATE':'';
    lines.push('BEGIN:VEVENT',`UID:${uid}`,`DTSTAMP:${stamp}`,`SEQUENCE:${e.sequence??0}`,`DTSTART${suffix}:${start}`,`DTEND${suffix}:${end}`,`SUMMARY:${escape(e.summary)}`,`LOCATION:${escape(e.location)}`,`DESCRIPTION:${escape(e.description)}`,`STATUS:${e.status==='cancelled'?'CANCELLED':'CONFIRMED'}`,'END:VEVENT');
  }
  lines.push('END:VCALENDAR');return lines.map(fold).join('\r\n')+'\r\n';
}
async function main(){const[i,o]=process.argv.slice(2);if(!i||!o)throw Error('Usage: node calendar.mjs input.json output.ics');await fs.writeFile(o,calendar(JSON.parse(await fs.readFile(i,'utf8'))));}
if(process.argv[1]&&await fs.realpath(process.argv[1]).catch(()=>null)===await fs.realpath(fileURLToPath(import.meta.url)))main().catch(e=>{console.error(e.message);process.exitCode=1;});
