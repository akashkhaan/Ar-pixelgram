import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire, Module } from 'node:module';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const ts = require('typescript');
function compile(relative, mocks) {
 const file = fileURLToPath(new URL(relative, import.meta.url));
 const source = readFileSync(file, 'utf8').replaceAll('import.meta.env', '({ VITE_SUPABASE_URL: "https://test.supabase.co", VITE_SUPABASE_ANON_KEY: "public-test" })');
 const result = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true } });
 const m = new Module(file);m.filename=file;m.paths=Module._nodeModulePaths(fileURLToPath(new URL('.',import.meta.url)));
 m.require = name => name in mocks ? mocks[name] : require(name);m._compile(result.outputText,file);return m.exports;
}
const api = { cleanDisplayCaption: c => c.replace(/<!--.*?-->/g,''), encodePostMusic: (c,m) => `${c || ''}\n<!--pixelgram_music:${JSON.stringify(m)}-->` };
const { nativeUploadPayload } = compile('./nativeUploadPayload.ts', { './api': api });
const music={track_id:'track',title:'Song',artist:'Artist',preview_url:'https://music.example/song',start_ms:12000,duration_ms:30000,mute_original:true};
const base={id:'persistent-1',userId:'owner',label:'Upload',fileBlob:new Blob(['real media bytes']),fileType:'video/mp4',fileName:'clip.mp4',caption:'My caption',musicPayload:music};
for (const kind of ['reel','video','post','story']) test(`${kind} publishes its actual media and metadata, not just uploaded bytes`,()=>{
 const p=nativeUploadPayload({...base,kind,videoTitle:'My film',videoDescription:'Description',videoDuration:23.47,videoVisibility:'private'},'https://test.supabase.co/media','https://test.supabase.co/cover','record-1');
 assert.equal(p.table,({reel:'reels',video:'videos',post:'posts',story:'stories'})[kind]);assert.equal(p.row.id,'record-1');assert.equal(p.row.user_id,'owner');
 assert.equal(p.row[kind==='post'||kind==='story'?'image_url':'video_url'],'https://test.supabase.co/media');
 if(kind==='video'){assert.equal(p.row.duration_sec,23);assert.equal(p.row.visibility,'private');assert.equal(p.row.title,'My film');}
 else {assert.equal(p.row.music_start_ms,12000);assert.ok(p.fallback.caption.includes('pixelgram_music'));}
});
function harness(platform='android') {
 let jobs=[];const calls=[];const progress=[];const finished=[];const deleted=[];const notified=[];
 const plugin={prepare:async p=>{calls.push(['prepare',p]);jobs.push({...p,status:'staging',progress:0});},appendChunk:async p=>calls.push(['chunk',p]),enqueue:async ({id})=>{calls.push(['enqueue',id]);jobs.find(j=>j.id===id).status='uploading';},resume:async()=>{},list:async()=>({jobs:jobs.map(j=>({...j}))}),acknowledge:async({id})=>{calls.push(['ack',id]);jobs=jobs.filter(j=>j.id!==id);},markNotified:async({id})=>{jobs.find(j=>j.id===id).notified=true;}};
 globalThis.window={addEventListener:()=>{}};globalThis.document={visibilityState:'hidden',addEventListener:()=>{}};
 const manager={doneUrlFor:(k,id)=>`/${k}/${id}`,startUpload:()=> 'ui-1',updateUpload:(id,p)=>progress.push(p),finishUpload:(...args)=>finished.push(args)};
 const m=compile('./nativeBackgroundUpload.ts',{'@capacitor/core':{Capacitor:{getPlatform:()=>platform,isPluginAvailable:()=>platform==='android'},registerPlugin:()=>plugin},'@/db/supabase':{supabase:{auth:{getSession:async()=>({data:{session:{access_token:'synthetic-test',refresh_token:'synthetic-refresh',user:{id:'owner'}}}})}}},'./nativeUploadPayload':{nativeUploadPayload},'./uploadManager':manager,'./api':{notifyFollowersOfNewContent:async(...args)=>notified.push(args)},'./persistentUploadQueue':{deletePersistentJob:async id=>deleted.push(id)}});
 return {m,calls,progress,finished,deleted,notified,get jobs(){return jobs;}};
}
test('web browser retains its existing upload path',async()=>{const h=harness('web');assert.equal(await h.m.startNativeBackgroundUpload({...base,kind:'post'}),null);assert.equal(h.calls.length,0);});
test('file and cover are fully handed off before enqueue, and WebView suspension does not publish twice',async()=>{
 const oldInterval=globalThis.setInterval;globalThis.setInterval=()=>({});
 try {
 const h=harness();const file=new Blob([new Uint8Array(1024*1024+7)]);let settled=false;
 const result=h.m.startNativeBackgroundUpload({...base,kind:'reel',fileBlob:file,coverBlob:new Blob(['cover'])},'existing-ui').then(r=>{settled=true;return r;});
 for(let i=0;i<15&&!h.calls.some(c=>c[0]==='enqueue');i++)await new Promise(r=>setTimeout(r,5));
 assert.equal(h.calls[0][0],'prepare');const chunks=h.calls.filter(c=>c[0]==='chunk');
 assert.equal(chunks.filter(c=>c[1].part==='media').reduce((n,c)=>n+Buffer.from(c[1].data,'base64').length,0),file.size);
 assert.ok(chunks.every(c=>Buffer.from(c[1].data,'base64').length<=512*1024));assert.equal(h.calls.at(-1)[0],'enqueue');assert.equal(settled,false);
 // Native service progresses while document is hidden; JS promise cannot claim completion at 100 bytes.
 h.jobs[0].progress=98;await h.m.reconcileNativeUploads();assert.equal(settled,false);assert.equal(h.progress.at(-1),98);
 const claimed=await h.m.reconcileNativeUploads();assert.ok(claimed.has('persistent-1'));
 h.jobs[0].status='complete';h.jobs[0].progress=100;h.jobs[0].recordId='real-record';
 await h.m.reconcileNativeUploads();assert.equal((await result).recordId,'real-record');assert.deepEqual(h.deleted,['persistent-1']);assert.equal(h.finished.length,1);assert.equal(h.notified.length,1);
 await h.m.reconcileNativeUploads();assert.equal(h.finished.length,1);assert.equal(h.calls.filter(c=>c[0]==='enqueue').length,1);
 } finally{globalThis.setInterval=oldInterval;}
});
test('native publish failure remains an error and does not show upload complete',async()=>{
 const oldInterval=globalThis.setInterval;globalThis.setInterval=()=>({});
 try{const h=harness();const result=h.m.startNativeBackgroundUpload({...base,kind:'video'}).catch(e=>e.message);
 for(let i=0;i<15&&!h.calls.some(c=>c[0]==='enqueue');i++)await new Promise(r=>setTimeout(r,5));
 h.jobs[0].status='error';h.jobs[0].error='Publish denied';await h.m.reconcileNativeUploads();assert.equal(await result,'Publish denied');assert.equal(h.finished[0][1],'Publish denied');assert.equal(h.notified.length,0);
 }finally{globalThis.setInterval=oldInterval;}
});
