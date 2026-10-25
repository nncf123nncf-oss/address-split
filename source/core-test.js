// 純ロジックの検算。実行: node source/core-test.js（先に python source/build.py で index.html を作る）
// index.html の <script id="core"> を取り出して読み込み、分け方・欄・CSVを確かめる
const fs = require('fs'), path = require('path'), vm = require('vm');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const src = /<script id="core">([\s\S]*?)<\/script>/.exec(html)[1];
const ctx = { module: { exports: {} }, console, TextDecoder };
vm.createContext(ctx); vm.runInContext(src, ctx);
const AS = ctx.module.exports;
let pass = 0, fail = 0;
function eq(name, got, want) {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) pass++; else { fail++; console.log('NG', name, '\n  got ', g, '\n  want', w); }
}
const one = t => AS.parse(t).rows[0];
const parts = r => r && [r.zip, r.name, r.pref, r.city, r.town, r.chome, r.banchi, r.go, r.building];
const fv = (r, c) => Object.fromEntries(AS.fields(r, c).map(f => [f.key, f.value]));
const errs = (r, c) => { const f = AS.fields(r, c); return f.map(x => [x.key, AS.judge(x, f).err]).filter(x => x[1]); };
const has = (r, re) => r.checks.some(c => re.test(c.msg));
// 画面に出るか（確認の文か、読み飛ばした行のどちらか）
const shown = (r, re) => has(r, re) || (r.skimmed || []).some(x => re.test(x));

eq('muni count', AS.MUNI_COUNT > 1900, true);
eq('prefs', AS.PREFS.length, 47);

// S1 1人分の見本（Card1）
const s1 = one(AS.SAMPLE_ONE);
eq('S1 parts', parts(s1), ['000-0012', '山田 花子', '東京都', '架空区', '見本町', '3', '12', '5', 'サンプルハイツ見本台203号室']);
eq('S1 tel', s1.tel, '090-0000-1234');
eq('S1 cp', AS.cpLines(s1), ['東京都架空区', '見本町3丁目12-5', 'サンプルハイツ見本台203号室']);
eq('S1 cp intact', AS.cpIntact(s1), true);
const y1 = fv(s1, 'yupack');
eq('S1 yupack', [y1.zip, y1.name, y1.pref, y1.ycity, y1.ynum, y1.ybld], ['0000012', '山田　花子', '東京都', '架空区見本町', '３丁目１２－５', 'サンプルハイツ見本台２０３号室']);
const m1 = fv(s1, 'yamato');
eq('S1 yamato', [m1.sei, m1.mei, m1.yaddr, m1.banchi, m1.go, m1.ymbld], ['山田', '花子', '東京都架空区見本町３丁目', '１２', '５', 'サンプルハイツ見本台２０３号室']);
eq('S1 checks', s1.checks.map(c => c.f), ['name', 'city']);
eq('S1 no field errors', [errs(s1, 'clickpost'), errs(s1, 'yupack'), errs(s1, 'yamato')], [[], [], []]);

// S2 3人分の見本（Card2）
const s2 = AS.parse(AS.SAMPLE_MANY).rows;
eq('S2 count', s2.length, 3);
eq('S2 #1', parts(s2[0]), ['000-0002', '佐藤 一郎', '大阪府', '見本市', '試し町', '1', '2', '3', 'みほんマンション4F']);
eq('S2 #2', parts(s2[1]), ['000-0001', '鈴木 さくら', '北海道', '架空郡見本町', '字下ノ原', '', '', '', '']);
eq('S2 #2 checks', s2[1].checks.map(c => c.f), ['name', 'city', 'banchi']);
eq('S2 #3 cp', AS.cpLines(s2[2]), ['福岡県見本市架空区', 'ためし台2丁目3番4号', 'ためしレジデンス見本台ウエストタワーA棟', '1205']);
eq('S2 #3 intact', AS.cpIntact(s2[2]), true);

// S3 郵便番号の形と電話との取り違え
eq('S3 a', one('〒1234567 東京都千代田区見本1-2').zip, '123-4567');
eq('S3 b', one('123-4567 東京都千代田区見本1-2').zip, '123-4567');
eq('S3 c', one('〒１２３ー４５６７\n東京都千代田区見本1-2').zip, '123-4567');
eq('S3 d', one('〒 123-4567 東京都千代田区見本1-2').zip, '123-4567');
eq('S3 none', one('東京都千代田区見本1-2 山田様').zip, '');
const s3t = one('東京都千代田区見本1-2\n電話 03-0000-1234 山田様');
eq('S3 tel not zip', [s3t.zip, s3t.tel], ['', '03-0000-1234']);
eq('S3 tel nohyphen', one('〒000-0001 東京都千代田区見本1-2 09000001234').tel, '09000001234');

