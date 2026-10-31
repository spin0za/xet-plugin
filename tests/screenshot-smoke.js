const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm');
async function main() {
  let canvas, drawn, writing = 0, item;
  const env = { document: { createElement(tag) {
    assert.equal(tag, 'canvas');
    return canvas = { width:0, height:0, getContext:()=>({drawImage(...args){drawn=args;}}),
      toBlob(callback,type){assert.equal(type,'image/png');setImmediate(()=>callback({size:123,type}));} };
  } }, navigator:{}, ClipboardItem:class {constructor(value){item=this.value=value;}} };
  vm.runInNewContext(fs.readFileSync('src/content/screenshot.js','utf8'),env);
  const api=env.__xetPlayerHelperModules.screenshot;
  const video={videoWidth:3840,videoHeight:2160,readyState:4,paused:true,currentTime:12.5,clientWidth:320,clientHeight:180};
  const result=api.copyFrame(video,{clipboard:{async write(items){writing++;assert.equal(items.length,1);
    assert.equal(canvas.width,3840);assert.equal(canvas.height,2160);
    assert.equal(typeof items[0].value['image/png'].then,'function','Start write before PNG resolves');
    assert.equal((await items[0].value['image/png']).size,123);
  }}});
  assert.equal(writing,1,'Clipboard write begins in the original gesture');
  assert.deepEqual(drawn,[video,0,0,3840,2160],'Capture decoded pixels, not CSS dimensions');
  assert.deepEqual(JSON.parse(JSON.stringify(await result)),{width:3840,height:2160});
  assert.equal(canvas.width,0,'Release the frame buffer');
  assert.equal(video.currentTime,12.5);assert.equal(video.paused,true,'Never seek or play to take a shot');
  const clipboard={async write(){throw Error('must not write')}};
  await assert.rejects(api.copyFrame({...video,readyState:1},{clipboard}),/尚未加载/);
  await assert.rejects(api.copyFrame({...video,videoWidth:0},{clipboard}),/尚未加载/);
  await assert.rejects(api.copyFrame({...video,mediaKeys:{}},{clipboard}),/受保护/);
  await assert.rejects(api.copyFrame(video,{clipboard:{}}),/无法写入/);
  let relayed=0;
  await api.copyFrame(video,{clipboard:{async write(){const e=Error('policy');e.name='NotAllowedError';throw e;}},
    async fallback(blob,size){relayed++;assert.equal(blob.size,123);assert.equal(size.width,3840);}});
  assert.equal(relayed,1,'Cross-origin iframe policy can relay the same encoded original frame');
  await api.copyFrame(video,{clipboard:{async write(){throw Error('Policy-blocked API must not be attempted');}},preferRelay:true,
    async fallback(blob){relayed++;assert.equal(blob.size,123);}});
  assert.equal(relayed,2,'Avoid policy-violation console errors when delegation is already known to be blocked');
  env.document.createElement=()=>({getContext:()=>({drawImage(){}}),toBlob(){const e=Error('tainted');e.name='SecurityError';throw e;}});
  await assert.rejects(api.copyFrame(video,{clipboard:{async write(items){await items[0].value['image/png'];}}}),{name:'SecurityError'});
  env.document.createElement=()=>({getContext:()=>({drawImage(){}}),toBlob(callback){callback(null);}});
  await assert.rejects(api.copyFrame(video,{clipboard:{async write(items){await items[0].value['image/png'];}}}),/编码失败/);
  const manifest=JSON.parse(fs.readFileSync('manifest.json','utf8'));
  assert.ok(manifest.permissions.includes('clipboardWrite'));
  assert.ok(!manifest.permissions.includes('clipboardRead'),'Never read the user clipboard');
  const source=fs.readFileSync('src/content/screenshot.js','utf8');
  assert.doesNotMatch(source,/captureVisibleTab|devicePixelRatio|video\.play\(|video\.pause\(|video\.currentTime\s*=/);
  const bytes=Buffer.alloc(33);Buffer.from([137,80,78,71,13,10,26,10]).copy(bytes);bytes.writeUInt32BE(13,8);bytes.write('IHDR',12);bytes.writeUInt32BE(1280,16);bytes.writeUInt32BE(720,20);
  let copies=0;const injections=[];
  const sourceEnv={URL,Uint8Array,DataView,Blob,atob,location:{origin:'https://merchant.test'},
    navigator:{clipboard:{async write(){copies++;}}},ClipboardItem:class{constructor(value){this.value=value;}},
    chrome:{scripting:{async executeScript(call){injections.push(call);return[{result:{ok:true}}];}}}};
  vm.runInNewContext(fs.readFileSync('src/screenshot-source.js','utf8'),sourceEnv);
  const relay=sourceEnv.XetScreenshotSource;
  assert.equal((await relay.writePng(bytes.toString('base64'),1280,720,'https://merchant.test')).ok,true);
  assert.equal(copies,1);
  assert.equal((await relay.writePng(bytes.toString('base64'),1920,1080,'https://merchant.test')).ok,false,'Reject forged PNG dimensions');
  assert.equal((await relay.writePng(bytes.toString('base64'),1280,720,'https://other.test')).ok,false,'Do not copy after top-origin navigation');
  let disabled=[];const deps={siteAccess:{siteInfo:value=>{try{return{origin:new URL(value).origin};}catch{return null;}},isAuthorized:async()=>true},readSettings:async()=>({disabledSites:disabled})};
  const sender={tab:{id:7,url:'https://merchant.test/course'},frameId:2,url:'https://iframe.test/player'};
  const message={png:bytes.toString('base64'),width:1280,height:720};
  assert.equal((await relay.resolve(message,sender,deps)).ok,true);
  assert.equal(injections[0].world,'ISOLATED');assert.deepEqual(Array.from(injections[0].target.frameIds),[0]);
  assert.equal(injections[0].target.tabId,7,'Clipboard relay stays in the same tab');
  disabled=['https://merchant.test'];assert.equal((await relay.resolve(message,sender,deps)).ok,false);
  disabled=['https://iframe.test'];assert.equal((await relay.resolve(message,sender,deps)).ok,false);
  disabled=[];
  for(const invalid of [{...message,png:'<script>'},{...message,width:0},{...message,width:999999999}])assert.equal((await relay.resolve(invalid,sender,deps)).ok,false);
  assert.equal((await relay.resolve(message,{...sender,frameId:0},deps)).ok,false);
  assert.equal(injections.length,1,'Invalid/disabled/unrelated senders never reach the clipboard');
  console.log('Original-resolution PNG, immediate clipboard write, readiness/DRM/CORS failure and no clipboard-read smoke passed');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
