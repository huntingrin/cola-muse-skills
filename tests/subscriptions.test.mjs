import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
import {audit,renderReport} from '../skills/muse-money/scripts/audit-subscriptions.mjs';
import {recordCancellation} from '../skills/muse-money/scripts/record-cancellation.mjs';
const exec=promisify(execFile),root=fileURLToPath(new URL('../',import.meta.url));
const at='2026-09-28T12:00:00+08:00';
const quote=(amount=2000)=>({amount_cents:amount,amount_basis:'gross',tax_cents:null});
const observation=(status='enabled',source='account',observed_at=at)=>({status,source,observed_at,ref:'synthetic-account-view'});
const sub=(id='monthly',changes={})=>({id,name:id,currency:'CNY',...quote(),rate_evidence:{observed_at:at,ref:'synthetic-current-rate'},interval:'monthly',access_until:'2026-11-01',last_payment:{date:'2026-09-01',...quote(),ref:'synthetic-receipt'},next_charge:{observed_at:at,date:'2026-10-01',...quote(),ref:'synthetic-next-quote'},source_ids:['fixture'],renewal_observations:[observation()],review_notes:[],...changes});
const input=(subscriptions=[sub()],changes={})=>({schema_version:2,as_of:at,coverage:{start:'2025-08-28',end_exclusive:'2026-09-29',sources:[{id:'fixture',kind:'file',complete:true}],limitations:[]},subscriptions,...changes});
const proof={subscription_id:'monthly',status:'disabled',source:'account',observed_at:'2026-09-28T13:00:00+08:00',ref:'synthetic-refreshed-cancel-panel',access_until:'2026-11-01'};
test('legacy active fields require migration, never imply verified renewal',()=>{
 assert.throws(()=>audit({subscriptions:[{status:'active'}]}),/Schema v2/);
 assert.throws(()=>audit(input([sub('old',{status:'active'})])),/legacy status/);
});
test('unknown interval or amount survives without placeholder values or annualization',()=>{
 const r=audit(input([sub('period',{interval:'unknown',amount_cents:4050,next_charge:null}),sub('price',{amount_cents:null,next_charge:null}),sub('currency',{currency:null,next_charge:null})]));
 assert.deepEqual(r.by_currency,{});assert.equal(r.items[0].interval,'unknown');assert.equal(r.items[1].amount_cents,null);assert.equal(r.needs_review.length,3);assert.ok(r.items.every(x=>x.annual_cents===null));
});
test('historical receipt or renewal notice does not verify current account renewal',()=>{
 const r=audit(input([sub('receipt',{renewal_observations:[observation('enabled','receipt')]}),sub('notice',{renewal_observations:[observation('enabled','renewal_notice')]}),sub('none',{renewal_observations:[]})]));
 assert.deepEqual(r.by_currency,{});assert.equal(r.upcoming_charges.length,0);assert.ok(r.items.every(x=>x.effective_renewal.status==='unknown'));
});
test('stale, conflicting and newer unknown evidence cannot silently preserve active status',()=>{
 for(const observations of [[observation('enabled','account','2026-08-01T12:00:00+08:00')],[observation(),observation('disabled')],[observation('enabled','account','2026-09-27T12:00:00+08:00'),observation('unknown')]]) {
  const r=audit(input([sub('a',{renewal_observations:observations})]));assert.equal(r.items[0].effective_renewal.status,'unknown');assert.deepEqual(r.by_currency,{});
 }
});
test('only verified fixed gross rates count; currencies remain separate and rounding occurs once',()=>{
 const r=audit(input([sub('monthly'),sub('annual',{interval:'annual',amount_cents:18000}),sub('usd',{currency:'USD',amount_cents:1000}),sub('usage',{interval:'usage'}),sub('one-time',{interval:'one_time'}),sub('monthly')]));
 assert.deepEqual(r.by_currency,{CNY:{annual_cents:42000,monthly_equivalent_cents:3500},USD:{annual_cents:12000,monthly_equivalent_cents:1000}});assert.equal(r.items.length,5);
 const rounded=audit(input([sub('a',{interval:'annual',amount_cents:5}),sub('b',{interval:'annual',amount_cents:5})]));assert.equal(rounded.by_currency.CNY.monthly_equivalent_cents,1);
});
test('known tax is included once and unknown tax excludes a net quote',()=>{
 const r=audit(input([sub('net',{interval:'annual',amount_cents:20000,amount_basis:'net',tax_cents:1800}),sub('tax-unknown',{amount_basis:'net',tax_cents:null}),sub('basis-unknown',{amount_basis:'unknown'})]));
 assert.equal(r.by_currency.CNY.annual_cents,21800);assert.deepEqual(r.needs_review,['tax-unknown','basis-unknown']);assert.throws(()=>audit(input([sub('double-tax',{tax_cents:100})])),/tax_cents/);
});
test('next price is independent from historical payment and current annualized rate',()=>{
 const r=audit(input([sub('price-change',{interval:'annual',amount_cents:16000,last_payment:{date:'2025-10-17',...quote(16000),ref:'old-receipt'},next_charge:{observed_at:at,date:'2026-10-17',...quote(24000),ref:'price-change-notice'}})]));
 assert.equal(r.by_currency.CNY.annual_cents,16000);assert.equal(r.upcoming_charges[0].gross_amount_cents,24000);assert.equal(r.items[0].last_payment.amount_cents,16000);
});
test('upcoming window has exact calendar boundaries, excluding day 30 and day 31',()=>{
 const rows=['2026-09-28','2026-10-27','2026-10-28','2026-10-29'].map(date=>sub(date,{next_charge:{observed_at:at,date,...quote(),ref:'synthetic-schedule'}}));
 const r=audit(input(rows));assert.deepEqual(r.upcoming_charges.map(x=>x.date),['2026-09-28','2026-10-27']);assert.equal(r.upcoming_window.end_exclusive,'2026-10-28');
});
test('future evidence, impossible dates and past next charge fail rather than rolling forward',()=>{
 assert.throws(()=>audit(input([sub('a',{renewal_observations:[observation('enabled','account','2026-09-29T12:00:00Z')]})])),/after as_of/);
 assert.throws(()=>audit(input([sub('a',{next_charge:{observed_at:at,date:'2026-02-30',...quote(),ref:'x'}})])),/date/);
 assert.throws(()=>audit(input([sub('a',{next_charge:{observed_at:at,date:'2026-09-01',...quote(),ref:'x'}})])),/past/);
 assert.throws(()=>audit(input([],{as_of:'2026-09-28T24:00:00Z'})),/timestamp/);
});
test('cancellation closes renewal, preserves paid access and prior snapshot, recomputes all outputs',()=>{
 const before=input(),serialized=JSON.stringify(before),updated=recordCancellation(before,proof);
 assert.equal(JSON.stringify(before),serialized);assert.equal(updated.result.items[0].effective_renewal.status,'disabled');assert.equal(updated.result.items[0].access_state,'paid_period_remaining');assert.equal(updated.input.subscriptions[0].last_payment.amount_cents,2000);assert.equal(updated.input.subscriptions[0].next_charge,null);assert.deepEqual(updated.result.by_currency,{});assert.equal(updated.result.upcoming_charges.length,0);assert.match(updated.report,/已核实关闭/);assert.deepEqual(recordCancellation(updated.input,proof),updated);
});
test('cancellation requires real confirmation type, matching item and fresh noncontradictory evidence',()=>{
 assert.throws(()=>recordCancellation(input(),{...proof,source:'receipt'}),/verified/);
 assert.throws(()=>recordCancellation(input(),{...proof,subscription_id:'other'}),/Unknown/);
 assert.throws(()=>recordCancellation(input(),{...proof,observed_at:'2026-09-27T13:00:00+08:00'}),/conflicts/);
 assert.throws(()=>recordCancellation(input(),{...proof,observed_at:at}),/conflicts/);
 const later=input([sub('monthly',{renewal_observations:[],next_charge:null})],{as_of:'2026-12-01T12:00:00+08:00'});assert.throws(()=>recordCancellation(later,proof),/too old/);
});
test('disabled renewal with scheduled next charge is rejected as inconsistent',()=>{
 assert.throws(()=>audit(input([sub('a',{renewal_observations:[observation('disabled')]})])),/Disabled/);
 const r=audit(input([sub('a',{renewal_observations:[observation('disabled')],next_charge:null})]));assert.deepEqual(r.by_currency,{});assert.equal(r.items[0].access_state,'paid_period_remaining');
});
test('coverage detects full last page, unresolved search errors and mismatched windows',()=>{
 const q={id:'query',start:'2025-08-28',end_exclusive:'2026-09-29',pages:[{count:500,limit:500}],exhausted:true,errors:[]};
 function run(query){const v=input();v.coverage.sources=[{id:'fixture',kind:'mailbox',queries:[query]}];return audit(v);}
 assert.equal(run(q).coverage.status,'partial');
 const complete={...q,pages:[...q.pages,{count:0,limit:500}]};assert.equal(run(complete).coverage.status,'complete_for_declared_sources');
 assert.equal(run({...complete,errors:['non-ASCII query failed']}).coverage.status,'partial');
 assert.equal(run({...complete,start:'2025-08-01'}).coverage.status,'partial');
 assert.equal(run({...complete,exhausted:false}).coverage.status,'partial');
});
test('unresolved duplicate or billing ambiguity stays outside confirmed total',()=>{
 const r=audit(input([sub('ambiguous',{review_notes:['Two similarly named plans; verify account IDs']})]));assert.deepEqual(r.by_currency,{});assert.equal(r.upcoming_charges.length,0);assert.deepEqual(r.needs_review,['ambiguous']);
 assert.throws(()=>audit(input([sub(),sub('monthly',{amount_cents:3000})])),/Conflicting duplicate/);
});
test('currency precision and integer overflow remain guarded',()=>{
 for(const currency of ['JPY','KWD'])assert.throws(()=>audit(input([sub('a',{currency})])),/currency/);
 for(const amount_cents of [-1,1.5,Number.MAX_SAFE_INTEGER])assert.throws(()=>audit(input([sub('a',{amount_cents})])),/amount|Amount/);
});
test('report mirrors computed states, quotes and unknowns without inventing upper estimates',()=>{
 const r=audit(input([sub('unknown',{interval:'unknown',amount_cents:null,renewal_observations:[],next_charge:null}),sub('annual',{interval:'annual',amount_cents:16000,next_charge:{observed_at:at,date:'2026-10-17',...quote(24000),ref:'quote'}})]));
 const report=renderReport(r);assert.match(report,/CNY 160\.00/);assert.match(report,/CNY 240\.00/);assert.match(report,/待核实/);assert.doesNotMatch(report,/null|NaN|undefined/);
});
test('CLI delivers reproducible audit and a separate cancellation snapshot without overwriting history',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'muse-v2-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));
 const source=path.join(dir,'input.json'),p=path.join(dir,'proof.json');await fs.writeFile(source,JSON.stringify(input()));await fs.writeFile(p,JSON.stringify(proof));
 const command=path.join(root,'skills/muse-money/scripts/audit-subscriptions.mjs');
 await exec(process.execPath,[command,source,path.join(dir,'audit.json'),path.join(dir,'report.md')]);
 const result=JSON.parse(await fs.readFile(path.join(dir,'audit.json'),'utf8'));assert.equal(result.by_currency.CNY.annual_cents,24000);assert.equal(await fs.readFile(path.join(dir,'report.md'),'utf8'),renderReport(result));
 const cancel=path.join(root,'skills/muse-money/scripts/record-cancellation.mjs'),output=path.join(dir,'after');
 await exec(process.execPath,[cancel,source,p,output]);assert.deepEqual(JSON.parse(await fs.readFile(path.join(output,'audit-result.json'),'utf8')).by_currency,{});
 await assert.rejects(exec(process.execPath,[cancel,source,p,output]),/EEXIST/);assert.deepEqual(JSON.parse(await fs.readFile(source,'utf8')),input());
 await assert.rejects(exec(process.execPath,[command,source,source]),/must differ/);
});