// S4 市区町村の最長一致（実在の市区町村名＋架空の町名）
const city = t => one(t).city;
eq('S4 四日市', city('三重県四日市市見本町1-2'), '四日市市');
eq('S4 市川', city('千葉県市川市見本1-2'), '市川市');
eq('S4 町田', city('東京都町田市見本町1-2'), '町田市');
eq('S4 東村山', city('東京都東村山市見本町1-2'), '東村山市');
eq('S4 大和郡山', city('奈良県大和郡山市見本町1-2'), '大和郡山市');
eq('S4 廿日市', city('広島県廿日市市見本1-2'), '廿日市市');
eq('S4 野々市', city('石川県野々市市見本1-2'), '野々市市');
eq('S4 十日町', city('新潟県十日町市見本1-2'), '十日町市');
eq('S4 郡山', city('福島県郡山市見本町1-2'), '郡山市');
eq('S4 郡', city('北海道亀田郡七飯町見本1-2'), '亀田郡七飯町');
eq('S4 政令市の区', city('神奈川県横浜市中区見本町1-2'), '横浜市中区');
eq('S4 京都', city('京都府京都市中京区見本町1-2'), '京都市中京区');
eq('S4 ヶとケ', city('神奈川県茅ヶ崎市見本1-2'), '茅ヶ崎市');
eq('S4 listed no check', one('三重県四日市市見本町1-2 山田様').checks.filter(c => c.f === 'city').length, 0);
const s4p = one('横浜市中区見本町1-2 山田様');
eq('S4 pref fill', [s4p.pref, s4p.city], ['神奈川県', '横浜市中区']);
eq('S4 pref fill check', s4p.checks.some(c => c.f === 'pref'), true);
eq('S4 府中 ambiguous', one('府中市見本町1-2 山田様').pref, '');

// S5 丁目・番地・号と建物
const nb = t => { const r = one('東京都千代田区' + t); return [r.town, r.chome, r.banchi, r.go, r.building]; };
eq('S5 chome', nb('見本町3丁目12-5'), ['見本町', '3', '12', '5', '']);
eq('S5 kanji', nb('見本町三丁目12番5号'), ['見本町', '3', '12', '5', '']);
eq('S5 kanji ten', nb('見本町十二丁目1番'), ['見本町', '12', '1', '', '']);
eq('S5 two', nb('見本町12-5'), ['見本町', '', '12', '5', '']);
eq('S5 three', nb('見本町3-12-5'), ['見本町', '3', '12', '5', '']);
eq('S5 four', nb('見本町12-5-6-203'), ['見本町', '12', '5', '6', '203']);
eq('S5 ban', nb('見本町12番地5'), ['見本町', '', '12', '5', '']);
eq('S5 bld digit', nb('見本町1-2 第2みほんビル'), ['見本町', '', '1', '2', '第2みほんビル']);
eq('S5 nospace', nb('見本町12-5みほんビル3F'), ['見本町', '', '12', '5', 'みほんビル3F']);
eq('S5 号室', nb('見本町12番5号 みほん荘101号室'), ['見本町', '', '12', '5', 'みほん荘101号室']);
eq('S5 none', nb('見本町字下ノ原'), ['見本町字下ノ原', '', '', '', '']);
eq('S5 four check', one('東京都千代田区見本町12-5-6-203').checks.map(c => c.f), ['zip', 'name', 'chome', 'building']);
eq('S5 next line bld', one('〒000-0001\n東京都千代田区見本町1-2\nみほんハイツ101\n山田様').building, 'みほんハイツ101');

// S6 クリックポストの4行（字を削らない）
const longR = one('〒000-0001 北海道架空郡見本町字見本原ためしたかはらみほんのさと1234-5 ためしためしためしためしためしマンション見本台南棟1203号室 山田様');
const L6 = AS.cpLines(longR);
eq('S6 each <=20', L6.every(l => AS.width(l) <= 20), true);
eq('S6 intact', AS.cpIntact(longR), true);
eq('S6 wrap keeps chars', AS.wrap('あいうえおかきくけこさしすせそたちつてとなに', 20), ['あいうえおかきくけこさしすせそたちつてと', 'なに']);
eq('S6 wrap half', AS.width('abc') === 1.5, true);
const huge = one('〒000-0001 北海道' + '見'.repeat(30) + '町' + '本'.repeat(40) + '1-2 ' + 'ビ'.repeat(40) + ' 山田様');
const hf = AS.fields(huge, 'clickpost');
eq('S6 over 4 lines flagged', hf.some(f => f.extra && AS.judge(f, hf).err === '4行に収まりません'), true);

// S7 送り方ごとの決まり
const r7 = one('〒000-0001 東京都千代田区見本町12-5 山田 花子様');
r7.banchi = '12-5'; r7.numText = '';
eq('S7 yamato hyphen', errs(r7, 'yamato').map(e => e[0]), ['banchi']);
r7.banchi = '123456';
eq('S7 yamato 5', errs(r7, 'yamato')[0][1], '1字超えています');
const r7b = one('〒000-0001 東京都' + '見'.repeat(5) + '市' + '本'.repeat(17) + '町1-2 山田様');
eq('S7 yupack sum25', errs(r7b, 'yupack').some(e => /合わせて25字/.test(e[1])), true);
const r7c = one('東京都千代田区見本町1-2 山田様');
eq('S7 yupack zip7', errs(r7c, 'yupack').some(e => e[0] === 'zip'), false);
r7c.zip = '12-34';
eq('S7 yupack zip bad', errs(r7c, 'yupack').some(e => e[0] === 'zip'), true);
r7c.honor = 'さん';
eq('S7 honor list', errs(r7c, 'yupack').some(e => e[0] === 'honor'), true);

