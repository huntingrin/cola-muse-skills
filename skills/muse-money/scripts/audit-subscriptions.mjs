#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
export function audit(input) {
  if(!input || !Array.isArray(input.subscriptions)) throw Error('subscriptions must be an array');
  const seen=new Map(), byCurrency={}, items=[];
  for(const r of input.subscriptions) {
    if(!r || typeof r.id!=='string' || !r.id.trim() || typeof r.name!=='string' || !r.name.trim()) throw Error('Each item needs id and name');
    if(!['CNY','USD','EUR','GBP','AUD','CAD','HKD','SGD','CHF','NZD','INR','BRL'].includes(r.currency) || !Number.isSafeInteger(r.amount_cents) || r.amount_cents<0) throw Error(`Invalid amount/currency (only supported two-decimal currencies): ${r.id}`);
    if(!['monthly','annual','usage','one_time'].includes(r.interval) || !['active','cancelled','unknown'].includes(r.status)) throw Error(`Invalid interval/status: ${r.id}`);
    const canonical=JSON.stringify([r.name,r.currency,r.amount_cents,r.interval,r.status]);
    if(seen.has(r.id)) { if(seen.get(r.id)!==canonical) throw Error(`Conflicting duplicate: ${r.id}`); continue; }
    seen.set(r.id,canonical);
    const included=r.status==='active' && ['monthly','annual'].includes(r.interval);
    const annualCents=included ? r.amount_cents*(r.interval==='monthly'?12:1) : null;
    if(annualCents!==null && !Number.isSafeInteger(annualCents)) throw Error('Amount exceeds safe integer range');
    items.push({...r,included,annual_cents:annualCents});
    if(included) {
      byCurrency[r.currency]??={annual_cents:0,monthly_equivalent_cents:0};
      byCurrency[r.currency].annual_cents+=annualCents;
      if(!Number.isSafeInteger(byCurrency[r.currency].annual_cents)) throw Error('Total exceeds safe integer range');
    }
  }
  for(const v of Object.values(byCurrency)) v.monthly_equivalent_cents=Math.round(v.annual_cents/12);
  return {schema_version:1,method:'Active fixed costs only; annual total / 12 rounded once per currency. Not cash flow or confirmed savings.',by_currency:byCurrency,items,needs_review:items.filter(x=>x.status==='unknown').map(x=>x.id)};
}
async function main(){const [i,o]=process.argv.slice(2);if(!i||!o)throw Error('Usage: node audit-subscriptions.mjs input.json output.json');const result=audit(JSON.parse(await fs.readFile(i,'utf8')));await fs.writeFile(o,JSON.stringify(result,null,2)+'\n');}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(e=>{console.error(e.message);process.exitCode=1;});
