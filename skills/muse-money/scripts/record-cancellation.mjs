#!/usr/bin/env node
// Local evidence recording only. Does not cancel any remote subscription.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {audit,renderReport,timestamp,dateOnly} from './audit-subscriptions.mjs';
export function recordCancellation(input, proof) {
  audit(input);
  if (!proof || typeof proof.subscription_id!=='string' || !['account','cancellation_confirmation'].includes(proof.source) || proof.status!=='disabled' || typeof proof.ref!=='string' || !proof.ref.trim()) throw Error('Cancellation requires a subscription_id and verified disabled account/confirmation evidence');
  const observed=timestamp(proof.observed_at);
  if (proof.access_until!==null) dateOnly(proof.access_until);
  const next=structuredClone(input), records=next.subscriptions.filter(r=>r.id===proof.subscription_id);
  if (!records.length) throw Error('Unknown subscription_id');
  for (const r of records) {
    if (r.renewal_observations.some(o=>timestamp(o.observed_at)>observed || (timestamp(o.observed_at)===observed && o.status!=='disabled'))) throw Error('Cancellation proof conflicts with newer/equal-time evidence');
    const obs={status:'disabled',source:proof.source,observed_at:proof.observed_at,ref:proof.ref};
    if(!r.renewal_observations.some(o=>JSON.stringify(o)===JSON.stringify(obs)))r.renewal_observations.push(obs);
    if (proof.access_until!==null) r.access_until=proof.access_until;
    r.next_charge=null;
  }
  if (observed>timestamp(next.as_of)) next.as_of=proof.observed_at;
  const result=audit(next);
  if(result.items.find(r=>r.id===proof.subscription_id).effective_renewal.status!=='disabled')throw Error('Cancellation evidence is too old for this snapshot');
  return {input:next,result,report:renderReport(result)};
}
async function main() {
  const [input,proof,dir]=process.argv.slice(2);
  if(!input||!proof||!dir)throw Error('Usage: node record-cancellation.mjs subscriptions.json proof.json NEW_OUTPUT_DIRECTORY');
  const evidence=JSON.parse(await fs.readFile(proof,'utf8'));
  const updated=recordCancellation(JSON.parse(await fs.readFile(input,'utf8')),evidence);
  // Refuse existing directories so historical snapshots and personal files survive.
  await fs.mkdir(dir);
  try {
    await fs.writeFile(path.join(dir,'subscriptions.json'),JSON.stringify(updated.input,null,2)+'\n',{flag:'wx'});
    await fs.writeFile(path.join(dir,'audit-result.json'),JSON.stringify(updated.result,null,2)+'\n',{flag:'wx'});
    await fs.writeFile(path.join(dir,'report.md'),updated.report,{flag:'wx'});
  } catch(e) { await fs.rm(dir,{recursive:true,force:true}); throw e; }
  console.log(JSON.stringify({recorded_subscription_id:evidence.subscription_id,output_directory:path.resolve(dir),remote_action_performed:false}));
}
if(process.argv[1]&&await fs.realpath(process.argv[1]).catch(()=>null)===await fs.realpath(fileURLToPath(import.meta.url)))main().catch(e=>{console.error(e.message);process.exitCode=1;});