// S8 氏名
const nm = t => { const r = one(t); return [r.name, r.honor, r.checks.some(c => c.f === 'name')]; };
eq('S8 sama', nm('〒000-0001 東京都千代田区見本1-2 山田 花子様'), ['山田 花子', '様', false]);
eq('S8 sama line', nm('〒000-0001\n東京都千代田区見本1-2\n山田花子 様'), ['山田花子', '様', false]);
eq('S8 label', nm('お名前：山田 花子\n〒000-0001\n東京都千代田区見本1-2'), ['山田 花子', '様', false]);
eq('S8 label wa', nm('名前は山田です\n〒000-0001\n東京都千代田区見本1-2'), ['山田', '様', false]);
eq('S8 guess', nm('よろしくお願いします\n〒000-0001\n東京都千代田区見本1-2\n山田 花子'), ['山田 花子', '様', true]);
eq('S8 none', nm('よろしくお願いします！\n〒000-0001\n東京都千代田区見本1-2'), ['', '様', true]);
eq('S8 onchu', nm('〒000-0001 東京都千代田区見本1-2 みほん商店 御中'), ['みほん商店', '御中', false]);
eq('S8 sei mei', [s1.sei, s1.mei], ['山田', '花子']);
const nosp = one('〒000-0001 東京都千代田区見本1-2 山田花子様');
eq('S8 nospace', [nosp.sei, nosp.mei], ['山田花子', '']);

// S9 CSV（クリックポスト）
const c9 = AS.csvClickpost(s2, 'アクセサリー');
const c9l = c9.split('\r\n');
eq('S9 header', c9l[0], 'お届け先郵便番号,お届け先氏名,お届け先敬称,お届け先住所1行目,お届け先住所2行目,お届け先住所3行目,お届け先住所4行目,内容品');
eq('S9 row1', c9l[1], '0000002,佐藤 一郎,様,大阪府見本市,試し町1-2-3,みほんマンション4F,,アクセサリー');
eq('S9 row3', c9l[3], '0000003,田中 次郎,様,福岡県見本市架空区,ためし台2丁目3番4号,ためしレジデンス見本台ウエストタワーA棟,1205,アクセサリー');
eq('S9 crlf end', c9.endsWith('\r\n') && !/[^\r]\n/.test(c9), true);
eq('S9 cell quote', AS.csvCell('a,"b"'), '"a,""b"""');
eq('S9 cell no prefix', AS.csvCell('=1+1'), '=1+1');
eq('S9 badLead', [AS.badLead('=1+1'), AS.badLead('@x'), AS.badLead('+81'), AS.badLead('-1'), AS.badLead('山田'), AS.badLead('')], [true, true, true, true, false, false]);
eq('S9 vendor chars stop', AS.toSjis('①㈱髙﨑ⅰ').bad, ['①', '㈱', '髙', '﨑', 'ⅰ']);
const enc = AS.toSjis(c9);
eq('S9 sjis ok', !!enc.bytes, true);
eq('S9 sjis roundtrip', new TextDecoder('shift_jis').decode(enc.bytes), c9);
eq('S9 sjis bad', AS.toSjis('山田😀髙').bad, ['😀', '髙']);
eq('S9 sjis wave', !!AS.toSjis('10〜20').bytes, true);
eq('S9 hankaku kana', Array.from(AS.toSjis('ｱ').bytes), [0xB1]);

// S10 CSV（Webゆうパックプリント）
const snd = { name: 'みほん工房', zip: '000-0099', pref: '東京都', city: '架空区見本町', num: '1-1', building: '', tel: '03-0000-0099' };
const c10 = AS.csvYupack([s1], { kind: 'pack', item: 'アクセサリー' }, snd).split('\r\n')[0];
const cols = c10.split(',');
eq('S10 72', cols.length, 72);
eq('S10 cols', [cols[0], cols[1], cols[7], cols[8], cols[10], cols[11], cols[12], cols[13], cols[14], cols[15], cols[22], cols[25], cols[27], cols[28], cols[34], cols[64]],
  ['1', '0', '山田　花子', '様', '0000012', '東京都', '架空区見本町', '３丁目１２－５', 'サンプルハイツ見本台２０３号室', "'090-0000-1234".replace("'", ''), 'みほん工房', '0000099', '架空区見本町', '１－１', 'アクセサリー', '0']);
const c10p = AS.csvYupack([s1], { kind: 'packet', item: '' }, snd).split(',');
eq('S10 packet', [c10p[0], c10p[1]], ['6', '']);
eq('S10 no header', /お届け先/.test(c10), false);
eq('S10 sender missing', AS.senderProblems({ name: '', zip: '12', city: '' }), ['お名前', '郵便番号（7桁）', '市区町村郡']);
eq('S10 sender ok', AS.senderProblems(snd), []);

// 上限・その他
eq('max rows', AS.parse(Array.from({ length: 45 }, (_, i) => '〒000-00' + String(i).padStart(2, '0') + ' 東京都千代田区見本1-' + (i + 1)).join('\n\n')).rows.length, 40);
eq('greeting only block dropped', AS.parse('こんにちは\n\n〒000-0001 東京都千代田区見本1-2 山田様').rows.length, 1);
eq('no address', AS.parse('こんにちは よろしく').rows.length, 0);
eq('zen', AS.toZen('A-1 b'), 'Ａ－１　ｂ');
eq('kan', [AS.kanToNum('三'), AS.kanToNum('十'), AS.kanToNum('二十三'), AS.kanToNum('十五')], ['3', '10', '23', '15']);


