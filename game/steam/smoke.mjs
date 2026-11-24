// Run the actual packaged desktop app twice, using an isolated save profile.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';
import { createLobby } from '../lobby/server.mjs';

const [launcher] = process.argv.slice(2);
if (!launcher) throw Error('Pass the path to the packaged executable.');
const output = fileURLToPath(new URL('../../output/steam/qa/', import.meta.url));
await mkdir(output, {recursive:true});
const evidence = await mkdtemp(join(output, process.platform + '-'));
const profile = join(evidence, 'profile');
const report = { platform:process.platform, arch:process.arch, launcher:resolve(launcher), steamRuntime:process.env.CJ_STEAM_RUNTIME || null, passes:[] };

async function waitFor(description, check, timeout=120000) {
  const deadline = Date.now() + timeout;
  do {
    const result = await check();
    if (result) return result;
    await sleep(250);
  } while (Date.now() < deadline);
  throw Error('Timed out waiting for ' + description);
}

async function connect(url) {
  const ws = new WebSocket(url);
  await once(ws, 'open', {signal:AbortSignal.timeout(10000)});
  let id = 0;
  const pending = new Map();
  ws.onmessage = ({data}) => {
    const msg = JSON.parse(data);
    if (msg.method === 'Network.webSocketFrameError') {
      report.lobbyError = msg.params.errorMessage;
    }
    pending.get(msg.id)?.(msg);
  };
  ws.onclose = () => { for (const finish of pending.values()) finish({error:{message:'Window closed'}}); };
  async function call(method, params={}) {
    const seq = ++id;
    return new Promise((resolve,reject) => {
      const timer = setTimeout(() => { pending.delete(seq); reject(Error(method + ' timed out')); }, 15000);
      pending.set(seq, msg => {
        clearTimeout(timer); pending.delete(seq);
        if (msg.error) reject(Error(msg.error.message));
        else resolve(msg.result);
      });
      ws.send(JSON.stringify({id:seq, method, params}));
    });
  }
  async function evaluate(expression) {
    const result = await call('Runtime.evaluate', {expression, returnByValue:true, awaitPromise:true, userGesture:true});
    if (result.exceptionDetails) throw Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result.value;
  }
  return {call,evaluate,close:()=>ws.close()};
}

const lobby = createLobby({limit:4});
let keepProfile = false;
async function launch(check, quitButton) {
  const portFile = join(profile,'DevToolsActivePort');
  await rm(portFile,{force:true});
  const runtime = process.env.CJ_STEAM_RUNTIME;
  const game = resolve(launcher);
  const args = ['--user-data-dir=' + profile, '--remote-debugging-address=127.0.0.1', '--remote-debugging-port=0'];
  const child = spawn(runtime || game, runtime ? ['--', game, ...args] : args, {stdio:['ignore','ignore','inherit']});
  const ended = new Promise(resolve => {
    child.once('error', error=>resolve(error.message));
    child.once('exit', (code,signal)=>resolve(signal || String(code)));
  });
  let client;
  try {
    const url = await Promise.race([ended.then(reason=>{throw Error('Game exited during startup: '+reason);}),waitFor('packaged window',async()=>{
      if (!child.pid || child.exitCode !== null || child.signalCode !== null) throw Error('Packaged game exited.');
      let port;
      try { port = (await readFile(portFile,'utf8')).split(/\r?\n/)[0]; } catch { return; }
      if (!/^\d+$/.test(port)) return;
      try {
        const pages = await (await fetch('http://127.0.0.1:'+port+'/json/list',{signal:AbortSignal.timeout(1000)})).json();
        return pages.find(page=>page.url==='concrete://game/index.html')?.webSocketDebuggerUrl;
      } catch { return; }
    })]);
    client = await connect(url);
    await client.call('Page.bringToFront');
    await waitFor('playable title screen',()=>client.evaluate("document.getElementById('start-button')?.hidden===false && !document.getElementById('start-button').disabled"));
    await check(client);
    if (quitButton) {
      assert.equal(await client.evaluate("document.getElementById('quit-game').checkVisibility()"), true);
      await client.evaluate("setTimeout(()=>document.getElementById('quit-game').click(),100);true");
    } else {
      await client.evaluate('setTimeout(()=>window.close(),100);true');
    }
    assert.equal(await Promise.race([ended,sleep(8000,'timeout',{ref:false})]), '0', 'normal game shutdown');
  } finally {
    client?.close();
    if (child.exitCode===null && child.signalCode===null && child.pid) {
      child.kill();
      if(await Promise.race([ended,sleep(5000,'timeout',{ref:false})])==='timeout')keepProfile=true;
    }
  }
}

