// 黙って落ちる字がないかの総当たり。実行: node source/fuzz.js index.html
// 行の組み合わせを作り、内容のある字（3字以上のカナ・漢字・英数字の並び）がどの欄にも確認の文にも無いものを数える
const fs = require('fs'), vm = require('vm');
const h = fs.readFileSync(process.argv[2], 'utf8');
const src = /<script id="core">([\s\S]*?)<\/script>/.exec(h)[1];
const ctx = { module: { exports: {} }, console, TextDecoder }; vm.createContext(ctx); vm.runInContext(src, ctx);
const AS = ctx.module.exports;
const greet = ['こんにちは！', 'よろしくお願いします', 'お疲れ様です', 'いつもありがとうございます', 'ピアスの件、こちらに送ってください', 'みほん工房様', '作家様、こんにちは', ''];
const pre = ['', '株式会社みほん 総務部', 'サンプルハイツ203号室', '〒000-0012'];
const addr = ['東京都千代田区見本1-2', '東京都架空区見本町3丁目12-5 サンプルハイツ203', '山田花子様 東京都新宿区見本2-8-1', '〒000-0012 東京都千代田区見本1-2 ルミエール見本', '東京都千代田区\n見本町1-2-3', '神奈川県横浜市旭区希望が丘1-2-3'];
const cont = ['', 'みほんハイツ101', '佐藤様方', 'ルミエール見本', 'パークサイド南館までお願いします', 'スカイ壱番館 宛にお願いします', '090-0000-1234 サンプルビル3F', '北海道ビル4F', '田中商店に届けてください'];
const nameL = ['山田 花子様', '山田花子です', '名前：山田花子', 'サンプルハイツ203 山田花子様', ''];
const post = ['', '日中は不在がちです', 'インスタ @hanako_mihon', 'ピアス 1点', '置き配希望', '11月3日までに届くと嬉しいです'];
const isGreet = t => !t || greet.includes(t);
let n = 0, bad = [], thrown = [];
for (const g of greet) for (const pr of pre) for (const a of addr) for (const c of cont) for (const nl of nameL) for (const po of post) {
  const text = [g, pr, a, c, nl, po].filter(Boolean).join('\n');
  n++;
  let r;
  try { r = AS.parse(text).rows[0]; } catch (e) { thrown.push(text); continue; }
  if (!r) { bad.push({ text, miss: ['(no row)'] }); continue; }
  const out = [r.zip, r.name, r.pref, r.city, r.town, r.numText, r.chome, r.banchi, r.go, r.building, r.tel].join(' ') + ' ' + r.checks.map(x => x.msg).join(' ');
  const flat = out.replace(/\s/g, '');
  const miss = [];
  for (const line of [pr, a, c, nl, po].filter(Boolean)) {
    for (const tok of line.split(/[\s\n、。！!]+/)) {
      const t = tok.replace(/(様|さま|です|でお願いします|までお願いします|宛にお願いします|に届けてください|宛)$/, '').replace(/^(名前：)/, '');
      if (t.length < 3 || /^〒?\d{3}-?\d{4}$/.test(t)) continue;
      if (!flat.includes(t.replace(/\s/g, ''))) miss.push(t);
    }
  }
  if (miss.length) bad.push({ text, miss });
}
console.log('cases', n, 'silent', bad.length, 'thrown', thrown.length);
const byTok = {};
bad.forEach(b => b.miss.forEach(m => { byTok[m] = (byTok[m] || 0) + 1; }));
console.log(JSON.stringify(byTok));
if (bad[0]) console.log(JSON.stringify(bad.slice(0, 3), null, 1));
if (thrown[0]) console.log('THROWN', JSON.stringify(thrown.slice(0, 2)));
