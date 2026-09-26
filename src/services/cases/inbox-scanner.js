'use strict';
const crypto=require('node:crypto');const fs=require('node:fs');const path=require('node:path');
class InboxScanner{
 constructor(storageRoot,options={}){this.initial=path.join(storageRoot,'Inbox','Initial');this.final=path.join(storageRoot,'Inbox','Final');this.clock=options.clock||(()=>Date.now());this.minAgeMs=options.minAgeMs??1000;this.observed=new Map();fs.mkdirSync(this.initial,{recursive:true});fs.mkdirSync(this.final,{recursive:true});}
 scan(kind='initial'){const dir=kind==='final'?this.final:this.initial;const results=[];for(const name of fs.readdirSync(dir).sort()){const file=path.join(dir,name);if(name.startsWith('.')||/\.(?:tmp|part|crdownload)$/i.test(name)||path.extname(name).toLowerCase()!=='.pdf')continue;let stat;try{stat=fs.statSync(file);}catch{continue;}if(!stat.isFile())continue;const key=file,signature=`${stat.size}:${stat.mtimeMs}`,previous=this.observed.get(key);this.observed.set(key,{signature,observed_at:this.clock()});if(!previous||previous.signature!==signature||this.clock()-stat.mtimeMs<this.minAgeMs){results.push({file_path:file,file_name:name,status:'WAITING_FOR_STABLE_FILE',size:stat.size});continue;}const hash=crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');results.push({file_path:file,file_name:name,status:'STABLE',size:stat.size,sha256:hash});}return results;}
}
module.exports={InboxScanner};
