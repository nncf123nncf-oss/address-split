// 住所ばらしの処理本体。index.html の <script id="core"> に埋め込んで使う（build.py が組み立てる）
// 画面には触らない。node からも読み込めるようにしてある（source/core-test.js）
var AS = (function () {
  'use strict';

  // ---- 市区町村の一覧（総務省「全国地方公共団体コード」令和6年1月1日現在。build.py が埋め込む）----
  var MUNI_RAW = '/*MUNI*/';
  var PREFS = [];
  var MUNI = {};      // 都道府県 → 市区町村名の配列（照合用の形）
  var MUNI_ORIG = {}; // 照合用の形 → 元の表記
  var MUNI_OWNER = {}; // 市区町村名 → 都道府県（同じ名前が2つ以上あれば null）
  function keyOf(s) { return s.replace(/[ヶヵケ]/g, 'ケ'); }
  MUNI_RAW.split(';').forEach(function (chunk) {
    var p = chunk.split('|'), pref = p[0];
    if (!pref || pref === '/*MUNI*/') return;
    PREFS.push(pref);
    MUNI[pref] = [];
    (p[1] || '').split(',').forEach(function (name) {
      if (!name) return;
      var k = keyOf(name);
      MUNI[pref].push(k);
      MUNI_ORIG[pref + '|' + k] = name;
      MUNI_OWNER[k] = Object.prototype.hasOwnProperty.call(MUNI_OWNER, k) ? null : pref;
    });
    MUNI[pref].sort(function (a, b) { return b.length - a.length; });
  });
  if (!PREFS.length) {
    PREFS = '北海道,青森県,岩手県,宮城県,秋田県,山形県,福島県,茨城県,栃木県,群馬県,埼玉県,千葉県,東京都,神奈川県,新潟県,富山県,石川県,福井県,山梨県,長野県,岐阜県,静岡県,愛知県,三重県,滋賀県,京都府,大阪府,兵庫県,奈良県,和歌山県,鳥取県,島根県,岡山県,広島県,山口県,徳島県,香川県,愛媛県,高知県,福岡県,佐賀県,長崎県,熊本県,大分県,宮崎県,鹿児島県,沖縄県'.split(',');
  }
  var PREF_RE = new RegExp('(' + PREFS.slice().sort(function (a, b) { return b.length - a.length; }).join('|') + ')');

  var MAX_INPUT = 5000, MAX_ROWS = 40, MAX_FIELD = 100;

  // ---- 文字の寄せ ----
  // 全角英数・記号を半角に、半角カナを全角に（NFKC）。ダッシュ類は数字の間だけハイフンにする
  function norm(s) {
    s = String(s == null ? '' : s);
    try { s = s.normalize('NFKC'); } catch (e) { /* 古い環境ではそのまま */ }
    s = s.replace(/\r\n?/g, '\n').replace(/　/g, ' ').replace(/[ \t]+/g, ' ');
    s = s.replace(/(\d)\s*[‐‑‒–—―−ーｰ─━〜~-]\s*(?=\d)/g, '$1-');
    return s;
  }
  // 全角1・半角0.5で数える（クリックポストの「全角20字・半角40字」用）
  function width(s) {
    var w = 0;
    for (var i = 0; i < s.length; i++) {
      var c = s.charCodeAt(i);
      if (c >= 0xD800 && c <= 0xDBFF) { w += 1; i++; continue; }
      w += (c <= 0x7E || (c >= 0xFF61 && c <= 0xFF9F)) ? 0.5 : 1;
    }
    return w;
  }
  function chars(s) { return Array.from(String(s)).length; }
  // 半角英数・記号を全角に（ゆうパックプリント・ヤマトの全角の欄用）
  function toZen(s) {
    return String(s).replace(/[!-~]/g, function (c) { return c === '-' ? '－' : String.fromCharCode(c.charCodeAt(0) + 0xFEE0); })
      .replace(/ /g, '　');
  }
  var KANSUJI = { '〇': 0, '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6, '七': 7, '八': 8, '九': 9 };
  function kanToNum(k) {
    if (/^\d+$/.test(k)) return k;
    var m = /^([二三四五六七八九])?十([一二三四五六七八九])?$/.exec(k);
    if (m) return String((m[1] ? KANSUJI[m[1]] : 1) * 10 + (m[2] ? KANSUJI[m[2]] : 0));
    if (/^[〇一二三四五六七八九]$/.test(k)) return String(KANSUJI[k]);
    return null;
  }

  // ---- 1件の区切り ----
  var ZIP_RE = /〒?\s*(?<![\d-])(\d{3})-?(\d{4})(?![\d-])/;
  var TEL_RE = /(?<![\d-])(0\d{1,4}-?\d{1,4}-?\d{3,4})(?![\d-])/g;
  function splitBlocks(text) {
    var t = norm(String(text || '').slice(0, MAX_INPUT));
    var blocks = t.split(/\n\s*\n/).map(function (b) { return b.trim(); }).filter(Boolean);
    var out = [];
    blocks.forEach(function (b) {
      if (PREF_RE.test(b) || ZIP_RE.test(maskTel(b)) || b.split('\n').some(muniStart)) out.push(b);
    });
    return { blocks: out.slice(0, MAX_ROWS), over: Math.max(0, out.length - MAX_ROWS) };
  }
  function maskTel(s) {
    return s.replace(TEL_RE, function (m) {
      var d = m.replace(/-/g, '');
      return (d.length === 10 || d.length === 11) ? m.replace(/./g, '#') : m;
    });
  }
  function findTel(s) {
    var m, re = new RegExp(TEL_RE.source, 'g');
    while ((m = re.exec(s))) {
      var d = m[1].replace(/-/g, '');
      if (d.length === 10 || d.length === 11) return m[1];
    }
    return '';
  }

  // ---- 市区町村 ----
  function matchMuni(pref, s) {
    var k = keyOf(s), list = MUNI[pref] || [];
    for (var i = 0; i < list.length; i++) {
      if (k.lastIndexOf(list[i], 0) === 0) return { name: s.slice(0, list[i].length), listed: true };
    }
    // 郡＋町村
    var g = /^([^\s\d]{1,5}?郡)/.exec(s);
    if (g) {
      var rest = keyOf(s.slice(g[1].length));
      for (var j = 0; j < list.length; j++) {
        if (/[町村]$/.test(list[j]) && rest.lastIndexOf(list[j], 0) === 0) return { name: s.slice(0, g[1].length + list[j].length), listed: true };
      }
    }
    return null;
  }
  function guessMuni(s) {
    var m = /^([^\s\d]{1,5}?郡[^\s\d]{1,5}?[町村])/.exec(s) ||
      /^([^\s\d]{1,6}?市[^\s\d]{1,4}?区)(?=[^\s\d]*\d|\s|$)/.exec(s) ||
      /^([^\s\d]{1,6}?[市区町村])/.exec(s);
    return m ? { name: m[1], listed: false } : null;
  }
  // 行が市区町村名で始まるか（同じ名前が複数の都道府県にあっても true）
  function muniStart(line) {
    var k = keyOf(String(line).trim());
    for (var name in MUNI_OWNER) { if (name.length >= 2 && k.lastIndexOf(name, 0) === 0) return true; }
    return false;
  }
  // 都道府県を書かずに市区町村から始まる住所（一覧で持ち主が1つに決まるときだけ）
  function prefFromMuni(s) {
    var best = null;
    Object.keys(MUNI_OWNER).forEach(function (k) {
      if (MUNI_OWNER[k] && keyOf(s).lastIndexOf(k, 0) === 0 && (!best || k.length > best.length)) best = k;
    });
    return best ? MUNI_OWNER[best] : null;
  }

  // ---- 町名・丁目・番地・号・建物 ----
  var N = '(\\d+|[一二三四五六七八九十〇]+)';
  var NUM_RES = [
    // 3丁目12-5 / 三丁目12番5号 / 3丁目12番地5 / 3丁目12
    { re: new RegExp(N + '丁目\\s*(?:(\\d+)\\s*(?:番地?|-)?\\s*(?:(\\d+)\\s*(?:号(?!室)|-)?)?(?:(\\d+))?)?'), kind: 'chome' },
    // 12番5号 / 12番地5 / 12番地の5 / 12番地
    { re: /(\d+)\s*番地?(?:\s*の)?\s*(?:(\d+)\s*(?:号(?!室))?)?/, kind: 'ban' },
    // 1-2-3-203 / 3-12-5 / 12-5
    { re: /(\d+)-(\d+)(?:-(\d+))?(?:-(\d+))?/, kind: 'hyphen' },
    // 見本町5
    { re: /(\d+)(?:号(?!室))?/, kind: 'bare' }
  ];
  function splitRest(rest, checks) {
    var r = { town: '', chome: '', banchi: '', go: '', building: '', numText: '' };
    var best = null;
    NUM_RES.forEach(function (o) {
      var m = o.re.exec(rest);
      if (!m) return;
      if (m.index > 0 && /\d/.test(rest[m.index - 1])) return;
      if (!best || m.index < best.m.index) best = { m: m, kind: o.kind };
    });
    if (!best) {
      r.town = rest.trim();
      checks.push({ f: 'banchi', msg: '番地が見つかりませんでした。町名の欄に全部入れています' });
      return r;
    }
    var m = best.m, room = '';
    r.town = rest.slice(0, m.index).trim();
    r.numText = m[0].replace(/[\s-]+$/, '').trim();
    var after = rest.slice(m.index + m[0].length);
    if (best.kind === 'chome') {
      r.chome = kanToNum(m[1]) || m[1]; r.banchi = m[2] || ''; r.go = m[3] || '';
      if (m[4]) { room = m[4]; }
    } else if (best.kind === 'ban') {
      r.banchi = m[1]; r.go = m[2] || '';
    } else if (best.kind === 'hyphen') {
      if (m[3] && !m[4] && m[3].length >= 3) {
        // 12-5-203: 3つ目が3桁以上なら部屋番号とみる
        r.banchi = m[1]; r.go = m[2]; room = m[3];
      } else if (m[3]) {
        r.chome = m[1]; r.banchi = m[2]; r.go = m[3];
        checks.push({ f: 'chome', msg: '「' + m[1] + '-' + m[2] + '-' + m[3] + '」の最初の数字を丁目にしました。丁目でなければ直してください' });
        if (m[4]) room = m[4];
      } else { r.banchi = m[1]; r.go = m[2]; }
    } else {
      r.banchi = m[1];
    }
    if (room) {
      // 4つ目の数字は部屋番号として建物の欄へ
      r.numText = r.numText.replace(new RegExp('-?' + room + '$'), '');
      after = room + ' ' + after;
      checks.push({ f: 'building', msg: '「' + room + '」を部屋番号として建物の欄に入れました。違っていれば直してください' });
    }
    r.building = after.replace(/^[\s、,，]+/, '').replace(/\s+/g, ' ').trim();
    if (/^(の\s*\d|[一二三四五六七八九十〇]+\s*(番地?|号)|[〜~]\d)/.test(r.building)) {
      checks.push({ f: 'building', msg: '建物の欄が「' + r.building.slice(0, 6) + '」で始まっています。番地や号の続きなら直してください' });
    }
    return r;
  }

  // ---- 氏名 ----
  // 挨拶・決まり文句（名前の候補から外す。住所の続きの行の判定には使わない）
  var GREET = /(こんにちは|こんばんは|おはよう|ありがとう|お願い|よろしく|宜しく|ください|お世話|失礼|申し訳|すみません|はじめまして|初めまして|送って|届け|購入|注文|件|です。|します|ました|ません|ます[。!！]?$|住所|電話|発送|下さい|お疲れ|以上|了解|承知)/;
  var LABEL_ONLY = /^(お?名前|氏名|宛名|ご?住所|電話番号?|携帯|郵便番号|メール(アドレス)?|以上|宜しく|よろしく|了解|承知しました)[:：]?$/;
  var BUILD_WORD = /(マンション|ハイツ|ビル|アパート|コーポ|レジデンス|タワー|荘|号室|メゾン|ハウス|パレス|ヒルズ|テラス|コート|団地|ハイム|シャトー|カーサ|グラン|ドミール|プラザ|ガーデン|フラット|寮|棟)/;
  var ADDR_TAIL = /(市|区|町|村|郡|丁目|番地)$|^字|[町村]字/;
  // 宛先の一部になる語（「佐藤様方」「株式会社みほん 総務部」など）
  var ORG_WORD = /(様方|気付|株式会社|有限会社|合同会社|\(株\)|\(有\)|事務所|[部課]$)/;
  // 敬称の直前がこれで終わるときは敬称とみない（「お疲れ様です」「皆さま」「お客様」「みほん工房様（お店宛て）」「おかげさまで」）
  var NOT_NAME_TAIL = /((^|[、,。!！])(皆|みな|みんな)|お疲れ|ご苦労|お世話|お客|ありがとう|奥|ご主人|お子|作家|担当者?|工房|ショップ|ストア|店|おかげ|お陰|お互い|ご馳走|ごちそう)$/;
  // 挨拶の語尾（住所の行・続きの行の末尾から落とす）
  var POLITE_TAIL = /\s*(です|になります|にお願いします|でお願いします|でお願い致します|でお願いいたします|までお願いします|宛てでお願いします|宛にお願いします|へお願いします|よろしくお願いします|宜しくお願いします|よろしくお願い致します|お願いします|まで)[。!！]*$/;
  // 住所の続きではなくメモらしい言葉
  var MEMO_WORD = /(希望|指定|までに|\d+\s*(点|個|枚|箱)|円|\d+月|\d+日|\d+時|お願い|嬉し|ください|下さい|不在|置き配|宜しく|よろしく)/;
  function stripHonorTail(s) { return s.replace(/(様|さま|殿)$/, '').trim(); }
  // 名前の候補になる短い行（住所・郵便番号・電話・挨拶・ラベルを除く）
  function guessCands(lines, addrLine) {
    var cands = [];
    lines.forEach(function (L, k) {
      if (k === addrLine) return;
      var c = L.replace(/^(私は|わたしは)/, '').replace(/(です|と申します|まで|宛てでお願いします)[。!！]*$/, '').trim();
      if (!c || /\d|〒|#|@/.test(c) || PREF_RE.test(c) || GREET.test(c) || LABEL_ONLY.test(c) || /[、。!！?？]/.test(c) || BUILD_WORD.test(c) || ADDR_TAIL.test(c) || ORG_WORD.test(c) || NOT_NAME_TAIL.test(c.replace(/(様|さま)$/, ''))) return;
      var n = chars(c.replace(/ /g, ''));
      if (n >= 2 && n <= 10) cands.push({ c: c, k: k });
    });
    cands.sort(function (a, b) { return chars(a.c) - chars(b.c); });
    return cands;
  }
  function findName(lines, addrLine) {
    var honor = '', name = '', how = '', at = -1, note = '';
    // 1) 「様」「さま」「宛」「殿」「御中」の直前。後ろが区切り（行末・空白・句読点など）のものだけを敬称とみる
    //    （「御殿場市」「様似町」「殿町」の字を敬称と取り違えないため）。「様方」は飛ばし、行の中では最後の敬称を使う。
    //    敬称のある行が複数あれば、住所の行に近い行を使う（「山田様、ありがとうございます」の書き出しより宛名の行を優先）
    var found = [];
    lines.forEach(function (L, i) {
      var re = /(様方|様|さま|宛て?|殿|御中)(?=$|[\s、。,!！.]|です|へ|まで|で|に)/g, hm, cand = null;
      while ((hm = re.exec(L))) {
        if (hm[1] === '様方') continue;
        if (NOT_NAME_TAIL.test(L.slice(0, hm.index))) continue;
        cand = { index: hm.index, word: hm[1] };
      }
      if (!cand) return;
      var before = L.slice(0, cand.index).replace(/[\s:：]+$/, '');
      var toks = before.split(' ');
      var picked = [], lim = cand.word === '御中' ? 20 : 6;
      for (var t = toks.length - 1; t >= 0 && picked.length < 2; t--) {
        var tk = toks[t];
        if (!tk || /\d/.test(tk) || chars(tk) > lim || (cand.word !== '御中' && BUILD_WORD.test(tk)) || PREF_RE.test(tk) || /様方$/.test(tk) || GREET.test(tk)) break;
        // 住所と同じ行で2語目を足すとき、カタカナだけの語・長い語は建物名かもしれないので足さない
        if (picked.length === 1 && i === addrLine && (/^[ァ-ヶー・]+$/.test(tk) || chars(tk) >= 5)) break;
        picked.unshift(tk);
        if (cand.word === '御中') break;
      }
      if (picked.length) found.push({ i: i, cand: cand, name: picked.join(' '), L: L });
    });
    if (found.length) {
      var dist = function (f) { return addrLine < 0 ? f.i : Math.abs(f.i - addrLine); };
      found.sort(function (a, b) { return dist(a) - dist(b) || b.i - a.i; });
      var f0 = found[0];
      name = stripHonorTail(f0.name);
      honor = f0.cand.word === '御中' ? '御中' : f0.cand.word === '殿' ? '殿' : /^宛/.test(f0.cand.word) ? '宛' : '様';
      how = 'honor'; at = f0.i;
      var rest = (f0.L.slice(0, f0.L.lastIndexOf(f0.name, f0.cand.index)) + ' ' + f0.L.slice(f0.cand.index + f0.cand.word.length)).trim();
      lines[at] = rest;
      // 敬称で決めても、ほかに名前の候補があるとき・住所から離れているとき・同じ行に挨拶が残るときは確かめてもらう
      var others = guessCands(lines, addrLine).filter(function (c) { return c.k !== at; });
      if (found.length > 1) note = '「様」などの付いた名前が2か所以上ありました。「' + name + '」を入れています';
      else if (others.length) note = '「' + name + '」を名前にしました。ほかに「' + others[0].c + '」も名前かもしれません';
      else if (addrLine >= 0 && dist(f0) > 2) note = '「' + name + '」は住所から離れた行にありました。お届け先の名前か確認してください';
      else if (at !== addrLine && GREET.test(rest)) note = '「' + name + '」は挨拶の行にありました。お届け先の名前か確認してください';
    }
    // 2) 「名前:」「氏名：」「お名前は」／「名前」だけの行の次の行
    if (!name) {
      for (var j = 0; j < lines.length; j++) {
        var lm = /(?:お?名前|氏名|宛名)\s*(?:[:：]|は)\s*(.+)$/.exec(lines[j]);
        var val = lm ? lm[1] : (/^(お?名前|氏名|宛名)[:：]?$/.test(lines[j]) && lines[j + 1] && !/\d/.test(lines[j + 1]) ? lines[j + 1] : '');
        if (!val) continue;
        name = stripHonorTail(val.replace(/(様|さま|殿)?\s*(で|に)?\s*(お願いします|お願い致します|お願いいたします|です|と申します)?[。!！]*$/, '').trim());
        if (!name) continue;
        how = 'label'; at = lm ? j : j + 1; lines[j] = ''; if (!lm) lines[j + 1] = '';
        break;
      }
    }
    // 3) 住所・郵便番号・電話を除いた短い行（候補。必ず確認）
    if (!name) {
      var cands = guessCands(lines, addrLine);
      if (cands.length) { name = cands[0].c; how = 'guess'; at = cands[0].k; lines[at] = ''; }
    }
    return { name: name.slice(0, MAX_FIELD), honor: honor || '様', how: how, line: at, note: note };
  }

  // 住所の続きとしてつなぐ行か。挨拶の語尾は落としてから見る
  // つなぐのは、数字・建物を示す語・号室・棟・階を含む行、市区町村や町名で終わる行、「様方」「株式会社」などの宛先の語を含む行だけ。
  // メモらしい言葉（希望・指定・○点・○月○日など）・メールアドレス・URL・SNSのID・空白区切りの電話番号・英字の行はつながない
  function contLine(L) {
    var s = L.replace(POLITE_TAIL, '').trim();
    if (!s) return null;
    if (/@|https?:|www\.|[\d][\d ]{9,}\d/.test(s)) return null;
    if (/^[A-Za-z0-9 _.\-]+$/.test(s) && /[A-Za-z]/.test(s) && !/^([A-Za-z]{0,2}-?\d+[A-Za-z]?|\d+F)$/i.test(s)) return null;
    if (/[。!！?？]/.test(s) || MEMO_WORD.test(s)) return null;
    if (/\d/.test(s) || BUILD_WORD.test(s) || /(号室|棟|階|[0-9]F)/.test(s) || ADDR_TAIL.test(s) || ORG_WORD.test(s)) return s;
    return null;
  }

  // ---- 1件を部品に分ける ----
  function parseOne(block) {
    var checks = [];
    var p = { zip: '', name: '', honor: '様', pref: '', city: '', town: '', chome: '', banchi: '', go: '', building: '', tel: '', numText: '', rawAddr: '', checks: checks };
    var tel = findTel(block);
    if (tel) p.tel = tel;
    var masked = maskTel(block);
    var zm = ZIP_RE.exec(masked);
    var lines = masked.split('\n').map(function (l) { return l.trim(); });
    // 郵便番号として数えるのは、行頭か「〒」の後ろの7桁だけ（建物名の中の数字を数えない）
    var nZip = (masked.match(/(?:^|〒)\s*\d{3}-?\d{4}(?![\d-])/gm) || []).length;
    var nPref = lines.filter(function (l) { return PREF_RE.test(l); }).length;
    if (zm) p.zip = zm[1] + '-' + zm[2];
    else checks.push({ f: 'zip', msg: '郵便番号が見つかりませんでした' });
    if (nZip > 1 || nPref > 1) checks.push({ f: 'zip', msg: '郵便番号か都道府県が2回以上出てきました。最初の1人分だけを入れています。2人分なら空行で区切ってください' });
    // 住所の行: 都道府県名が出る最初の行。なければ市区町村から始まる行
    var addrLine = -1, start = -1, prefFill = '';
    for (var i = 0; i < lines.length; i++) {
      var pm = PREF_RE.exec(lines[i]);
      if (pm) { addrLine = i; start = pm.index; break; }
    }
    if (addrLine < 0) {
      for (var j = 0; j < lines.length; j++) {
        var s0 = lines[j].replace(/^〒?\s*\d{3}-?\d{4}\s*/, '');
        var owner = prefFromMuni(s0);
        if (owner) { addrLine = j; start = lines[j].length - s0.length; prefFill = owner; break; }
      }
    }
    var nm = findName(lines, addrLine);
    p.name = nm.name; p.honor = nm.honor;
    if (!p.name) checks.push({ f: 'name', msg: '名前が見つかりませんでした' });
    else if (nm.how === 'guess') checks.push({ f: 'name', msg: '「' + p.name + '」を名前として入れました。名前でなければ直してください' });
    else if (nm.note) checks.push({ f: 'name', msg: nm.note });

    if (addrLine < 0) {
      checks.push({ f: 'pref', msg: '都道府県から始まる住所が見つかりませんでした' });
      return finish(p);
    }
    // 住所の文字列: 都道府県から。後ろの行は3行まで、住所の続きらしい行だけをつなぐ（郵便番号だけの行・電話の行は飛ばす）
    // 住所の後ろにあって住所に入れなかった行は、数字の有無にかかわらず確認に出す（挨拶だけの行・名前の行は除く）
    var segs = [lines[addrLine].slice(start).replace(POLITE_TAIL, '')], joined = [], skipped = [], joining = true;
    for (var k = addrLine + 1; k < lines.length; k++) {
      var Lk = lines[k];
      if (k === nm.line && nm.line !== addrLine) { joining = false; continue; }
      if (!Lk) continue;
      if (PREF_RE.test(Lk)) break;
      if (/^〒?\s*\d{3}-?\d{4}$/.test(Lk) || /#{6,}/.test(Lk)) continue;
      if (joining && joined.length < 3) {
        var c = contLine(Lk);
        if (c) { segs.push(c); joined.push(c); continue; }
      }
      joining = false;
      if (GREET.test(Lk) && !/\d/.test(Lk) && !BUILD_WORD.test(Lk) && !ORG_WORD.test(Lk)) continue;
      skipped.push(Lk);
    }
    if (joined.length) checks.push({ f: 'building', msg: '次の行を住所の続きとしてつなぎました: 「' + joined.join('」「') + '」' });
    if (skipped.length) checks.push({ f: 'building', msg: '住所の後ろの行を住所に入れていません: 「' + skipped.slice(0, 3).join('」「') + '」' + (skipped.length > 3 ? ' ほか' + (skipped.length - 3) + '行' : '') + '。住所の一部なら直してください' });
    var addr = segs.join(' ');
    if (zm) { var zi = addr.indexOf(zm[0].trim()); if (zi >= 0) addr = addr.slice(0, zi) + ' ' + addr.slice(zi + zm[0].trim().length); }
    addr = addr.replace(/#+/g, ' ').replace(/(電話|TEL|tel|Tel)[:：]?\s*$/, '');
    addr = addr.replace(/\s+/g, ' ').trim().replace(POLITE_TAIL, '');
    if (prefFill) {
      p.pref = prefFill;
      checks.push({ f: 'pref', msg: '都道府県が書かれていなかったため「' + prefFill + '」を補いました' });
    } else {
      var pm2 = PREF_RE.exec(addr);
      p.pref = pm2[1]; addr = addr.slice(pm2[1].length).trim();
    }
    p.rawAddr = (prefFill ? '' : p.pref) + addr;
    p.prefFilled = !!prefFill;
    var mu = matchMuni(p.pref, addr);
    if (!mu) {
      mu = guessMuni(addr);
      if (mu) checks.push({ f: 'city', msg: '「' + mu.name + '」は市区町村の一覧にない名前です。切れ目を確認してください' });
    }
    if (!mu) {
      checks.push({ f: 'city', msg: '市区町村の切れ目が見つかりませんでした' });
      p.town = addr;
      return finish(p);
    }
    p.city = mu.name;
    var rs = splitRest(addr.slice(mu.name.length).trim(), checks);
    p.town = rs.town; p.chome = rs.chome; p.banchi = rs.banchi; p.go = rs.go; p.building = rs.building; p.numText = rs.numText;
    // 建物の欄にメモらしい言葉が入っていないか
    if (MEMO_WORD.test(p.building.replace(/\d+\s*(号室|階|F)/g, '')) || /(です|ます)$/.test(p.building)) {
      checks.push({ f: 'building', msg: '建物の欄に「' + p.building + '」が入っています。メモの言葉なら消してください' });
    }
    // 名前らしい語が建物の欄の末尾に残っていないか（「様」で終わる・ひらがなと漢字だけの2〜6字）
    var tail = p.building.split(' ').pop();
    if (p.building && (/(様|さま|殿)$/.test(p.building) ||
        (nm.how !== 'honor' && nm.how !== 'label' && (p.building.indexOf(' ') > 0 || p.building === tail) && /^[ぁ-ゖ一-龯々]{2,6}$/.test(tail) && !BUILD_WORD.test(tail) && !ORG_WORD.test(tail)))) {
      checks.push({ f: 'building', msg: '建物の欄の「' + tail + '」は名前かもしれません。名前なら名前の欄へ移してください' });
    }
    return finish(p);
  }
  function finish(p) {
    ['zip', 'name', 'pref', 'city', 'town', 'chome', 'banchi', 'go', 'building', 'tel', 'numText'].forEach(function (k) { p[k] = String(p[k] || '').slice(0, MAX_FIELD); });
    p.sei = ''; p.mei = '';
    var sp = p.name.split(' ');
    if (sp.length === 2) { p.sei = sp[0]; p.mei = sp[1]; }
    else { p.sei = p.name; p.mei = ''; }
    return p;
  }
  function parse(text) {
    var s = splitBlocks(text);
    return { rows: s.blocks.map(parseOne), over: s.over, truncated: String(text || '').length > MAX_INPUT };
  }

  // 丁目・番地・号の表記（手で直した後はここから作り直す）
  function numPart(p) {
    if (p.numText) return p.numText;
    var s = '';
    if (p.chome) s += p.chome + '丁目';
    if (p.banchi) s += p.banchi + (p.go ? '-' + p.go : '');
    return s;
  }

  // ---- 送り方ごとの欄 ----
  // 値の決まり: max（上限）, unit（'w'=全角1半角0.5 / 'c'=文字数）, digits（数字だけ）, zen（全角にして出す）
  function cpLines(p) {
    var segs = [p.pref + p.city, (p.town + numPart(p)).trim(), p.building].filter(Boolean);
    var lines = [];
    segs.forEach(function (s) { wrap(s, 20).forEach(function (x) { lines.push(x); }); });
    return lines;
  }
  function wrap(s, max) {
    var out = [];
    while (width(s) > max) {
      var cut = -1, i, acc = 0, lastFit = 0;
      for (i = 0; i < s.length; i++) {
        acc += width(s[i]);
        if (acc > max) break;
        lastFit = i + 1;
        // 切れ目: 「丁目」の後ろ・空白の前・数字の塊（12-5 など）の前。ハイフンの前では切らない
        if (s.slice(0, i + 1).endsWith('丁目') || s[i + 1] === ' ' || (/\d/.test(s[i + 1] || '') && !/[\d-]/.test(s[i]))) cut = i + 1;
      }
      if (cut <= 0) {
        cut = lastFit;
        // 数字とハイフンの塊の途中なら、塊の手前まで戻す
        var back = cut;
        while (back > 0 && /[\d-]/.test(s[back - 1]) && /[\d-]/.test(s[back] || '')) back--;
        if (back > 0) cut = back;
      }
      out.push(s.slice(0, cut).trim());
      s = s.slice(cut).replace(/^ +/, '');
    }
    if (s) out.push(s);
    return out;
  }
  function stripSp(s) { return String(s).replace(/[\s　]/g, ''); }
  function fields(p, carrier) {
    var f = [];
    if (carrier === 'clickpost') {
      f.push({ key: 'zip', label: '郵便番号', value: p.zip, part: 'zip', zip: true });
      f.push({ key: 'name', label: 'お届け先氏名', value: p.name, part: 'name' });
      f.push({ key: 'honor', label: '敬称', value: p.honor, part: 'honor' });
      var L = cpLines(p);
      var n = Math.max(4, L.length);
      for (var i = 0; i < n; i++) f.push({ key: 'cp' + (i + 1), label: '住所' + (i + 1) + '行目', value: L[i] || '', max: 20, unit: 'w', extra: i >= 4 });
    } else if (carrier === 'yupack') {
      f.push({ key: 'zip', label: '郵便番号', value: p.zip.replace(/-/g, ''), part: 'zip', digits7: true });
      f.push({ key: 'name', label: 'お名前', value: toZen(p.name), part: 'name', max: 25, unit: 'c' });
      f.push({ key: 'honor', label: '敬称', value: p.honor, part: 'honor', honorList: true });
      f.push({ key: 'pref', label: '都道府県', value: p.pref, part: 'pref', max: 5, unit: 'c' });
      f.push({ key: 'ycity', label: '市区町村郡', value: toZen(p.city + p.town), max: 25, unit: 'c', sumWith: 'pref' });
      f.push({ key: 'ynum', label: '丁目番地号', value: toZen(numPart(p)), max: 25, unit: 'c' });
      f.push({ key: 'ybld', label: '建物名・部屋番号など', value: toZen(p.building), part: 'building', max: 25, unit: 'c' });
      f.push({ key: 'tel', label: '電話番号', value: p.tel, part: 'tel', max: 13, unit: 'c' });
    } else {
      f.push({ key: 'zip', label: '郵便番号', value: p.zip, part: 'zip' });
      f.push({ key: 'sei', label: 'お名前（姓）', value: toZen(p.sei), part: 'sei', max: 15, unit: 'c' });
      f.push({ key: 'mei', label: 'お名前（名）', value: toZen(p.mei), part: 'mei', max: 15, unit: 'c' });
      f.push({ key: 'yaddr', label: '住所（町名・丁目まで）', value: toZen(p.pref + p.city + p.town + (p.chome ? p.chome + '丁目' : '')) });
      f.push({ key: 'banchi', label: '番地', value: toZen(p.banchi), part: 'banchi', max: 5, unit: 'c', noHyphen: true });
      f.push({ key: 'go', label: '号', value: toZen(p.go), part: 'go', max: 5, unit: 'c', noHyphen: true });
      f.push({ key: 'ymbld', label: '建物名・部屋番号', value: toZen(p.building), part: 'building', max: 30, unit: 'c' });
      f.push({ key: 'tel', label: '電話番号', value: p.tel, part: 'tel' });
    }
    return f;
  }
  // 欄ごとの決まりの確かめ
  function judge(fl, all) {
    var v = String(fl.value || ''), n = null, err = '';
    if (fl.max) {
      n = fl.unit === 'w' ? width(v) : chars(v);
      if (n > fl.max) err = (n - fl.max) + '字超えています';
    }
    if (fl.sumWith) {
      var other = all.filter(function (x) { return x.key === fl.sumWith; })[0];
      if (other && chars(other.value) + chars(v) > 25) err = err || ('都道府県と合わせて25字を超えています（' + (chars(other.value) + chars(v)) + '字）');
    }
    if (fl.digits7 && v && !/^\d{7}$/.test(v)) err = err || '数字7桁にしてください';
    if (fl.zip && v && !/^\d{3}-?\d{4}$/.test(v)) err = err || '数字7桁にしてください';
    if (fl.noHyphen && /[-－]/.test(v)) err = err || 'ハイフンは使えません';
    if (fl.noHyphen && v && !/^[0-9０-９]+$/.test(v)) err = err || '数字だけにしてください';
    if (fl.honorList && v && ['様', '殿', '御中', '行', '係', '宛'].indexOf(v) < 0) err = err || '様・殿・御中・行・係・宛のどれかにしてください';
    if (fl.extra) err = err || '4行に収まりません';
    return { count: n, err: err };
  }
  // 4行をつなげると元の住所と同じか（字を削っていないか）
  // あわせて、貼った住所の字がどこかの欄に全部入っているか（手で直した後は、4行と部品の比較だけ）
  function sq(s) { return String(s).replace(/[\s　\-－、,，〜~]/g, ''); }
  function cpIntact(p) {
    var whole = p.pref + p.city + p.town + numPart(p) + p.building;
    if (sq(cpLines(p).join('')) !== sq(whole)) return false;
    if (!p.rawAddr || p.edited) return true;
    return sq(p.rawAddr) === sq((p.prefFilled ? '' : p.pref) + p.city + p.town + numPart(p) + p.building);
  }

  // ---- CSV ----
  function csvCell(v) {
    v = String(v == null ? '' : v);
    if (/[",\r\n]/.test(v)) v = '"' + v.replace(/"/g, '""') + '"';
    return v;
  }
  // 表計算ソフトで式として動きうる先頭の記号（各社のサイトへ取り込むCSVなので、記号を足さずに書き出す前に止める）
  function badLead(v) { return /^[=+\-@\t\r]/.test(String(v || '')); }
  // 送り方ごとの必須の欄（値は fields の key → value）
  function missing(carrier, fv) {
    var need = carrier === 'clickpost' ? [['zip', '郵便番号'], ['name', '氏名'], ['cp1', '住所1行目']]
      : carrier === 'yupack' ? [['zip', '郵便番号'], ['name', 'お名前'], ['ycity', '市区町村郡']] : [];
    return need.filter(function (n) { return !String(fv[n[0]] || '').trim(); }).map(function (n) { return n[1]; });
  }
  function csvClickpost(rows, naiyo) {
    var out = ['お届け先郵便番号,お届け先氏名,お届け先敬称,お届け先住所1行目,お届け先住所2行目,お届け先住所3行目,お届け先住所4行目,内容品'];
    rows.forEach(function (r) {
      var L = r.cp || cpLines(r);
      out.push([r.zip.replace(/-/g, ''), r.name, r.honor, L[0] || '', L[1] || '', L[2] || '', L[3] || '', naiyo].map(csvCell).join(','));
    });
    return out.join('\r\n') + '\r\n';
  }
  function csvYupack(rows, o, sender) {
    var lines = [];
    rows.forEach(function (r) {
      var f = r.yp || {};
      var c = new Array(72).fill('');
      c[0] = o.kind === 'packet' ? '6' : '1';
      c[1] = o.kind === 'packet' ? '' : '0';
      c[7] = f.name != null ? f.name : toZen(r.name);
      c[8] = f.honor != null ? f.honor : r.honor;
      c[10] = (f.zip != null ? f.zip : r.zip).replace(/-/g, '');
      c[11] = f.pref != null ? f.pref : r.pref;
      c[12] = f.ycity != null ? f.ycity : toZen(r.city + r.town);
      c[13] = f.ynum != null ? f.ynum : toZen(numPart(r));
      c[14] = f.ybld != null ? f.ybld : toZen(r.building);
      c[15] = f.tel != null ? f.tel : r.tel;
      c[22] = toZen(sender.name || '');
      c[25] = String(sender.zip || '').replace(/-/g, '');
      c[26] = sender.pref || '';
      c[27] = toZen(sender.city || '');
      c[28] = toZen(sender.num || '');
      c[29] = toZen(sender.building || '');
      c[30] = sender.tel || '';
      c[34] = toZen(o.item || '');
      c[64] = '0';
      lines.push(c.map(csvCell).join(','));
    });
    return lines.join('\r\n') + '\r\n';
  }
  function senderProblems(s, kind) {
    var miss = [];
    if (!s.name) miss.push('お名前');
    if (!/^\d{3}-?\d{4}$/.test(String(s.zip || ''))) miss.push('郵便番号（7桁）');
    if (!s.city) miss.push('市区町村郡');
    else if (chars(String(s.pref || '') + s.city) > 25) miss.push('都道府県と市区町村郡（合わせて25字まで）');
    return miss;
  }

  // ---- Shift-JIS（CP932） ----
  var SJIS = null;
  // CP932 と Unicode の対応がずれる字（見た目は同じ）
  var SJIS_FIX = { '〜': '～', '‖': '∥', '−': '－', '¢': '￠', '£': '￡', '¬': '￢', '—': '―' };
  function sjisTable() {
    if (SJIS) return SJIS;
    var dec = new TextDecoder('shift_jis'), map = new Map();
    var buf = new Uint8Array(2);
    for (var a = 0x81; a <= 0xFC; a++) {
      if (a > 0x9F && a < 0xE0) continue;
      for (var b = 0x40; b <= 0xFC; b++) {
        if (b === 0x7F) continue;
        buf[0] = a; buf[1] = b;
        var ch = dec.decode(buf);
        if (ch.length === 1 && ch !== '�' && !map.has(ch)) map.set(ch, [a, b]);
      }
    }
    SJIS = map;
    return map;
  }
  // 戻り値: { bytes: Uint8Array } か { bad: [使えない字] }
  function toSjis(text) {
    var map = sjisTable(), out = [], bad = [];
    for (var ch of String(text)) {
      if (SJIS_FIX[ch]) ch = SJIS_FIX[ch];
      var c = ch.codePointAt(0);
      if (c < 0x80) { out.push(c); continue; }
      if (c >= 0xFF61 && c <= 0xFF9F) { out.push(c - 0xFF61 + 0xA1); continue; }
      var b = map.get(ch);
      // 0x87（①・㈱など）・0xED〜0xEE・0xFA〜0xFC（髙・﨑など）は機種依存の字。取り込み先で使えない可能性があるので止める
      if (b && !(b[0] === 0x87 || b[0] === 0xED || b[0] === 0xEE || b[0] >= 0xFA)) { out.push(b[0], b[1]); continue; }
      if (bad.indexOf(ch) < 0) bad.push(ch);
    }
    return bad.length ? { bad: bad } : { bytes: new Uint8Array(out) };
  }

  function isIOS(ua, maxTouchPoints) {
    ua = String(ua || '');
    if (/iP(hone|od|ad)/.test(ua)) return true;
    return /Macintosh/.test(ua) && (maxTouchPoints || 0) > 1;
  }

  var SAMPLE_ONE = 'こんにちは！先日はありがとうございました\nピアスの件、こちらに送ってください\n〒０００－００１２\n東京都架空区見本町３丁目１２－５　サンプルハイツ見本台２０３号室\n山田 花子です\n電話は０９０－００００－１２３４です\nよろしくお願いします';
  var SAMPLE_MANY = '〒000-0002 大阪府見本市試し町1-2-3 みほんマンション4F 佐藤 一郎様\n\n鈴木 さくら\n北海道架空郡見本町字下ノ原\n〒000-0001\n\n〒000-0003 福岡県見本市架空区ためし台2丁目3番4号 ためしレジデンス見本台ウエストタワーA棟1205 田中 次郎様';

  var api = {
    norm: norm, width: width, chars: chars, toZen: toZen, kanToNum: kanToNum, splitBlocks: splitBlocks, parseOne: parseOne, parse: parse,
    matchMuni: matchMuni, numPart: numPart, cpLines: cpLines, wrap: wrap, fields: fields, judge: judge, cpIntact: cpIntact,
    csvClickpost: csvClickpost, csvYupack: csvYupack, csvCell: csvCell, badLead: badLead, missing: missing, senderProblems: senderProblems, toSjis: toSjis, isIOS: isIOS,
    PREFS: PREFS, MUNI_COUNT: Object.keys(MUNI_ORIG).length, MAX_INPUT: MAX_INPUT, MAX_ROWS: MAX_ROWS,
    SAMPLE_ONE: SAMPLE_ONE, SAMPLE_MANY: SAMPLE_MANY
  };
  if (typeof module !== 'undefined') module.exports = api;
  return api;
})();
