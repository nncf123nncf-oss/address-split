// 投稿カード用の素材を撮る（Chrome headless / CDP・DPR2）。実行: node source/shoot.js <出力フォルダ>
// 01-x-primary: 1060px幅・2列・ヤマトのタブ（左に貼ったDMの文、右に分かれた欄）／02-clickpost-3: 680px幅・クリックポストのタブ・3人分とCSVボタン
// 03-yamato-560: 560px幅・ヤマトのタブの欄だけ（予備）
const fs = require('fs'), path = require('path'), http = require('http');
const { launch } = require('./cdp');
const OUT = path.resolve(process.argv[2] || 'shots');
fs.mkdirSync(OUT, { recursive: true });
const HTML = fs.readFileSync(path.join(__dirname, '..', 'index.html'));
const PORT = 8791, ORIGIN = 'http://127.0.0.1:' + PORT + '/';
const srv = http.createServer((q, r) => { r.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); r.end(HTML); }).listen(PORT);
const rect = sel => `(()=>{const r=document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect();return {x:r.left+scrollX,y:r.top+scrollY,w:r.width,h:r.height}})()`;
const union = (a, b) => { const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y); return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y }; };
const pad = (a, p) => ({ x: Math.max(0, a.x - p), y: Math.max(0, a.y - p), width: a.w + p * 2, height: a.h + p * 2 });
// 見本はすべて架空（地名・名前・電話番号）。ミナトが手で作ったDMの文
const one = `localStorage.clear();document.getElementById('ex1').click();document.getElementById('tab-yamato').click();`;
const many = `localStorage.clear();document.getElementById('ex3').click();document.getElementById('tab-clickpost').click();document.getElementById('naiyo').value='アクセサリー';`;

(async () => {
  const b = await launch(9472);
  await b.send('Network.enable');
  await b.send('Network.setBlockedURLs', { urls: ['*cloudflareinsights.com*'] });
  // 01: 1060px・2列。左の「届いた文を貼る」の見出し〜右の建物名の欄まで
  await b.open(ORIGIN, 1060, 2000, 2, false, 'light');
  await b.ev(one); await b.sleep(500);
  const inH = await b.ev(rect('#in-h')), bld = await b.ev(rect('.fld[data-key="ymbld"]')), src = await b.ev(rect('#src'));
  await b.shot(path.join(OUT, '01-x-primary.png'), pad(union(union(inH, bld), src), 14));
  // 02: 680px・クリックポスト・3人分の見出し〜CSVボタン
  await b.open(ORIGIN, 680, 2400, 2, false, 'light');
  await b.ev(many); await b.sleep(500);
  const ch = await b.ev(rect('.count-h')), go = await b.ev(rect('#csv-go')), tabs = await b.ev(rect('.tabs'));
  await b.shot(path.join(OUT, '02-clickpost-3.png'), pad(union(union(tabs, ch), go), 14));
  // 03: 560px・ヤマトの欄（予備）
  await b.open(ORIGIN, 560, 2400, 2, true, 'light');
  await b.ev(one); await b.sleep(500);
  const tb = await b.ev(rect('.tabs')), tel = await b.ev(rect('.fld[data-key="ymbld"]'));
  await b.shot(path.join(OUT, '03-yamato-560.png'), pad(union(tb, tel), 12));
  console.log(JSON.stringify({ inH, bld, src, ch, go, tabs, tb, tel }));
  b.close(); srv.close();
})().catch(e => { console.error(e); process.exit(1); });