// レビュー①の指摘（2026-10-26）
const rv = t => { const r = one(t); return [r.zip, r.name, r.pref, r.city, r.town, r.chome, r.banchi, r.go, r.building, AS.cpIntact(r)]; };
eq('R1 multiline a', rv('〒000-0012\n東京都架空区見本町3丁目\n12-5\nサンプルハイツ101\n山田 花子様'), ['000-0012', '山田 花子', '東京都', '架空区', '見本町', '3', '12', '5', 'サンプルハイツ101', true]);
eq('R1 multiline b', rv('東京都架空区\n見本町1-2-3\n山田様'), ['', '山田', '東京都', '架空区', '見本町', '1', '2', '3', '', true]);
eq('R1 multiline c', rv('東京都架空区見本町1-2-3\n〒000-0012\nみほんハイツ101\n山田花子様'), ['000-0012', '山田花子', '東京都', '架空区', '見本町', '1', '2', '3', 'みほんハイツ101', true]);
eq('R1 tel line skipped', one('〒000-0012\n東京都千代田区見本1-2\n電話 090-0000-1234\n山田様').building, '');
eq('R2 zip mid', rv('東京都架空区見本町1-2-3 〒000-0012 みほんハイツ101 山田花子様'), ['000-0012', '山田花子', '東京都', '架空区', '見本町', '1', '2', '3', 'みほんハイツ101', true]);
eq('R2 7digit building', one('〒000-0012 東京都千代田区見本1-2 みほんビル1234567 山田様').building, 'みほんビル1234567');
eq('R3 御殿場', rv('〒000-0012 静岡県御殿場市見本1-2 山田 花子様'), ['000-0012', '山田 花子', '静岡県', '御殿場市', '見本', '', '1', '2', '', true]);
eq('R3 様似', one('〒000-0012 北海道様似郡様似町見本1-2 山田様').city, '様似郡様似町');
eq('R3 殿町', one('〒000-0012 神奈川県川崎市川崎区殿町見本1-2 山田様').name, '山田');
eq('R3 様方', [one('〒000-0012 東京都千代田区見本1-2 みほんハイツ 山田様方 佐藤花子様').name, one('〒000-0012 東京都千代田区見本1-2 みほんハイツ 山田様方 佐藤花子様').building], ['佐藤花子', 'みほんハイツ 山田様方']);
eq('R3 御中', nm('〒000-0012 東京都千代田区見本1-2 株式会社みほん商事 御中'), ['株式会社みほん商事', '御中', false]);
eq('R3 宛', nm('〒000-0012 東京都千代田区見本1-2 みほん係 宛'), ['みほん係', '宛', false]);
const r3n = one('〒000-0012 東京都架空区見本町1-2-3 山田花子');
eq('R3 name in building check', r3n.checks.some(c => c.f === 'building' && /名前かもしれません/.test(c.msg)), true);
eq('R4 12-5-203', nb('見本町12-5-203'), ['見本町', '', '12', '5', '203']);
eq('R4 room check', one('東京都千代田区見本町12-5-203').checks.some(c => c.f === 'building'), true);
eq('R5 番地の', nb('見本町12番地の5'), ['見本町', '', '12', '5', '']);
eq('R6 kanji banchi check', one('東京都千代田区見本二十三丁目一番地みほんビル').checks.some(c => c.f === 'building'), true);
eq('R7 two people no blank', one('〒000-0001 東京都千代田区見本1-2 山田様\n〒000-0002 大阪府大阪市北区見本3-4 佐藤様').checks.some(c => /2回以上/.test(c.msg)), true);
eq('R8 missing cp', AS.missing('clickpost', { zip: '000-0001', name: '', cp1: '' }), ['氏名', '住所1行目']);
eq('R8 missing yp', AS.missing('yupack', { zip: '', name: '山田', ycity: '千代田区' }), ['郵便番号']);
eq('R12 pref fill intact', AS.cpIntact(one('町田市原町田1-2-3 山田様')), true);
eq('R12 room intact', AS.cpIntact(one('東京都千代田区見本町1-2-3-203 山田様')), true);
eq('R13 wave sep', nb('見本町1〜2〜3'), ['見本町', '1', '2', '3', '']);
eq('R14 yaddr zen', fv(one('〒000-0001 東京都千代田区見本町3丁目1-2 山田様'), 'yamato').yaddr, '東京都千代田区見本町３丁目');
eq('R16 cp zip', errs(Object.assign(one('〒000-0001 東京都千代田区見本1-2 山田様'), { zip: '12-34' }), 'clickpost').map(e => e[0]), ['zip']);
eq('R18 sender sum', AS.senderProblems({ name: 'a', zip: '0000001', pref: '東京都', city: '見'.repeat(23) }).length, 1);
const lost = one('〒000-0001 東京都千代田区見本1-2 山田様');
lost.building = ''; lost.rawAddr = '東京都千代田区見本1-2 みほんハイツ';
eq('R1 lost chars detected', AS.cpIntact(lost), false);