test('old rate and stale next-charge evidence cannot become current prices or forecasts',()=>{
 const stale='2026-07-01T12:00:00+08:00';
 const r=audit(input([sub('a',{rate_evidence:{observed_at:stale,ref:'old-rate'},next_charge:{observed_at:stale,date:'2026-10-01',...quote(),ref:'old-plan'}}),sub('b',{rate_evidence:null,next_charge:null})]));
 assert.deepEqual(r.by_currency,{});assert.equal(r.upcoming_charges.length,0);assert.deepEqual(r.needs_review,['a','b']);
});
test('published synthetic regression fixture has independently specified before/after totals',async()=>{
 const data=JSON.parse(await fs.readFile(path.join(root,'eval/fixtures/subscriptions-v2.json'),'utf8'));
 const evidence=JSON.parse(await fs.readFile(path.join(root,'eval/fixtures/cancellation-v2.json'),'utf8'));
 const before=audit(data);assert.deepEqual(before.by_currency,{CNY:{annual_cents:24000,monthly_equivalent_cents:2000},USD:{annual_cents:21800,monthly_equivalent_cents:1817}});
 assert.deepEqual(before.needs_review,['period-unknown','price-unknown','receipt-only']);assert.equal(before.upcoming_charges[0].gross_amount_cents,2800);
 const after=recordCancellation(data,evidence);assert.deepEqual(after.result.by_currency,{USD:{annual_cents:21800,monthly_equivalent_cents:1817}});assert.equal(after.result.upcoming_charges.length,0);assert.equal(after.result.items[0].access_state,'paid_period_remaining');
});
