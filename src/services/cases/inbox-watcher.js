'use strict';
const crypto = require('node:crypto');

const STATES = Object.freeze({STOPPED:'STOPPED',STARTING:'STARTING',RUNNING:'RUNNING',PAUSED:'PAUSED',STOPPING:'STOPPING',ERROR:'ERROR'});

class InboxWatcher {
  constructor({scanner, processCandidate, audit=()=>{}, clock=()=>new Date(), intervalMs=30000, maxQueue=100, concurrency=1, timerApi={setInterval,clearInterval}}) {
    if (!scanner || typeof scanner.scan !== 'function') throw new Error('Existing InboxScanner is required');
    if (typeof processCandidate !== 'function') throw new Error('Candidate processor is required');
    this.scanner=scanner; this.processCandidate=processCandidate; this.audit=audit; this.clock=clock;
    this.intervalMs=Math.max(5000,intervalMs); this.maxQueue=Math.max(1,maxQueue); this.concurrency=Math.max(1,Math.min(4,concurrency)); this.timerApi=timerApi;
    this.state=STATES.STOPPED; this.timer=null; this.scanning=false; this.queue=[]; this.queued=new Set(); this.active=0;
    this.runId=null; this.lastScan=null; this.stats=this._emptyStats();
  }
  _emptyStats(){return {initial_detected:0,final_detected:0,new_cases:0,duplicates:0,waiting_for_stability:0,registration_errors:0,queue_size:0};}
  _event(event,details={}){const record={event,watcher_run_id:this.runId,timestamp:this.clock().toISOString(),...details};this.audit(record);return record;}
  status(){return {state:this.state,run_id:this.runId,last_scan:this.lastScan,interval_ms:this.intervalMs,max_queue_size:this.maxQueue,concurrency:this.concurrency,stats:{...this.stats,queue_size:this.queue.length}};}
  start(){if(this.state!==STATES.STOPPED&&this.state!==STATES.ERROR)return this.status();this.state=STATES.STARTING;this.runId=crypto.randomUUID();this.stats=this._emptyStats();this._event('WATCHER_STARTED');this.state=STATES.RUNNING;this.timer=this.timerApi.setInterval(()=>this.scanNow().catch(e=>this._fatal(e)),this.intervalMs);return this.status();}
  pause(){if(this.state!==STATES.RUNNING)return this.status();this.state=STATES.PAUSED;this._event('WATCHER_PAUSED');return this.status();}
  resume(){if(this.state!==STATES.PAUSED)return this.status();this.state=STATES.RUNNING;this._event('WATCHER_RESUMED');return this.status();}
  async stop(){if(this.state===STATES.STOPPED)return this.status();this.state=STATES.STOPPING;if(this.timer)this.timerApi.clearInterval(this.timer);this.timer=null;this.queue.length=0;this.queued.clear();this.state=STATES.STOPPED;this._event('WATCHER_STOPPED');return this.status();}
  _fatal(error){this.state=STATES.ERROR;if(this.timer)this.timerApi.clearInterval(this.timer);this.timer=null;this._event('WATCHER_ERROR',{reason:error.message});}
  async scanNow(){
    if(this.state!==STATES.RUNNING||this.scanning)return this.status();this.scanning=true;this._event('SCAN_STARTED');
    try {
      const discovered=[];
      for(const kind of ['initial','final']) for(const file of this.scanner.scan(kind)) discovered.push({...file,kind});
      discovered.sort((a,b)=>`${a.kind}/${a.file_name}`.localeCompare(`${b.kind}/${b.file_name}`));
      for(const file of discovered){
        this.stats[`${file.kind}_detected`]++;this._event('FILE_DETECTED',{kind:file.kind,source_path:file.file_path});
        if(file.status!=='STABLE'){this.stats.waiting_for_stability++;this._event('FILE_WAITING_FOR_STABILITY',{kind:file.kind,source_path:file.file_path});continue;}
        const key=`${file.kind}:${file.sha256}`;if(this.queued.has(key))continue;
        if(this.queue.length+this.active>=this.maxQueue){this._event('QUEUE_FULL',{kind:file.kind,source_path:file.file_path,sha256:file.sha256});continue;}
        this.queued.add(key);this.queue.push({...file,key});
      }
      await this._drain();this.lastScan=this.clock().toISOString();this._event('SCAN_COMPLETED',{queue_size:this.queue.length});return this.status();
    } catch(error){this._fatal(error);return this.status();} finally {this.scanning=false;}
  }
  async _drain(){
    const workers=Array.from({length:this.concurrency},async()=>{while(this.queue.length&&this.state===STATES.RUNNING){const file=this.queue.shift();this.active++;try{const result=await this.processCandidate(file.kind,file);const outcome=result?.outcome||'UNKNOWN';if(outcome==='EXACT_DUPLICATE'||outcome==='KNOWN_SOURCE'){this.stats.duplicates++;this._event('DUPLICATE_DETECTED',{kind:file.kind,source_path:file.file_path,sha256:file.sha256,case_id:result?.case?.case_id});}else if(outcome==='FAILED_TO_ARCHIVE'){this.stats.registration_errors++;this._event('ARCHIVE_FAILED',{kind:file.kind,source_path:file.file_path,sha256:file.sha256,reason:result.reason});}else if(outcome==='NEW_SOURCE'||result?.case){this.stats.new_cases++;this._event('CASE_REGISTERED',{kind:file.kind,source_path:file.file_path,sha256:file.sha256,case_id:result?.case?.case_id,result:outcome});}}catch(error){this.stats.registration_errors++;this._event('CASE_REGISTRATION_FAILED',{kind:file.kind,source_path:file.file_path,sha256:file.sha256,reason:error.message});}finally{this.active--;this.queued.delete(file.key);}}});await Promise.all(workers);
  }
}
module.exports={InboxWatcher,STATES};