// レビュー②の指摘（2026-10-26）
eq('Q1 otsukare', nm('お疲れ様です！\n〒000-0012\n東京都千代田区見本1-2 みほんハイツ101\n山田 花子様'), ['山田 花子', '様', false]);
eq('Q1 otsukare bld', one('お疲れ様です！\n〒000-0012\n東京都千代田区見本1-2 みほんハイツ101\n山田 花子様').building, 'みほんハイツ101');
eq('Q1 otsukaresama guess', one('お疲れさまです\n〒000-0012\n東京都千代田区見本1-2\n山田花子').name, '山田花子');
eq('Q1 minasama', one('皆さま、いつもありがとうございます\n〒000-0012\n東京都千代田区見本1-2\n山田花子様').name, '山田花子');
eq('Q1 near addr', one('山田様、ありがとうございます\n〒000-0012\n東京都千代田区見本1-2\n佐藤花子様').name, '佐藤花子');
eq('Q2 masuda', one('〒000-0012\n東京都千代田区見本1-2\nコーポますだ101\n山田花子様').building, 'コーポますだ101');
eq('Q2 desu', one('〒000-0012\n東京都千代田区見本1-2\nみほんハイツ101号室です。\n山田花子様').building, 'みほんハイツ101号室');
eq('Q2 made', one('〒000-0012\n東京都千代田区見本1-2\nみほんハイツ101までお願いします\n山田花子様').building, 'みほんハイツ101');
const memo = t => one('〒000-0012\n東京都千代田区見本1-2 みほんハイツ101\n山田 花子様\n' + t);
eq('Q3 fuzai', memo('日中は不在がちです').building, 'みほんハイツ101');
eq('Q3 insta', memo('インスタ @hanako_mihon').building, 'みほんハイツ101');
eq('Q3 mail', memo('hanako@example.com').building, 'みほんハイツ101');
eq('Q3 item', memo('ピアス 1点').building, 'みほんハイツ101');
eq('Q3 item check', shown(memo('ピアス 1点'), /ピアス/), true);
eq('Q3 okihai', memo('置き配希望').building, 'みほんハイツ101');
eq('Q3 spaced tel', one('〒000-0012\n東京都千代田区見本1-2\n携帯 090 0000 1234\n山田様').building, '');
eq('Q3 joined check', one('〒000-0012\n東京都架空区見本町3丁目\n12-5\n山田 花子様').checks.some(c => /続きとしてつなぎました/.test(c.msg)), true);
eq('Q4 yoroshiku', one('〒000-0012\n東京都千代田区見本1-2\n山田 花子\n宜しくです').name, '山田 花子');
eq('Q4 ijou', one('〒000-0012\n東京都千代田区見本1-2\n山田 花子\n以上').name, '山田 花子');
eq('Q4 form', one('住所\n東京都千代田区見本1-2\n電話番号\n090-0000-1234\n名前\n山田花子').name, '山田花子');
eq('Q6 katakana bld', [one('〒000-0012 東京都千代田区見本1-2 サンシャイン 山田様').name, one('〒000-0012 東京都千代田区見本1-2 サンシャイン 山田様').building], ['山田', 'サンシャイン']);
eq('Q7 sama ate', nm('〒000-0012 東京都千代田区見本1-2 山田花子様宛'), ['山田花子', '宛', false]);
eq('Q8 label sama de', one('宛名は山田花子様で\n〒000-0012\n東京都千代田区見本1-2').name, '山田花子');
const r10 = one('〒000-0012 東京都千代田区' + 'み'.repeat(19) + '12-5 山田様');
eq('Q10 no hyphen split', AS.cpLines(r10).every(l => !/^-/.test(l)), true);
eq('Q10 intact', AS.cpIntact(r10), true);
eq('Q11 7digit no dup warn', one('〒000-0012 東京都千代田区見本1-2 みほんビル1234567 山田様').checks.some(c => /2回以上/.test(c.msg)), false);