try {
  lobby.server.listen(0,'127.0.0.1');
  await once(lobby.server,'listening');
  const address='ws://127.0.0.1:'+lobby.server.address().port+'/lobby';
  await launch(async ({call,evaluate})=>{
    const click=id=>evaluate('document.getElementById('+JSON.stringify(id)+').click()');
    assert.equal(await evaluate("import('./release-mode.js').then(m=>m.publicBuild)"),true);
    assert.equal(await evaluate('location.origin'),'concrete://game');
    await click('start-button');
    await evaluate("document.getElementById('address-input').value='SoHo'");
    await click('address-search-button');
    await waitFor('SoHo destination',()=>evaluate("!!document.querySelector('#address-results button')"));
    await evaluate("document.querySelector('#address-results button').click()");
    await waitFor('spawn action',()=>evaluate("!document.getElementById('spawn-button').disabled"));
    await click('spawn-button');
    await waitFor('street gameplay',()=>evaluate("!document.getElementById('map-button').hidden && nycGame.getState().started && !nycGame.getState().switching && !nycGame.getState().traveling"));
    assert.ok(await evaluate("!!document.getElementById('world').getContext('webgl2')"));
    report.passes.push('Public build, SoHo spawn and WebGL2');
    const {data} = await call('Page.captureScreenshot',{format:'jpeg',quality:85});
    await writeFile(join(evidence,'street.jpg'),Buffer.from(data,'base64'));
    for(const type of ['keyDown','keyUp'])await call('Input.dispatchKeyEvent',{type,key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
    await waitFor('pause menu',()=>evaluate("document.getElementById('pause-dialog').open"));
    await click('lobby-open');
    await waitFor('lobby dialog',()=>evaluate("document.getElementById('lobby-dialog').open"));
    await evaluate("document.getElementById('lobby-address').value="+JSON.stringify(address));
    await call('Network.enable');
    await click('lobby-join');
    await waitFor('local lobby', async () => {
      const state = await evaluate("({joined: !document.getElementById('lobby-actions').hidden, status: document.getElementById('lobby-status').textContent})");
      if (/^(Disconnected|Could not|Connection blocked)/.test(state.status)) throw Error(state.status);
      return state.joined;
    });
    await click('lobby-race');
    await waitFor('Broadway sprint',()=>evaluate("nycGame.map.pin?.name==='Broadway & Spring'"));
    report.passes.push('Loopback lobby and sprint checkpoint');
    await evaluate("document.getElementById('lobby-dialog').close()");
    await click('pause-tab-settings');
    await click('interface-sound-button');
    assert.equal(await evaluate("localStorage.getItem('nyc.interface-sounds')"),'off');
  }, true);
  await launch(async ({evaluate})=>{
    assert.equal(await evaluate("document.getElementById('interface-sound-button').getAttribute('aria-pressed')"),'false');
    report.passes.push('Clean exit and persisted interface sound preference on relaunch');
  });
  report.result='pass';
} catch(error) {
  report.result='fail';report.error=error.message;process.exitCode=1;
} finally {
  await lobby.close();
  if(!keepProfile)await rm(profile,{recursive:true,force:true,maxRetries:4,retryDelay:300});
  await writeFile(join(evidence,'report.json'),JSON.stringify(report,null,2)+'\n');
  console.log(evidence,report);
}
