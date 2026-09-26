'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { assertTransition } = require('./case-state-machine');

function atomic(file, value) { const temp = `${file}.${process.pid}.${Date.now()}.tmp`; fs.writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`, { flag:'wx', mode:0o600 }); fs.renameSync(temp,file); }
function read(file, fallback) { return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file,'utf8')) : fallback; }

class CaseStore {
  constructor(storageRoot, options={}) {
    if (!path.isAbsolute(storageRoot)) throw new Error('Case Storage root must be absolute');
    this.root=path.join(storageRoot,'Cases'); this.clock=options.clock||(()=>new Date()); this.idFactory=options.idFactory||(()=>crypto.randomUUID()); this.copy=options.copy||fs.copyFileSync;
    fs.mkdirSync(this.root,{recursive:true}); this.indexFile=path.join(this.root,'case-index.json'); this.index=read(this.indexFile,{schema_version:1,cases:[],source_hashes:{}});
  }
  directory(id){return path.join(this.root,id);} manifestFile(id){return path.join(this.directory(id),'manifest.json');}
  create(source, options={}) {
    const existing=this.index.source_hashes[source.sha256];
    if(existing && !options.reprocess) return {outcome:'EXACT_DUPLICATE',case:this.load(existing)};
    const id=options.caseId||this.idFactory(), timestamp=this.clock().toISOString();
    const manifest={schema_version:1,case_id:id,parent_case_id:options.parentCaseId||null,version:options.version||1,initial_pdf_reference:{file_name:source.file_name,sha256:source.sha256,archive_path:null},initial_pdf_hash:source.sha256,final_pdf_reference:null,final_pdf_hash:null,bill_number:null,uhid:null,ip_number:null,workflow_status:'NEW',current_application_stage:'INITIAL_BILL',created_at:timestamp,updated_at:timestamp,enhancement_plan_reference:null,enhancement_execution_reference:null,final_bill_reference:null,completed_bill_reference:null,review_flags:[],error_state:null};
    for(const folder of ['initial','enhancement','final','normalized','audit']) fs.mkdirSync(path.join(this.directory(id),folder),{recursive:true}); atomic(this.manifestFile(id),manifest);
    this.index.cases.push(id); this.index.source_hashes[source.sha256]=id; atomic(this.indexFile,this.index); this.audit(id,'CASE_CREATED',null,'NEW','Initial source registered',source); return {outcome:existing?'REPROCESSED':'NEW_SOURCE',case:manifest};
  }
  load(id){return read(this.manifestFile(id),null);} list(){return this.index.cases.map(id=>this.load(id)).filter(Boolean).sort((a,b)=>b.updated_at.localeCompare(a.updated_at));}
  save(manifest){if(this.load(manifest.case_id)?.workflow_status==='COMPLETED'&&manifest.workflow_status!=='COMPLETED')throw new Error('Completed case is immutable'); manifest.updated_at=this.clock().toISOString(); atomic(this.manifestFile(manifest.case_id),manifest); return manifest;}
  transition(id,to,reason,source=null){const m=this.load(id); if(!m)throw new Error('Case not found'); const from=m.workflow_status; assertTransition(from,to); m.workflow_status=to;m.current_application_stage=to;m.error_state=to==='FAILED'?reason:null;this.save(m);this.audit(id,'STATE_TRANSITION',from,to,reason,source);return m;}
  patch(id,patch,event='CASE_UPDATED',reason='Case checkpoint'){const m=this.load(id);if(!m)throw new Error('Case not found');if(m.workflow_status==='COMPLETED')throw new Error('Completed case is immutable');Object.assign(m,patch);this.save(m);this.audit(id,event,m.workflow_status,m.workflow_status,reason,null);return m;}
  archive(id,sourcePath,kind='initial'){const target=path.join(this.directory(id),kind,path.basename(sourcePath));try{this.copy(sourcePath,target);this.audit(id,'SOURCE_ARCHIVED',null,null,kind,{source_path:sourcePath,archive_path:target});return {status:'ARCHIVED',path:target};}catch(error){this.audit(id,'ARCHIVE_FAILED',null,null,error.message,{source_path:sourcePath});return {status:'FAILED_TO_ARCHIVE',reason:error.message};}}
  writeArtifact(id,relative,value){const file=path.join(this.directory(id),relative);fs.mkdirSync(path.dirname(file),{recursive:true});atomic(file,value);return file;}
  audit(id,event,previous_state,new_state,reason,source_reference){const record={event_id:this.idFactory(),case_id:id,timestamp:this.clock().toISOString(),event,previous_state,new_state,reason,source_reference};fs.appendFileSync(path.join(this.directory(id),'audit','workflow.jsonl'),`${JSON.stringify(record)}\n`,{mode:0o600});return record;}
  auditRecords(id){const f=path.join(this.directory(id),'audit','workflow.jsonl');return fs.existsSync(f)?fs.readFileSync(f,'utf8').trim().split(/\r?\n/).filter(Boolean).map(JSON.parse):[];}
  findByHash(hash){const id=this.index.source_hashes[hash];return id?this.load(id):null;}
  registerFinalHash(id,hash){const owner=this.index.source_hashes[hash];if(owner&&owner!==id)return {outcome:'KNOWN_SOURCE',case:this.load(owner)};this.index.source_hashes[hash]=id;atomic(this.indexFile,this.index);return {outcome:'NEW_SOURCE'};}
  reprocess(id,source){const parent=this.load(id);if(!parent)throw new Error('Case not found');return this.create(source,{reprocess:true,parentCaseId:id,version:(parent.version||1)+1});}
}
module.exports={CaseStore};
