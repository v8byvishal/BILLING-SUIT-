'use strict';
const crypto=require('node:crypto');const fs=require('node:fs');const path=require('node:path');
class ActiveCaseLock{
 constructor(storageRoot,options={}){this.file=path.join(storageRoot,'Cases','active-case-lock.json');this.clock=options.clock||(()=>new Date());this.maxAgeMs=options.maxAgeMs||30*60*1000;this.pid=options.pid||process.pid;this.token=null;fs.mkdirSync(path.dirname(this.file),{recursive:true});}
 read(){if(!fs.existsSync(this.file))return null;try{return JSON.parse(fs.readFileSync(this.file,'utf8'));}catch{return {invalid:true};}}
 stale(lock=this.read()){if(!lock)return false;if(lock.invalid)return true;const age=this.clock().getTime()-Date.parse(lock.heartbeat_at||lock.acquired_at);if(!Number.isFinite(age)||age>this.maxAgeMs)return true;if(lock.pid===this.pid)return false;try{process.kill(lock.pid,0);return false;}catch{return true;}}
 acquire(caseId){const existing=this.read();if(existing&&!this.stale(existing))throw new Error(`ACTIVE_CASE_LOCKED:${existing.case_id}`);if(existing)this.recoverStale();this.token=crypto.randomUUID();const now=this.clock().toISOString();const lock={case_id:caseId,token:this.token,pid:this.pid,acquired_at:now,heartbeat_at:now};fs.writeFileSync(this.file,JSON.stringify(lock,null,2),{flag:'wx',mode:0o600});return lock;}
 heartbeat(){const lock=this.read();if(!lock||lock.token!==this.token)throw new Error('Active case lock ownership lost');lock.heartbeat_at=this.clock().toISOString();fs.writeFileSync(this.file,JSON.stringify(lock,null,2));return lock;}
 release(){const lock=this.read();if(!lock)return;if(lock.token!==this.token)throw new Error('Cannot release another active case lock');fs.unlinkSync(this.file);this.token=null;}
 recoverStale(){const lock=this.read();if(!lock)return null;if(!this.stale(lock))throw new Error(`Active case lock is not stale: ${lock.case_id}`);fs.rmSync(this.file,{force:true});return lock;}
}
module.exports={ActiveCaseLock};