// レビュー③の指摘（2026-10-26）
const t1 = one('みほん工房様\nこんにちは！\n〒000-0012\n東京都千代田区見本1-2 みほんハイツ101\n山田花子です');
eq('T1 shop sama', [t1.name, has(t1, /名前/)], ['山田花子', true]);
eq('T1 sakka', one('作家様、こんにちは\n〒000-0012\n東京都千代田区見本1-2\n山田花子です').name, '山田花子');
eq('T1 tantou', one('ご担当者様\n〒000-0012\n東京都千代田区見本1-2\n山田花子').name, '山田花子');
eq('T1 okage', one('おかげさまで無事届きました\n〒000-0012\n東京都千代田区見本1-2\n山田花子').name, '山田花子');
eq('T1 otagai', one('お互い様です\n〒000-0012\n東京都千代田区見本1-2\n山田花子').name, '山田花子');
const t1b = one('〒000-0012\n東京都千代田区見本1-2\n山田花子\nご馳走様でした');
eq('T1 gochisou', t1b.name, '山田花子');
const t1c = one('〒000-0012\n東京都千代田区見本1-2\n山田花子\nみほん屋様、よろしくお願いします');
eq('T1 other cand check', has(t1c, /名前/), true);
eq('T1 mina name', one('〒000-0012 東京都千代田区見本1-2 山田 みな様').name, '山田 みな');
const t2 = r => [r.building, has(r, /どの欄にも入れていない|つなぎました/)];
eq('T2 samakata', t2(one('東京都千代田区見本1-2\n佐藤様方\n山田花子様')), ['佐藤様方', true]);
eq('T2 company', t2(one('東京都千代田区見本1-2\n株式会社みほん 総務部\n山田花子様')), ['株式会社みほん 総務部', true]);
const t2c = one('東京都千代田区見本1-2\nルミエール見本\n山田花子様');
eq('T2 nodigit bld reported', has(t2c, /どの欄にも入れていない文字があります: 「ルミエール見本」/), true);
const t2d = one('東京都千代田区見本1-2\nパークサイド見本\n101号室\n山田花子様');
eq('T2 both reported', has(t2d, /ルミエール|パークサイド見本/) && has(t2d, /101号室/), true);
eq('T2 three lines', one('東京都千代田区\n見本町\n1-2-3\nみほんハイツ\n山田花子様').building, 'みほんハイツ');
const mAbove = t => one('山田花子です\n〒000-0012\n東京都千代田区見本1-2 みほんハイツ101\n' + t);
eq('M1 item above', [mAbove('ピアス 1点お願いします').building, shown(mAbove('ピアス 1点お願いします'), /ピアス/)], ['みほんハイツ101', true]);
eq('M1 date', mAbove('11月3日までに届くと嬉しいです').building, 'みほんハイツ101');
eq('M1 time', mAbove('時間指定 14-16時希望').building, 'みほんハイツ101');
eq('M2 same line yoroshiku', one('〒000-0012\n東京都千代田区見本1-2 みほんハイツ101 よろしくお願いします\n山田花子').building, 'みほんハイツ101');
eq('M2 desu', one('住所は東京都千代田区見本1-2 みほんハイツ101です').building, 'みほんハイツ101');
eq('M2 desu only', one('〒000-0012\n東京都千代田区見本1-2です\n山田花子様').building, '');
const m2m = one('〒000-0012 東京都千代田区見本1-2 みほんハイツ101 不在時は置き配で\n山田花子');
eq('M2 memo check', has(m2m, /メモの言葉/), true);
eq('M3 ninarimasu', one('〒000-0012\n東京都千代田区見本1-2\nみほんハイツ101号室になります\n山田花子様').building, 'みほんハイツ101号室');
eq('M3 nionegai', one('〒000-0012\n東京都千代田区見本1-2\nみほんハイツ101にお願いします\n山田花子様').building, 'みほんハイツ101');
eq('M3 moji', one('〒000-0012\n東京都千代田区見本1-2\n文字化けしてたらすみません\n山田花子様').building, '');
const m4 = one('東京都千代田区見本町3丁目です\n12-5です\n山田花子様');
eq('M4 desu banchi', [m4.chome, m4.banchi, m4.go, m4.building], ['3', '12', '5', '']);
const m5 = one('東京都千代田区見本1-2\n〒000-0012\n3階\n山田花子様');
eq('M5 no contradiction', [m5.building, has(m5, /どの欄にも入れていない/)], ['3階', false]);
eq('L2 3F', one('〒000-0012\n東京都千代田区見本1-2\n3F\n山田様').building, '3F');
eq('L2 A-101', one('〒000-0012\n東京都千代田区見本1-2 みほんハイツ\nA-101\n山田様').building, 'みほんハイツ A-101');


