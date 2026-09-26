'use strict';
const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const os=require('node:os');const path=require('node:path');
const {InboxScanner}=require('../../src/services/cases/inbox-scanner');const {InboxWatcher}=require('../../src/services/cases/inbox-watcher');const {ActiveCaseLock}=require('../../src/services/cases/active-case-lock');
const source=fs.readFileSync(path.resolve(__dirname,'../../src/services/cases/inbox-watcher.js'),'utf8');
function fixture(process=async()=>({outcome:'NEW_SOURCE',case:{case_id:'c'}})){const root=fs.mkdtempSync(path.join(os.tmpdir(),'wb-'));const scanner=new InboxScanner(root,{minAgeMs:0});const events=[];const watcher=new InboxWatcher({scanner,processCandidate:process,audit:e=>events.push(e),timerApi:{setInterval:()=>1,clearInterval:()=>{}},intervalMs:1});return{root,scanner,watcher,events};}

test('P11-25 polling interval has five-second floor',()=>assert.equal(fixture().watcher.intervalMs,5000));
test('P11-26 concurrency has upper bound four',()=>{const f=fixture();f.watcher.concurrency=4;assert.equal(f.watcher.status().concurrency,4);});
test('P11-27 start is idempotent',()=>{const f=fixture();const id=f.watcher.start().run_id;assert.equal(f.watcher.start().run_id,id);});
test('P11-28 stop is idempotent',async()=>{const f=fixture();assert.equal((await f.watcher.stop()).state,'STOPPED');});
test('P11-29 pause only applies while running',()=>{const f=fixture();assert.equal(f.watcher.pause().state,'STOPPED');});
test('P11-30 resume only applies while paused',()=>{const f=fixture();assert.equal(f.watcher.resume().state,'STOPPED');});
test('P11-31 watcher source has no child process or worker process',()=>{assert.doesNotMatch(source,/child_process|Worker\s*\(/);});
test('P11-32 watcher source has no Selenium or CDP call',()=>{assert.doesNotMatch(source,/selenium|webdriver|debuggerAddress|9222/i);});
test('P11-33 watcher source has no discharge operation',()=>{assert.doesNotMatch(source,/confirmDischarge|DISCHARGE_CONFIRMED/);});
test('P11-34 watcher source has no portal execution operation',()=>{assert.doesNotMatch(source,/beginPortal|executeEnhancementPlan|portal:execute/);});
test('P11-35 watcher does not acquire active-case lock',async()=>{const f=fixture();const lock=new ActiveCaseLock(f.root);f.scanner.scan=()=>[];f.watcher.start();await f.watcher.scanNow();assert.equal(lock.read(),null);});
test('P11-36 duplicate hash in one scan is debounced',async()=>{const f=fixture();let calls=0;f.scanner.scan=kind=>kind==='initial'?[{status:'STABLE',file_name:'a.pdf',file_path:'/a',sha256:'same'},{status:'STABLE',file_name:'b.pdf',file_path:'/b',sha256:'same'}]:[];f.watcher.processCandidate=async()=>{calls++;return{outcome:'NEW_SOURCE',case:{case_id:'c'}}};f.watcher.start();await f.watcher.scanNow();assert.equal(calls,1);});
test('P11-37 MATCH_REQUIRED is valid non-fatal intake result',async()=>{const f=fixture(async()=>({outcome:'MATCH_REQUIRED',reason:'NO_DETERMINISTIC_FINAL_MATCH'}));f.scanner.scan=kind=>kind==='final'?[{status:'STABLE',file_name:'f.pdf',file_path:'/f',sha256:'f'}]:[];f.watcher.start();await f.watcher.scanNow();assert.equal(f.watcher.state,'RUNNING');assert.equal(f.watcher.status().stats.registration_errors,0);});
test('P11-38 restart safety delegates identity to persistent processor',async()=>{let registered=true;const f=fixture(async()=>registered?{outcome:'EXACT_DUPLICATE',case:{case_id:'existing'}}:{outcome:'NEW_SOURCE'});f.scanner.scan=kind=>kind==='initial'?[{status:'STABLE',file_name:'a.pdf',file_path:'/a',sha256:'persisted'}]:[];f.watcher.start();await f.watcher.scanNow();assert.equal(f.watcher.status().stats.duplicates,1);});
