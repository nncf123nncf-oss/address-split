// 黙って落ちる字がないかの総当たり。実行: node source/fuzz.js index.html
// 行の候補を組み合わせて流し、次の3つを数える
//   silent: 貼った行の内容のある語（2字以上）が、どの欄にも・確認の文にも・読み飛ばした行にも出ない
//           （住所の前の行・住所の続きの行の候補は、読み飛ばした行に入っただけでは合格にしない。欄か確認の文に出ること）
//   wrong:  名前・郵便番号の欄が、組み合わせから決まる正しい値と違うのに、名前・郵便番号の確認が1つも出ていない
//   thrown: 例外で止まった
const fs = require('fs'), vm = require('vm');
const h = fs.readFileSync(process.argv[2], 'utf8');
const src = /<script id="core">([\s\S]*?)<\/script>/.exec(h)[1];
const ctx = { module: { exports: {} }, console, TextDecoder }; vm.createContext(ctx); vm.runInContext(src, ctx);
const AS = ctx.module.exports;
// [行, その行に入っている名前（あれば）]
const greet = [['', ''], ['こんにちは！', ''], ['よろしくお願いします', ''], ['お疲れ様です', ''], ['ピアスの件、こちらに送ってください', ''], ['みほん工房様', ''], ['作家様、こんにちは', ''], ['よろしくお願いします。山田花子', '山田花子'], ['お届け先：山田花子様', '山田花子'], ['送り先: 山田花子様', '山田花子']];
const pre = [['', ''], ['株式会社みほん 総務部', ''], ['サンプルハイツ203号室', ''], ['ご注文番号 1234567', ''], ['郵便番号：000-0012', ''], ['1234567の件です', ''], ['アルカ見本 よろしくお願いします', '']];
const addr = ['東京都千代田区見本1-2 000-0012', '〒000-0012\n東京都千代田区見本1-2', '〒000-0012 東京都架空区見本町3丁目12-5 サンプルハイツ203', '〒000-0012\n山田花子様 東京都新宿区見本2-8-1', '〒000-0012 東京都千代田区見本1-2 ルミエール見本', '〒000-0012\n東京都千代田区\n見本町1-2-3'];
const cont = ['', 'みほんハイツ101', '佐藤様方', 'ルミエール見本', 'パークサイド南館までお願いします', 'スカイ壱番館 宛にお願いします', '090-0000-1234 サンプルビル3F', '北海道ビル4F', '田中商店に届けてください', 'シティ見本でお願いします', '白樺台 よろしくお願いします', '藤和見本でお願いします'];
const nameL = [['山田 花子様', '山田 花子'], ['山田花子です', '山田花子'], ['名前：山田花子', '山田花子'], ['サンプルハイツ203 山田花子様', '山田花子'], ['電話 090-0000-1234 山田花子', '山田花子'], ['', '']];
const post = ['', '日中は不在がちです', 'インスタ @hanako_mihon', 'ピアス 1点', '置き配希望', '11月3日までに届くと嬉しいです', '届け先は母の家です'];
const SKIP_TOK = /^(名前|お届け先|送り先|電話|郵便番号|ご注文番号|こんにちは|よろしくお願いします|お疲れ様|作家様|作家|みほん工房|こちらに送ってください|1234567の件|よろしく)$/;
let n = 0, silent = [], wrong = [], thrown = [];
for (const g of greet) for (const pr of pre) for (const a of addr) for (const c of cont) for (const nl of nameL) for (const po of post) {
  const lines = [g[0], pr[0], a, c, nl[0], po].filter(Boolean);
  const text = lines.join('\n');
  n++;
  let res;
  try { res = AS.parse(text); } catch (e) { thrown.push(text); continue; }
  const r = res.rows[0];
  if (!r) { silent.push({ text, miss: ['(1人分として読めなかった)'] }); continue; }
  const out = [r.zip, r.zip.replace('-', ''), r.name, r.pref, r.city, r.town, r.numText, r.chome, r.banchi, r.go, r.building, r.tel].join(' ') + ' ' +
    r.checks.map(x => x.msg).join(' ') + ' ' + (r.skimmed || []).join(' ') + ' ' + (res.droppedHeads || []).join(' ');
  const flat = out.replace(/\s/g, '');
  const strictOut = [r.zip, r.name, r.pref, r.city, r.town, r.numText, r.building, r.tel].join(' ') + ' ' + r.checks.map(x => x.msg).join(' ') + ' ' + (res.droppedHeads || []).join(' ');
  const flatStrict = strictOut.replace(/\s/g, '');
  const miss = [];
  for (const line of lines) {
    const strict = (line === c || line === pr[0]) && line !== '';
    for (const tok of line.split(/[\s\n、。！!：:]+/)) {
      const t = tok.replace(/(様|さま|です|でお願いします|までお願いします|宛にお願いします|に届けてください|宛|でした)$/, '');
      if (t.length < 2 || /^〒?\d{3}-?\d{4}$/.test(t) && t.replace(/\D/g, '') === '0000012' || SKIP_TOK.test(t)) continue;
      if (!(strict ? flatStrict : flat).includes(t.replace(/\s/g, ''))) miss.push(t + (strict ? '（欄か確認に出ない）' : ''));
    }
  }
  if (miss.length) silent.push({ text, miss });
  // 名前の正しい値: 宛名の行（nameL）・お届け先の行（greet）・住所と同じ行の「山田花子様」のどれか（宛名の行を優先）
  const wantName = nl[1] || g[1] || (/山田花子様 東京都/.test(a) ? '山田花子' : '');
  const nameOk = !wantName || r.name.replace(/\s/g, '') === wantName.replace(/\s/g, '');
  const zipOk = r.zip === '000-0012';
  if ((!nameOk || !zipOk) && !r.checks.some(x => /名前|郵便番号|7桁/.test(x.msg))) wrong.push({ text, name: r.name, wantName, zip: r.zip });
}
console.log('cases', n, 'silent', silent.length, 'wrong', wrong.length, 'thrown', thrown.length);
const byTok = {};
silent.forEach(b => b.miss.forEach(m => { byTok[m] = (byTok[m] || 0) + 1; }));
if (silent.length) console.log('silent tokens', JSON.stringify(byTok), '\n例', JSON.stringify(silent[0]));
if (wrong.length) console.log('wrong 例', JSON.stringify(wrong.slice(0, 3)));
if (thrown.length) console.log('thrown 例', JSON.stringify(thrown.slice(0, 2)));