// レビュー④の指摘（2026-10-26）
const noThrow = t => { try { AS.parse(t); return true; } catch (e) { return false; } };
eq('U1 no throw', ['山田花子様 東京都新宿区見本2-8-1', '〒000-0023 山田花子様 東京都新宿区見本2-8-1', '山田花子宛 東京都新宿区見本2-8-1', '名前：山田花子 東京都新宿区見本2-8-1', 'お名前は山田花子です 〒000-0023 東京都新宿区見本2-8-1'].map(noThrow), [true, true, true, true, true]);
const u1 = one('山田花子様 東京都新宿区見本2-8-1');
eq('U1 name before pref', [u1.name, u1.pref, u1.city, u1.banchi], ['山田花子', '東京都', '新宿区', '8']);
const u1b = one('名前：山田花子 東京都新宿区見本2-8-1');
eq('U1 label before pref', [u1b.name, u1b.pref, u1b.city], ['山田花子', '東京都', '新宿区']);
const u2 = t => one('東京都新宿区見本2-8-1\n' + t);
eq('U2 bld before name', [u2('サンプルハイツ203 山田花子様').building, u2('サンプルハイツ203 山田花子様').name], ['サンプルハイツ203', '山田花子']);
eq('U2 samakata before name', u2('佐藤様方 山田花子様').building, '佐藤様方');
eq('U2 company before name', u2('株式会社みほん 山田様').building, '株式会社みほん');
eq('U2 bld+company', u2('みほんビル5F 株式会社みほん 山田様').building, 'みほんビル5F 株式会社みほん');
const rep = (t, w) => has(one('〒000-0012\n東京都千代田区見本1-2\n' + t + '\n山田花子様'), new RegExp(w));
eq('U3 made onegai', rep('パークサイド南館までお願いします', 'パークサイド南館'), true);
eq('U3 ate de', rep('セントラルスクエア宛てでお願いします', 'セントラルスクエア'), true);
eq('U3 kata', one('〒000-0012\n東京都千代田区見本1-2\n田中方でお願いします\n山田花子様').building, '田中方');
eq('U3 jusho tsuduki', rep('住所の続き ルミエール見本台', 'ルミエール見本台'), true);
eq('U3 todokete', rep('ルミエール見本台に届けてください', 'ルミエール見本台'), true);
eq('U3 shoten', one('〒000-0012\n東京都千代田区見本1-2\n田中商店に届けてください\n山田花子様').building + '|' + rep('田中商店に届けてください', '田中商店'), '|true');
eq('U3 card1 greeting not reported', has(one(AS.SAMPLE_ONE), /どの欄にも入れていない/), false);
const v1 = t => has(one(t), /どの欄にも入れていない/);
eq('V1 line before addr', v1('株式会社みほん 総務部\n〒000-0012\n東京都千代田区見本1-2\n山田花子様'), true);
eq('V1 bld before addr', v1('サンプルハイツ203号室\n東京都千代田区見本1-2\n山田花子様'), true);
eq('V1 same line before pref', v1('株式会社みほん 東京都新宿区見本1-2 山田様'), true);
const v2 = one('〒000-0012\n東京都千代田区見本1-2\n090-0000-1234 サンプルハイツ203\n山田様');
eq('V2 tel line rest', [v2.tel, v2.building], ['090-0000-1234', 'サンプルハイツ203']);
eq('V3 dropped block', AS.parse('〒000-0001 東京都千代田区見本1-2 山田様\n\n鈴木一郎様 見本区見本1-1-1\n\n〒000-0002 大阪府大阪市北区見本3-4 佐藤様').dropped, 1);
eq('V4 kibougaoka', one('〒000-0012\n神奈川県横浜市旭区\n希望が丘1-2-3\n山田様').town, '希望が丘');
eq('V4 maruyama', one('〒000-0012\n東京都渋谷区\n円山町5-3\n山田様').town, '円山町');
eq('V5 label with bld', has(one('名前：山田花子 サンプルハイツ203\n〒000-0012\n東京都千代田区見本1-2'), /名前の欄|どの欄にも入れていない|つなぎました/), true);
eq('V5 label name only', one('名前：山田花子 サンプルハイツ203\n〒000-0012\n東京都千代田区見本1-2').name, '山田花子');
const v6 = one('〒000-0012\n東京都中央区銀座1-2-3\n北海道ビル4F\n山田様');
eq('V6 pref in bld', [v6.building, has(v6, /2回以上/)], ['北海道ビル4F', false]);
eq('W1 ate ni', has(one('〒000-0012\n東京都千代田区見本1-2\nスカイ壱番館 宛にお願いします\n山田花子'), /スカイ壱番館/), true);


// レビュー⑤の指摘（2026-10-26）
const x1 = one('ご注文番号 1234567\n〒000-0012\n東京都千代田区見本1-2\n山田花子様');
eq('X1 order no before zip', [x1.zip, shown(x1, /1234567/)], ['000-0012', true]);
const x1b = one('注文番号：1234567です\n東京都千代田区見本1-2\n山田花子様');
eq('X1 order no not zip', [x1b.zip, has(x1b, /郵便番号が見つかりません/), shown(x1b, /1234567/)], ['', true, true]);
const x2 = t => one('〒000-0012\n東京都千代田区見本1-2\n' + t);
eq('X2 greet+name', x2('よろしくお願いします。山田花子').name, '山田花子');
eq('X2 todokesaki label', one('お届け先：山田花子様\n〒000-0012\n東京都千代田区見本1-2').name, '山田花子');
eq('X2 osewa shown', shown(x2('お世話になっております、みほん商事の山田です\n佐藤花子様'), /みほん商事/), true);
eq('X2 fuzai shown', shown(x2('日中不在のため宅配ボックスに入れてください\n佐藤花子様'), /宅配ボックス/), true);
eq('X2 haha shown', shown(x2('届け先は母の家です\n佐藤花子様'), /母の家/), true);
eq('X2 kenmei shown', shown(x2('件名：ピアス\n佐藤花子様'), /ピアス/), true);
eq('X2 tel label name', x2('電話 090-0000-1234 山田花子').name, '山田花子');
eq('X2 tel ha name', x2('電話は090-0000-1234です 山田').name, '山田');
eq('X3 okurisaki', one('送り先: 山田花子様\n〒000-0012\n東京都千代田区見本1-2').name, '山田花子');
eq('X3 atesaki', one('〒000-0012\n東京都千代田区見本1-2\n宛先 山田花子様').name, '山田花子');
const yy1 = AS.parse('先日は大阪府のイベントでありがとうございました！\n\n〒000-0012\n東京都千代田区見本1-2\n山田花子様');
eq('Y1 greeting block not a row', [yy1.rows.length, yy1.dropped], [1, 1]);
const yy2 = AS.parse('〒000-0012\n東京都千代田区見本1-2\n\n山田花子');
eq('Y2 dropped head shown', [yy2.dropped, yy2.droppedHeads[0]], [1, '山田花子']);
const yy3 = one('郵便番号：000-0012\n住所：東京都千代田区見本1-2\n名前：山田花子\n電話：090-0000-1234');
eq('Y3 clean form', [yy3.zip, yy3.name, yy3.tel, has(yy3, /どの欄にも入れていない/)], ['000-0012', '山田花子', '090-0000-1234', false]);
eq('Y3 zip ha desu', has(one('郵便番号は000-0012です\n東京都千代田区見本1-2\n山田花子様'), /どの欄にも入れていない/), false);
eq('Y4 name+tel', one('〒000-0012\n東京都千代田区見本1-2\n山田花子 090-0000-1234').name, '山田花子');
eq('Z1 paren yomi', one('〒000-0012\n東京都千代田区見本1-2\n山田花子(やまだはなこ)様').name, '山田花子');
eq('Z2 san ate', one('〒000-0012\n東京都千代田区見本1-2\n山田花子さん宛てでお願いします').name, '山田花子');
eq('Z card1 still clean', [has(one(AS.SAMPLE_ONE), /どの欄にも入れていない/), one(AS.SAMPLE_ONE).checks.map(c => c.f)], [false, ['name', 'city']]);


