// A local, stable origin gives modules, workers and saved games the same origin
// on every launch. Only the packaged game is addressable through this scheme.
const { app, BrowserWindow, Menu, net, protocol, shell } = require('electron');
const { resolve, sep, extname } = require('node:path');
const { pathToFileURL } = require('node:url');

protocol.registerSchemesAsPrivileged([{scheme:'concrete', privileges:{
  standard:true, secure:true, supportFetchAPI:true, corsEnabled:true, stream:true
}}]);
const root = resolve(__dirname, 'dist');
const start = 'concrete://game/index.html';
const types = {'.html':'text/html', '.js':'text/javascript', '.mjs':'text/javascript',
  '.css':'text/css', '.json':'application/json', '.wasm':'application/wasm', '.txt':'text/plain'};
async function serve(request) {
  const url = new URL(request.url);
  if (url.host !== 'game') return new Response(null, {status:404});
  if (url.pathname.startsWith('/api/')) return new Response(null, {status:503});
  if (request.method !== 'GET' && request.method !== 'HEAD') return new Response(null, {status:405});
  try {
    const file = resolve(root, '.' + decodeURIComponent(url.pathname));
    if (!file.startsWith(root + sep)) return new Response(null, {status:404});
    const response = await net.fetch(pathToFileURL(file).href, {headers:request.headers, method:request.method});
    const headers = new Headers(response.headers);
    const type = types[extname(file)];
    if (type) headers.set('Content-Type', type);
    return new Response(response.body, {status:response.status, headers});
  } catch { return new Response(null, {status:404}); }
}

app.setName('Concrete Jungle');
const local = href => href.startsWith('concrete://game/');
function createWindow(url = start, parent) {
  const win = new BrowserWindow({title:'Concrete Jungle', width:1440, height:900, parent,
    backgroundColor:'#171a1d', icon:resolve(root,'assets/favicon.png'),
    webPreferences:{sandbox:true, contextIsolation:true, nodeIntegration:false, devTools:false}});
  const openLink = href => {
    if (local(href)) createWindow(href, win);
    else if (href.startsWith('https://')) void shell.openExternal(href);
  };
  win.webContents.setWindowOpenHandler(({url}) => { openLink(url); return {action:'deny'}; });
  win.webContents.on('will-navigate', (event, href) => {
    if (href === url) return;
    event.preventDefault();
    openLink(href);
  });
  void win.loadURL(url);
  return win;
}
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.whenReady().then(() => {
    Menu.setApplicationMenu(null);
    protocol.handle('concrete', serve);
    const game = createWindow();
    app.on('second-instance', () => { if (game.isMinimized()) game.restore(); game.focus(); });
  });
  app.on('window-all-closed', () => app.quit());
}
