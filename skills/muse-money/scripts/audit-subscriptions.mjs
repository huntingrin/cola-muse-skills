#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const currencies = new Set(['CNY','USD','EUR','GBP','AUD','CAD','HKD','SGD','CHF','NZD','INR','BRL']);
const dayMs = 86400000;
export function dateOnly(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0,10) !== value) throw Error('Invalid calendar date');
  return value;
}
export function timestamp(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) throw Error('Timestamp needs seconds and explicit timezone');
  dateOnly(value.slice(0,10));
  const [,h,m,s] = value.match(/T(\d{2}):(\d{2}):(\d{2})/);
  const offset = value.match(/([+-])(\d{2}):(\d{2})$/);
  if (+h>23 || +m>59 || +s>59 || (offset && (+offset[2]>14 || +offset[3]>59 || (+offset[2]===14 && +offset[3]!==0))) || !Number.isFinite(Date.parse(value))) throw Error('Invalid timestamp');
  return Date.parse(value);
}
const nonempty = x => typeof x === 'string' && x.trim().length > 0;
function money(value) { if (value !== null && (!Number.isSafeInteger(value) || value < 0)) throw Error('Invalid amount: use nonnegative integer cents or null'); }
function gross(quote) {
  money(quote.amount_cents); money(quote.tax_cents);
  if (!['gross','net','unknown'].includes(quote.amount_basis)) throw Error('Invalid amount_basis');
  if (quote.amount_basis !== 'net' && quote.tax_cents !== null) throw Error('tax_cents must be null unless amount_basis is net');
  if (quote.amount_cents === null || quote.amount_basis === 'unknown' || (quote.amount_basis === 'net' && quote.tax_cents === null)) return null;
  const result = quote.amount_cents + (quote.amount_basis === 'net' ? quote.tax_cents : 0);
  if (!Number.isSafeInteger(result)) throw Error('Amount exceeds safe integer range');
  return result;
}
function add(total, currency, cents) {
  total[currency] ??= {annual_cents:0,monthly_equivalent_cents:0};
  total[currency].annual_cents += cents;
  if (!Number.isSafeInteger(total[currency].annual_cents)) throw Error('Total exceeds safe integer range');
}
function coverage(input) {
  const c = input.coverage;
  if (!c || !Array.isArray(c.sources) || !c.sources.length || !Array.isArray(c.limitations) || c.limitations.some(x=>!nonempty(x))) throw Error('coverage requires sources and limitations');
  dateOnly(c.start); dateOnly(c.end_exclusive);
  if (c.start >= c.end_exclusive || c.end_exclusive > new Date(Date.parse(input.as_of.slice(0,10))+dayMs).toISOString().slice(0,10)) throw Error('Invalid coverage window');
  const ids=new Set(), issues=[];
  for (const s of c.sources) {
    if (!nonempty(s.id) || ids.has(s.id) || !['mailbox','file','account'].includes(s.kind)) throw Error('Invalid or duplicate coverage source');
    ids.add(s.id);
    if (s.kind !== 'mailbox') { if (s.complete !== true) issues.push(`${s.id}: completeness_not_confirmed`); continue; }
    if (!Array.isArray(s.queries) || !s.queries.length) { issues.push(`${s.id}: queries_missing`); continue; }
    const queries=new Set();
    for (const q of s.queries) {
      if (!nonempty(q.id) || queries.has(q.id) || !Array.isArray(q.pages) || !Array.isArray(q.errors) || q.errors.some(x=>!nonempty(x)) || typeof q.exhausted!=='boolean') throw Error('Invalid query coverage');
      queries.add(q.id);dateOnly(q.start);dateOnly(q.end_exclusive);
      if (q.start!==c.start || q.end_exclusive!==c.end_exclusive) issues.push(`${s.id}/${q.id}: window_mismatch`);
      for (const p of q.pages) if (!Number.isSafeInteger(p.count) || !Number.isSafeInteger(p.limit) || p.limit<1 || p.count<0 || p.count>p.limit) throw Error('Invalid page count');
      if (!q.exhausted || !q.pages.length || q.pages.at(-1).count===q.pages.at(-1).limit) issues.push(`${s.id}/${q.id}: pagination_unproven`);
      if (q.errors.length) issues.push(`${s.id}/${q.id}: query_failed`);
    }
  }
  return {...c,status:issues.length || c.limitations.length ? 'partial' : 'complete_for_declared_sources',issues};
}
function renewal(item, asOf, maxAge) {
  if (!Array.isArray(item.renewal_observations)) throw Error('renewal_observations must be an array');
  for (const o of item.renewal_observations) {
    if (!['enabled','disabled','unknown'].includes(o.status) || !['account','cancellation_confirmation','renewal_notice','receipt'].includes(o.source) || !nonempty(o.ref)) throw Error('Invalid renewal observation');
    if (timestamp(o.observed_at)>asOf) throw Error('Renewal observation is after as_of');
    if (o.source==='cancellation_confirmation' && o.status!=='disabled') throw Error('Cancellation confirmation must say disabled');
  }
  const observations=item.renewal_observations;
  if (!observations.length) return {status:'unknown',reason:'no_renewal_evidence',observed_at:null};
  const latest=Math.max(...observations.map(o=>timestamp(o.observed_at)));
  const atLatest=observations.filter(o=>timestamp(o.observed_at)===latest);
  const at=atLatest[0].observed_at;
  if (new Set(atLatest.map(o=>o.status)).size!==1) return {status:'unknown',reason:'conflicting_renewal_evidence',observed_at:at};
  if ((asOf-latest)/dayMs>maxAge) return {status:'unknown',reason:'stale_renewal_evidence',observed_at:at};
  const verified=atLatest.find(o=>['account','cancellation_confirmation'].includes(o.source));
  if (!verified || verified.status==='unknown') return {status:'unknown',reason:'renewal_not_account_verified',observed_at:at};
  return {status:verified.status,reason:null,observed_at:at,ref:verified.ref};
}
function canonical(value) {
  if (Array.isArray(value)) return JSON.stringify(value.map(v=>JSON.parse(canonical(v))));
  if (value && typeof value==='object') return JSON.stringify(Object.fromEntries(Object.keys(value).sort().map(k=>[k,JSON.parse(canonical(value[k]))])));
  return JSON.stringify(value);
}

