// Runs fixture-only prompts against an ALREADY PREPARED isolated Cola runtime.
// Does not log in, copy credentials, launch browsers, or publish raw traces.
import fs from 'node:fs/promises';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createHash} from 'node:crypto';
import {root} from '../install.mjs';
const exec=promisify(execFile);
const args=process.argv.slice(2),opts={};
while(args.length){const key=args.shift();if(!['--source','--data-dir','--output-dir','--server','--node-bin','--case'].includes(key)||!args.length)throw Error('Usage: node eval/run-cola.mjs --source COLA_REPO --data-dir ISOLATED_DATA --output-dir ISOLATED_OUTPUT --server HOST:PORT --node-bin SANDBOX_NODE [--case money|calendar|plan]');opts[key.slice(2)]=args.shift();}
for(const key of ['source','data-dir','output-dir','server','node-bin'])if(!opts[key])throw Error(`Missing --${key}`);
const data=path.resolve(opts['data-dir']),out=path.resolve(opts['output-dir']),source=path.resolve(opts.source);
const marker=JSON.parse(await fs.readFile(path.join(data,'.muse-offline-eval.json'),'utf8'));
if(marker.output_dir!==out||marker.browser_disabled!==true||marker.channels_disabled!==true||marker.crons_disabled!==true)throw Error('Isolated fixture runtime marker missing or invalid. See eval/README.md.');
if(await fs.realpath(path.join(data,'skills'))!==await fs.realpath(path.join(out,'skills')))throw Error('Skills must resolve inside the fixture tool root');
const base=`这是隔离的离线合成资料测试。只读取 ${out} 内的素材和技能，不读取真实账号、邮箱或其他个人资料，不用网络，不发送消息，不创建定时任务，不启动子代理。node 位于 ${opts['node-bin']}。完成实际文件交付并检查结果，不要只给建议。`;
const definitions={
 money:{file:'audit.json',skill:'muse-money',prompt:`请使用 muse-money v2 审计 ${out}/fixtures/receipts.txt。规范化输入写到 ${out}/subscriptions.json；用技能脚本同时生成 ${out}/audit.json 和 ${out}/report.md，再用中文简短总结。`,check:r=>{
  const rows=Object.fromEntries((r.items??[]).map(x=>[x.id,x]));
  return r.schema_version===2 && r.by_currency?.CNY?.annual_cents===42000 && r.by_currency.CNY.monthly_equivalent_cents===3500 && Object.keys(r.by_currency).length===1 && r.items.length===5 && Object.keys(rows).length===5 && r.items.every(x=>x.currency==='CNY')
   && rows.music?.amount_cents===18000 && rows.music.interval==='annual' && rows.music.included===true && rows.music.effective_renewal.status==='enabled'
   && rows.ai?.amount_cents===2000 && rows.ai.interval==='monthly' && rows.ai.included===true && rows.ai.effective_renewal.status==='enabled'
   && rows.stream?.effective_renewal.status==='disabled' && rows.stream.included===false && rows.stream.access_state==='paid_period_remaining'
   && rows.compute?.interval==='usage' && rows.compute.included===false && rows.compute.last_payment?.amount_cents===450
   && rows.unknown?.effective_renewal.status==='unknown' && rows.unknown.included===false && rows.unknown.last_payment?.amount_cents===500
   && rows.unknown.amount_cents===null && rows.unknown.rate_evidence===null && r.upcoming_charges?.length===0;
 }},
 calendar:{file:'school.ics',skill:'muse-family',prompt:`请把 ${out}/fixtures/school.txt 的通知整理成可导入的 ${out}/school.ics，保留改期和取消状态。请自动选用这套已安装的 Muse 技能中合适的技能，读取并执行其流程，使用附带的日历脚本。归一化输入保存为 ${out}/calendar-input.json。不要真的导入任何日历。`,check:s=>{
  const blocks=s.replace(/\r\n /g,'').split('BEGIN:VEVENT\r\n').slice(1);
  const expected={
   'rehearsal-1':['DTSTART:20261001T110000Z','DTEND:20261001T120000Z','STATUS:CONFIRMED'],
   'holiday-1':['DTSTART;VALUE=DATE:20261002','DTEND;VALUE=DATE:20261003','STATUS:CONFIRMED'],
   'match-1':['DTSTART:20261003T010000Z','DTEND:20261003T020000Z','STATUS:CANCELLED']
  };
  return blocks.length===3&&Object.entries(expected).every(([id,fields])=>{
   const uid=createHash('sha256').update('school-demo\0'+id).digest('hex').slice(0,32)+'@cola-muse-skills';
   const block=blocks.find(b=>b.startsWith('UID:'+uid+'\r\n'));return block&&fields.every(f=>block.includes(f+'\r\n'));
  });
 }},
 plan:{file:'plan.json',skill:'muse-learn',prompt:`请使用 muse-learn，为 ${out}/fixtures/project.json 的全部任务排出完整 90 天计划，使用技能脚本生成 ${out}/plan.json；检查工时、依赖和最后一天。输入的任务内容和时间不要增删。不要创建提醒。`,check:r=>{
   if(r.days?.length!==90||r.days[0].date!=='2026-10-01'||r.days.at(-1).date!=='2026-12-29'||r.total_minutes!==2400||r.buffer_minutes!==300||r.days.some(d=>d.minutes>30))return false;
   const totals={},order=[];let sum=0;
   for(let i=0;i<r.days.length;i++){const d=r.days[i];if(d.date!==new Date(Date.UTC(2026,9,1+i)).toISOString().slice(0,10))return false;let daily=0;for(const a of d.activities){totals[a.id]=(totals[a.id]??0)+a.minutes;daily+=a.minutes;order.push(a.id);}if(daily!==d.minutes)return false;sum+=daily;}
   return sum===2400&&JSON.stringify(Object.keys(totals).sort())===JSON.stringify(['build','outline','review'])&&totals.outline===300&&totals.build===1800&&totals.review===300&&order.lastIndexOf('outline')<order.indexOf('build')&&order.lastIndexOf('build')<order.indexOf('review');
 }}
};
const ids=opts.case?[opts.case]:Object.keys(definitions);
const results=[];
await fs.mkdir(path.join(out,'traces'),{recursive:true});
for(const id of ids){
 const def=definitions[id];if(!def)throw Error('Unknown case');
 const outputFile=path.join(out,def.file);
 try{await fs.access(outputFile);throw Error(`Output already exists: ${def.file}; use a fresh workspace to prevent stale passes`);}catch(e){if(e.code!=='ENOENT')throw e;}
 const started=Date.now();let stdout='',stderr='',cli,runError;
 try{
  ({stdout,stderr}=await exec(process.execPath,[path.join(source,'node_modules/tsx/dist/cli.mjs'),path.join(source,'apps/cli/index.ts'),'message',base+'\n'+def.prompt,'--json','--server',opts.server,'--session',`cli:muse-eval-${id}-${Date.now()}`],{cwd:source,env:{...process.env,COLA_DATA_DIR:data,COLA_OUTPUT_DIR:out,COLA_ALLOW_OUTPUT_DIR_OVERRIDE:'1',COLA_CLI_TIMEOUT_MS:'240000'},timeout:270000,maxBuffer:16*1024*1024}));
  const start=stdout.indexOf('{');cli=JSON.parse(stdout.slice(start));
 }catch(e){stdout=e.stdout??stdout;stderr=e.stderr??stderr;runError=e.code??'cli_or_parse_error';}
 await fs.writeFile(path.join(out,'traces',id+'-raw.txt'),stdout+'\n'+stderr,{mode:0o600});
 const steps=cli?.steps??[];
 const skillRead=steps.some(s=>s.toolName==='read'&&!s.isError&&JSON.stringify(s.input).includes(def.skill+'/SKILL.md'));
 const scriptRun=steps.some(s=>s.toolName==='bash'&&!s.isError&&JSON.stringify(s.input).includes(def.skill+'/scripts/'));
 let verified=false,hash=null;
 try{const bytes=await fs.readFile(outputFile);verified=def.check(def.file.endsWith('.json')?JSON.parse(bytes.toString()):bytes.toString());hash=createHash('sha256').update(bytes).digest('hex');}catch{}
 const status=!runError&&!cli?.timedOut&&verified&&skillRead&&scriptRun?'offline_agent_pass':'fail_or_blocked';
 results.push({case:id,status,skill:def.skill,skill_read_observed:skillRead,script_execution_observed:scriptRun,independent_output_checks_passed:verified,artifact: def.file,artifact_sha256:hash,duration_ms:Date.now()-started,tool_calls:steps.length,usage:cli?.usage??null,...(runError?{error_code:String(runError)}:{})});
 console.log(JSON.stringify(results.at(-1)));
}
await fs.writeFile(path.join(out,'traces',`summary-${ids.join('-')}.json`),JSON.stringify({schema_version:1,scope:'Synthetic fixtures in isolated Cola runtime. Not a live business success claim.',results},null,2)+'\n');
if(results.some(r=>r.status!=='offline_agent_pass'))process.exitCode=1;
