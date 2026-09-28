// Maintainer utility: the source PDF/corpus is intentionally not redistributed.
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {root} from '../install.mjs';
const source=process.argv[2];
if(!source) throw Error('Usage: node scripts/import-cases.mjs /path/to/muse-cases.json');
const input=JSON.parse(await fs.readFile(source,'utf8'));
const defaults={Money:'money',Admin:'admin',Travel:'travel',Work:'work',Fun:'media',Shopping:'shopping',Food:'meals',Family:'family',Home:'home',Integrations:'connect',Health:'health',Events:'events',Social:'social',Productivity:'work'};
const rules=[
 ['insurance',/\binsur(?:ance|er)|policy renewal/i],
 ['refunds',/refund|reimburse|warranty|unclaimed|compensation|settlement claim|disput(?:e|ed)|chargeback/i],
 ['bills',/negotiat|haggl|lower.*bill|cut.*bill|bill.*(?:reduc|cut|lower)|lease renewal/i],
 ['marketplace',/marketplace|\bsell\b|listings|buyers|sold.*gear/i],
 ['money',/subscription|recurring charge|spending pattern|spending.*categor/i],
 ['finance',/\btax(?:es)?\b|\bK-1|1099|portfolio|stock|trading|trade journal|net worth|budget spreadsheet|financial|finance|crypto|bitcoin|\b401/i],
 ['privacy',/data.broker|junk mail|opt.out|scrub.*(?:address|phone|email)/i],
 ['inbox',/inbox|unsubscribe|email.*(?:triage|clean|sort)|contact.*dedup|dedup.*contact/i],
 ['travel',/flight|hotel|itinerary|\btrip\b|airline|rental car/i],
 ['family',/school|kids?|daughter|toddler|family calendar|rehearsal/i],
 ['health',/doctor|dentist|medical|therapist|workout|calorie|nutrition/i],
 ['events',/birthday|wedding|party|anniversary/i],
 ['meals',/groc|meal|restaurant|recipe|pizza|coffee|latte|dinner/i],
 ['home',/plumb|contractor|apartment|thermostat|home assistant|landlord|lawn|maintenance/i],
 ['social',/follower|instagram.*(?:audit|analytics|report)|threads.*(?:analysis|views)|tiktok.*post/i],
 ['media',/video|podcast|playlist|\bGIF\b|collage|photo.*restor|music|voiceover/i],
 ['learn',/learning|learn.*plan|90 days|flashcard|study|homework|passion project/i],
 ['build',/build.*(?:app|dashboard|tool)|\bcode|coding|webpage|website|docker|deploy/i],
 ['research',/briefing|brief|research|news|digest/i],
 ['monitor',/monitor|every (?:day|week|morning|hour)|daily|weekly|scheduled|remind|watch.*(?:price|stock|openings)/i],
 ['connect',/connector|integration|\bMCP\b|\bSSH\b|connect.*account/i]
];
const seen=new Map();
const cases=input.cases.map(r=>{
 const title=r.task_name??'',prompt=r.task_prompt??'',text=title+' '+prompt;
 const titleMatches=rules.filter(([,re])=>re.test(title)).map(([s])=>s);
 const matched=rules.filter(([,re])=>re.test(text)).map(([s])=>s);
 const primary=titleMatches[0]??defaults[r.category]??'admin';
 const dependencies=[];
 if(/\bcall\b|phone tree|on the phone|voicemail|IVR/i.test(text)) dependencies.push('telephone_check_required');
 if(/\bPlaid\b|bank.*connect|brokerage|trade|crypto|bitcoin/i.test(text)) dependencies.push('financial_connector_or_file_check');
 if(/\bbuy\b|\bpay\b|purchase|checkout|trading|transfer|bet\b/i.test(text)) dependencies.push('transaction_scope_review');
 if(/schedule|daily|every |weekly|monitor|watch/i.test(text)) dependencies.push('runtime_online_check');
 if(/Gmail|email|inbox/i.test(text)) dependencies.push('mail_access_check');
 if(/calendar/i.test(text)) dependencies.push('calendar_access_check');
 const fingerprint=createHash('sha256').update(prompt.trim().toLowerCase().replace(/\s+/g,' ')).digest('hex');
 const duplicate=seen.get(fingerprint);seen.set(fingerprint,duplicate??r.id);
 return {id:r.id,page:r.page,source_category:r.category,source_title:title,primary_skill:'muse-'+primary,related_skills:[...new Set(matched.filter(s=>s!==primary))].map(s=>'muse-'+s),mapping_method:'keyword_candidates_needs_review',dependencies_to_check:dependencies,validation_status:'not_run',...(duplicate?{exact_prompt_duplicate_of:duplicate}:{})};
});
await fs.writeFile(path.join(root,'catalog','muse-coverage.json'),JSON.stringify({schema_version:1,source_document:input.source_pdf,source_sha256:input.source_sha256,note:'Source titles and page locators only; original prompts/PDF not redistributed. All routes are heuristic candidates, not manual validation or capability proof.',case_count:cases.length,cases},null,2)+'\n');
console.log(`${cases.length} source cases mapped; no pass claims added.`);