export function audit(input) {
  if (!input || input.schema_version!==2) throw Error('Schema v2 required. Legacy active/cancelled cannot prove renewal; migrate using references/data-contract.md, without inventing evidence.');
  const asOf=timestamp(input.as_of), today=input.as_of.slice(0,10);
  const maxAge=input.max_status_age_days ?? 30;
  if (!Number.isInteger(maxAge) || maxAge<1 || maxAge>365) throw Error('max_status_age_days must be 1..365');
  if (!Array.isArray(input.subscriptions)) throw Error('subscriptions must be an array');
  const scope=coverage(input), sources=new Set(scope.sources.map(s=>s.id));
  const seen=new Map(),items=[],byCurrency={},upcoming=[];
  const endExclusive=new Date(Date.parse(today)+30*dayMs).toISOString().slice(0,10);
  for (const r of input.subscriptions) {
    if (!r || !nonempty(r.id) || !nonempty(r.name) || Object.hasOwn(r,'status')) throw Error('Each item needs id/name; legacy status is not allowed');
    if (r.currency!==null && !currencies.has(r.currency)) throw Error('Invalid currency (supported two-decimal currencies or null only)');
    if (!['monthly','annual','usage','one_time','unknown'].includes(r.interval)) throw Error('Invalid interval');
    if (!Array.isArray(r.source_ids) || !r.source_ids.length || r.source_ids.some(s=>!sources.has(s))) throw Error('Item has missing/unknown source_ids');
    if (!Array.isArray(r.review_notes) || r.review_notes.some(x=>!nonempty(x))) throw Error('review_notes must be an array');
    const amount=gross(r),state=renewal(r,asOf,maxAge);
    let rateVerified=false, nextVerified=false;
    if (r.rate_evidence!==null) {
      if (!r.rate_evidence || !nonempty(r.rate_evidence.ref)) throw Error('rate_evidence requires observed_at/ref or null');
      const rateAt=timestamp(r.rate_evidence.observed_at);
      if(rateAt>asOf)throw Error('Rate evidence is after as_of');
      rateVerified=(asOf-rateAt)/dayMs<=maxAge;
    }
    if (r.access_until!==null) dateOnly(r.access_until);
    if (r.last_payment!==null) {
      if (!r.last_payment || !nonempty(r.last_payment.ref)) throw Error('last_payment requires a ref or null');
      dateOnly(r.last_payment.date); gross(r.last_payment);
      if (r.last_payment.date>today) throw Error('last_payment is in the future');
    }
    let next=null;
    if (r.next_charge!==null) {
      if (!r.next_charge || !nonempty(r.next_charge.ref)) throw Error('next_charge requires a ref or null');
      dateOnly(r.next_charge.date);next=gross(r.next_charge);
      const nextAt=timestamp(r.next_charge.observed_at);
      if(nextAt>asOf)throw Error('Next charge evidence is after as_of');
      nextVerified=(asOf-nextAt)/dayMs<=maxAge;
      if (r.next_charge.date<today) throw Error('next_charge is past; verify or clear it, do not advance by guessing');
      if (state.status==='disabled') throw Error('Disabled renewal cannot retain a scheduled next_charge');
    }
    const key=canonical(r);
    if (seen.has(r.id)) { if (seen.get(r.id)!==key) throw Error(`Conflicting duplicate: ${r.id}`); continue; }
    seen.set(r.id,key);
    const fixed=['monthly','annual'].includes(r.interval), reasons=[];
    if (state.reason) reasons.push(state.reason);
    if (r.interval==='unknown') reasons.push('interval_unknown');
    if (r.currency===null) reasons.push('currency_unknown');
    if (amount===null) reasons.push('gross_amount_unknown');
    if (fixed && !rateVerified) reasons.push('current_rate_unverified');
    if (r.review_notes.length) reasons.push('unresolved_review_notes');
    if (r.next_charge && next===null) reasons.push('next_gross_amount_unknown');
    if (r.next_charge && !nextVerified) reasons.push('next_charge_evidence_stale');
    const included=state.status==='enabled' && fixed && amount!==null && rateVerified && r.currency!==null && r.review_notes.length===0;
    const annual=included ? amount*(r.interval==='monthly'?12:1) : null;
    if (annual!==null && !Number.isSafeInteger(annual)) throw Error('Amount exceeds safe integer range');
    if (included) add(byCurrency,r.currency,annual);
    items.push({...r,effective_renewal:state,access_state:r.access_until===null?'unknown':r.access_until>today?'paid_period_remaining':'ended',gross_amount_cents:amount,included,annual_cents:annual,review_reasons:reasons});
    if (r.next_charge && nextVerified && state.status==='enabled' && r.review_notes.length===0 && r.next_charge.date<endExclusive) upcoming.push({id:r.id,name:r.name,currency:r.currency,date:r.next_charge.date,gross_amount_cents:next,ref:r.next_charge.ref});
  }
  for (const value of Object.values(byCurrency)) value.monthly_equivalent_cents=Math.round(value.annual_cents/12);
  upcoming.sort((a,b)=>a.date.localeCompare(b.date)||a.id.localeCompare(b.id));
  return {schema_version:2,as_of:input.as_of,max_status_age_days:maxAge,coverage:scope,method:'Account-verified renewal only; gross current rates annualized, not cash flow, a future charge forecast, or realized savings. Evidence references are assertions to review, not independently authenticated by this script.',by_currency:byCurrency,upcoming_window:{start:today,end_exclusive:endExclusive},upcoming_charges:upcoming,items,needs_review:items.filter(x=>x.review_reasons.length).map(x=>x.id)};
}
const cell=x=>String(x??'待核实').replace(/[\r\n]+/g,' ').replace(/\|/g,'\\|').replace(/</g,'&lt;').replace(/>/g,'&gt;');
const formatted=(currency,cents)=>cents===null||currency===null?'待核实':`${currency} ${(cents/100).toFixed(2)}`;
const reasonsZh={no_renewal_evidence:'尚未核对续费设置',conflicting_renewal_evidence:'续费证据冲突',stale_renewal_evidence:'续费证据已超过检查窗口',renewal_not_account_verified:'仅有邮件线索，未核对账户',interval_unknown:'计费周期未知',currency_unknown:'币种未知',gross_amount_unknown:'含税金额未知',current_rate_unverified:'当前费率尚未核实',unresolved_review_notes:'存在未解决的问题',next_gross_amount_unknown:'下一期含税金额未知',next_charge_evidence_stale:'下一期安排的证据已过期',completeness_not_confirmed:'来源未完整读取',queries_missing:'缺少检索记录',window_mismatch:'检索时间窗不一致',pagination_unproven:'分页是否完成尚未证实',query_failed:'有检索错误尚未解决'};
export function renderReport(result) {
  const status={enabled:'已核实开启',disabled:'已核实关闭',unknown:'待核实'};
  const access={unknown:'未知',paid_period_remaining:'已付权益仍有效',ended:'所记录权益期已结束'};
  const lines=['# 订阅审计',``, `核对截至：${cell(result.as_of)}。状态证据有效窗口：${result.max_status_age_days} 天。`, '',
    result.coverage.status==='partial'?'**覆盖不完整，以下结果仅针对已获得的资料。**':'覆盖已声明的数据源；不代表所有邮箱、银行卡和支付渠道。',
    `检索时间窗：${result.coverage.start} 至 ${result.coverage.end_exclusive}（不含结束日）。`, '',
    '## 已核实自动续费的当前含税费率', '', '按当前费率折算；不是实际年度支出、未来扣款承诺或已经省下的钱。', '', '| 币种 | 当前费率年化 | 折算每月 |', '| --- | --- | --- |'];
  for (const [currency,v] of Object.entries(result.by_currency)) lines.push(`| ${currency} | ${formatted(currency,v.annual_cents)} | ${formatted(currency,v.monthly_equivalent_cents)} |`);
  if (!Object.keys(result.by_currency).length) lines.push('| — | 暂无足够证据可汇总 | 不等于没有支出 |');
  lines.push('', '## 逐项状态', '', '| 项目 | 自动续费 | 权益 | 资料含税金额 / 周期 | 计入汇总 | 待核实 |', '| --- | --- | --- | --- | --- | --- |');
  const intervals={monthly:'月付',annual:'年付',usage:'按量或充值',one_time:'一次性',unknown:'周期未知'};
  for (const r of result.items) lines.push(`| ${cell(r.name)} | ${status[r.effective_renewal.status]} | ${access[r.access_state]}${r.access_until?'，至 '+r.access_until+'（不含当日）':''} | ${formatted(r.currency,r.gross_amount_cents)} / ${intervals[r.interval]} | ${r.included?'是':'否'} | ${cell(r.review_reasons.map(x=>reasonsZh[x]??x).concat(r.review_notes).join('；')||'无')} |`);
  lines.push('', '## 未来 30 个日历日的已知扣款安排', '', `${result.upcoming_window.start} 至 ${result.upcoming_window.end_exclusive}（不含结束日）。金额采用独立的下一期报价，不能从旧收据直接推算。`, '', '| 项目 | 日期 | 下一期含税金额 | 证据 |', '| --- | --- | --- | --- |');
  for (const q of result.upcoming_charges) lines.push(`| ${cell(q.name)} | ${q.date} | ${formatted(q.currency,q.gross_amount_cents)} | ${cell(q.ref)} |`);
  if (!result.upcoming_charges.length) lines.push('| — | — | 没有已核实的安排，不代表不会扣款 | — |');
  lines.push('', '## 证据与缺口', '');
  for (const issue of [...result.coverage.issues,...result.coverage.limitations]) lines.push(`- ${cell(issue.replace(/: (\w+)$/,(_,key)=>': '+(reasonsZh[key]??key)))}`);
  for (const r of result.items) {
    lines.push(`- ${cell(r.name)}：来源 ${cell(r.source_ids.join(', '))}；状态证据时间 ${cell(r.effective_renewal.observed_at)}；凭据 ${cell(r.effective_renewal.ref??(r.renewal_observations.map(o=>o.ref).join(', ')||null))}。`);
    if(r.rate_evidence)lines.push(`  费率证据 ${cell(r.rate_evidence.ref)}；核实 ${cell(r.rate_evidence.observed_at)}。`);
    if(r.last_payment) lines.push(`  历史付款 ${r.last_payment.date}：${formatted(r.currency,gross(r.last_payment))}；凭据 ${cell(r.last_payment.ref)}。历史付款不证明当前续费。`);
  }
  return lines.join('\n')+'\n';
}
async function main() {
  const [i,o,report]=process.argv.slice(2);
  if (!i||!o) throw Error('Usage: node audit-subscriptions.mjs input.json output.json [report.md]');
  if (new Set([i,o,report].filter(Boolean).map(p=>path.resolve(p))).size!==[i,o,report].filter(Boolean).length) throw Error('Input and output paths must differ');
  const result=audit(JSON.parse(await fs.readFile(i,'utf8')));
  await fs.writeFile(o,JSON.stringify(result,null,2)+'\n');
  if (report) await fs.writeFile(report,renderReport(result));
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(e=>{console.error(e.message);process.exitCode=1;});