// レビュー⑥の指摘（2026-10-26）
const conf = (r, re) => has(r, re);   // 確認の文に出る（折りたたみではない）
const a1 = one('名前：山田花子\n〒000-0012\n東京都千代田区見本1-2\nシティ見本でお願いします');
eq('A1 city mihon confirm', [conf(a1, /シティ見本/), (a1.skimmed || []).length], [true, 0]);
const a1b = one('名前：山田花子\n〒000-0012\n東京都千代田区\n見本台でお願いします');
eq('A1 town confirm', [conf(a1b, /見本台/), conf(a1b, /町名の欄に全部入れています/)], [true, false]);
eq('A1 honor after', conf(one('〒000-0012\n東京都千代田区見本1-2\nシティ見本でお願いします\n山田花子様'), /シティ見本/), true);
eq('A1 pre yoroshiku', conf(one('アルカ見本 よろしくお願いします\n〒000-0012\n東京都千代田区見本1-2\n山田花子様'), /アルカ見本/), true);
eq('A1 touwa', conf(one('〒000-0012\n東京都千代田区見本1-2\n藤和見本でお願いします\n山田花子様'), /藤和見本/), true);
const a2 = one('1234567の件です\n東京都千代田区見本1-2 000-0012\n山田花子様');
eq('A2 zip near addr', [a2.zip, conf(a2, /7桁の数字が2つ以上/)], ['000-0012', true]);
const a2b = one('ご注文番号\n1234567\n郵便番号：000-0012\n東京都千代田区見本1-2\n山田花子様');
eq('A2 label wins', [a2b.zip, conf(a2b, /7桁の数字が2つ以上/)], ['000-0012', true]);
const a2c = one('東京都千代田区見本1-2 山田花子様 1234567 〒000-0012');
eq('A2 7digit in bld', [a2c.zip, conf(a2c, /7桁/)], ['000-0012', true]);
const b1 = AS.parse('〒000-0012\n東京都千代田区見本1-2\n\nサンプルハイツ203号室\n山田花子様');
eq('B1 dropped all lines', b1.droppedHeads[0], 'サンプルハイツ203号室 / 山田花子様');
eq('B2 dest not skimmed', conf(one('山田です。よろしくお願いします\n〒000-0012\n東京都千代田区見本1-2\n佐藤様方\n届け先は田中です'), /田中/), true);
const b4 = one('作家様\nこんにちは😊\n購入させていただきました！\n〒000-0012 東京都千代田区見本1-2-3 グリーンコート101\n山田花子 宛\nお届け楽しみにしてます🌸');
eq('B4 noisy dm', [b4.name, conf(b4, /作家様|購入させて|楽しみ/)], ['山田花子', false]);
eq('B4 emoji not name', one('ありがとうございます🙇‍♀️✨\n〒000-0012\n東京都千代田区見本1-2\n山田花子').name, '山田花子');
eq('C1 de', one('〒000-0012\n東京都千代田区見本1-2\n山田花子でお願いします').name, '山田花子');
eq('C1 atede', one('〒000-0012\n東京都千代田区見本1-2\n鈴木一郎宛てでお願いします').name, '鈴木一郎');
eq('C2 empty paren', one('東京都千代田区見本1-2(000-0012)\n山田花子様').building, '');

// S14 iOSの判定（実在のUA）
const UA = {
  iphoneSafari: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1',
  iphoneChrome: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/138.0.7204.156 Mobile/15E148 Safari/604.1',
  ipadOS: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15',
  winChrome: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
  android: 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36'
};
eq('S14 ios', [AS.isIOS(UA.iphoneSafari, 5), AS.isIOS(UA.iphoneChrome, 5), AS.isIOS(UA.ipadOS, 5), AS.isIOS(UA.ipadOS, 0), AS.isIOS(UA.winChrome, 0), AS.isIOS(UA.android, 5)],
  [true, true, true, false, false, false]);

console.log('pass', pass, 'fail', fail);
process.exitCode = fail ? 1 : 0;
