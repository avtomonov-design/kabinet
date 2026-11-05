const APP_VERSION = '4.0.2';
/* Кабинет витрины 2.0 — интерфейс. Правила в core.js, сеть в net.js. */
const C = window.Core, N = window.Net;
const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const h = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const fmt = n => n == null ? '—' : Number(n).toLocaleString('ru-RU');
const dstr = iso => iso ? new Date(iso).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';

const DEFAULTS = {
  shopId: '01a193bf-7a98-752c-ab34-889e5aff55eb',
  markupLines: [{ label: 'Наценка', amount: 3150 }],
  fullDesc: 'Лицензия «Баркод»\nВ «Меню» есть информация о лицензии',
  shortDesc: 'Уточним ваш размер перед отправкой, или оплатим возврат\nЛицензия «Баркод»\nВ «Меню» есть информация о лицензии',
  attrs: 'Тип размера|EURO;Доставка|по России 14-30 дней;Возврат|Платный, товар из-за рубежа;Оплата при получении|Недоступна;Примерка в CDEK|Доступна;Фото товара|Изображен реальный товар;Лицензия|Баркод',
  sizeGrid: 'Калькулятор размера|https://telegra.ph/Podbor-razmera-06-17',
  figmaToken: '', figmaUrl: 'https://www.figma.com/design/UqC8M7ln2Uisxpo1YEMdfh/Витрина?node-id=1-4',
  ghToken: '', ghPhotos: '', ghBackup: '', ghBranch: 'main',
  tgBot: '', tgChat: '',
  autoOn: false, autoTimes: '10:00, 19:00', autoMode: 'update',
  sheetId: '1K1VkY1Qqhnl7Uu4ymsut9NcZ_j7SpPXGzWk2f1njPcI', sheetGid: '0', dropThreshold: 10,
};
let DB = { cards: [], order: { '1016': [], '1015': [] }, settings: { ...DEFAULTS }, showcase: [], history: [], lastUpdate: null, lastReport: null, lastExport: null, lastFigma: null, undo: null };
let CAT = '1015', busy = false;

// ---------- хранение ----------
async function load() { const db2 = await N.dbGet('db2'); if (db2) DB = { ...DB, ...db2, settings: { ...DEFAULTS, ...(db2.settings || {}) } }; if (/UqC8M7ln2Uisxpo1YEMdfh.*node-id=2-34/.test(DB.settings.figmaUrl)) DB.settings.figmaUrl = DEFAULTS.figmaUrl; delete DB.showcase; }
let bkTimer = null;
async function save(quiet) {
  await N.dbSet('db2', DB);
  $('#saved').textContent = 'Сохранено ' + new Date().toLocaleTimeString('ru-RU');
  if (DB.settings.ghToken && DB.settings.ghBackup) { clearTimeout(bkTimer); bkTimer = setTimeout(() => backupGh(true), 60000); }
}
async function backupGh(silent) {
  try { const { undo, sessions, ...rest } = DB; await N.ghPut(DB.settings.ghToken, DB.settings.ghBackup, DB.settings.ghBranch, 'backup/db.json', new TextEncoder().encode(JSON.stringify(rest)), 'Резервная копия ' + new Date().toISOString()); if (!silent) prog('#setProg', 'Копия сохранена на GitHub'); DB.lastBackup = new Date().toISOString(); await N.dbSet('db2', DB); }
  catch (e) { if (!silent) prog('#setProg', e.message); }
}
function log(kind, text) { DB.history.unshift({ at: new Date().toISOString(), kind, text }); DB.history = DB.history.slice(0, 300); }
const P = () => C.markupOf(DB.settings);
const card = id => DB.cards.find(c => c.id === id);
let PS = { sel: null, t: '', t0: 0 };
const prog = (sel, t) => { if (PS.sel !== sel) PS.t0 = Date.now(); PS = { sel, t, t0: PS.t0 || Date.now() }; const el = $(sel); if (el) el.textContent = t; };
setInterval(() => { if (!busy || !PS.sel || !PS.t) return; const el = $(PS.sel); if (el) el.textContent = PS.t + ' · ' + Math.round((Date.now() - PS.t0) / 1000) + ' с'; }, 1000);
async function ghPreflight() { if (!ghReady()) throw new Error('Подключите GitHub в настройках — фото хранятся там'); if (!ghPreflight.ok) { await N.ghCheck(DB.settings.ghToken, DB.settings.ghPhotos); ghPreflight.ok = true; } }
const figmaKey = () => C.figmaKeyFromUrl(DB.settings.figmaUrl), figmaRoot = () => C.figmaNodeFromUrl(DB.settings.figmaUrl);
const ghReady = () => DB.settings.ghToken && DB.settings.ghPhotos;
async function notify(text) { try { await N.telegram(DB.settings.tgBot, DB.settings.tgChat, text); } catch (e) { } }

// ---------- навигация ----------
function tab(name) { $$('nav button[data-tab]').forEach(b => b.classList.toggle('on', b.dataset.tab === name)); $$('.tab').forEach(t => t.classList.toggle('on', t.id === name)); render(); scrollTo(0, 0); }
$$('nav button[data-tab]').forEach(b => b.onclick = () => tab(b.dataset.tab));
function screen(id) { ['scrAuth', 'scrHelp', 'scrSupport'].forEach(x => $('#' + x).classList.toggle('hidden', x !== id)); }
$$('nav button[data-screen]').forEach(b => b.onclick = () => { if (b.dataset.screen === 'scrHelp') { $('#helpText').innerHTML = window.HELP_HTML || ''; $('#helpText').scrollTop = 0; } screen(b.dataset.screen); setTimeout(() => thumbs.forEach(t => t()), 30); });
$$('[data-close]').forEach(b => b.onclick = () => screen(null));
// часы на экранах входа, инструкции и поддержки
const tick = () => { const t = new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }); $$('.clock').forEach(e => e.textContent = t); };
tick(); setInterval(tick, 10000);
$$('#catSeg button').forEach(b => b.onclick = () => { CAT = b.dataset.cat; $$('#catSeg button').forEach(x => x.classList.toggle('on', x === b)); renderGrid(); scrollTo(0, 0); });

function render() { renderGrid(); renderStatus(); renderMarkup(); renderSold(); renderLog(); renderSettings(); }
function renderStatus() {
  const en = DB.cards.filter(c => c.enabled), sold = en.filter(c => c.status.soldOutSince).length, warn = en.filter(c => C.hints(DB, c, P()).some(x => x[0] === 'bad' || x[0] === 'warn')).length;
  $('#bUpdate').title = `Обновить цены и остатки у 4Partners. Последний раз: ${dstr(DB.lastUpdate)} · распроданных ${sold} · с подсказками ${warn} · авто: ${DB.settings.autoOn ? autoTimes().join(', ') + (DB.settings.autoMode === 'export' ? ' + выгрузка' : '') : 'выкл'}`;
  $('#bExport').title = 'Последняя выгрузка: ' + dstr(DB.lastExport && DB.lastExport.at); $('#bFigma').title = 'Последняя сверка: ' + dstr(DB.lastFigma);
  $$('#catSeg button').forEach(b => b.title = DB.order[b.dataset.cat].length + ' карточек');
}

// ---------- витрина: сетка карточек ----------
function filtered() {
  Object.defineProperty(DB, '_moved', { value: C.movedCards(DB, CAT), configurable: true, writable: true, enumerable: false });
  const q = $('#q').value.trim().toLowerCase(), f = '';
  return DB.order[CAT].map((id, i) => ({ c: card(id), i })).filter(({ c }) => {
    if (!c) return false;
    const hs = C.hints(DB, c, P());
    if (f === 'live' && !(c.enabled && C.liveSizes(c).length)) return false;
    if (f === 'warn' && !hs.some(x => x[0] === 'warn' || x[0] === 'bad')) return false;
    if (f === 'sold' && !c.status.soldOutSince) return false;
    if (f === 'off' && c.enabled) return false;
    if (f === 'moved' && !DB._moved.has(c.id)) return false;
    return !q || (c.name + ' ' + c.group + ' ' + c.sizes.map(s => s.sku).join(' ')).toLowerCase().includes(q);
  });
}
function renderGrid() {
  const g = $('#grid'), list = filtered();
  $('#empty').classList.toggle('hidden', DB.cards.length > 0);
  if (!DB.cards.length) $('#empty').innerHTML = `<div class="empty"><h2>Витрина пуста</h2><p class="muted">Перенесите текущую витрину из TgShop: кабинет возьмёт товары, порядок и ссылки поставщика. Нужны входы в admin.tgshop.io и Google в этом Chrome.</p><button class="primary" id="emMigrate">Перенести текущую витрину</button></div>`;
  if ($('#emMigrate')) $('#emMigrate').onclick = migrate;
  g.innerHTML = list.map(({ c, i }) => {
    const ph = C.photoUrl(c.photos[0] || {}), pr = C.priceRange(c, P());
    const hs = C.hints(DB, c, P()).filter(([k]) => k !== 'off'), hint = hs.slice(0, 2).map(x => x[1]).join(' · ');
    const price = pr ? 'RUB ' + (pr[0] === pr[1] ? fmt(pr[0]) : fmt(pr[0]) + ' – ' + fmt(pr[1])) : 'нет в продаже';
    return `<div class="card ${c.enabled ? '' : 'off'}" style="--i:${i}" data-id="${c.id}" title="${i + 1}-я · ${h(c.name)}"><span class="drag" title="Потяните, чтобы переставить"><i></i><i></i><i></i><i></i></span>${ph ? `<div class="ph"><img src="${h(ph)}" loading="lazy" alt=""></div>` : ''}<div class="meta"><div class="np"><p>${h(c.name) || 'без названия'}</p><p>${price}</p></div>${hint ? `<p class="hint ${hs.some(x => x[0] === 'bad') ? 'bad' : ''}">${h(hint)}</p>` : ''}</div></div>`;
  }).join('') || (DB.cards.length ? '<p class="dim" style="padding:20px">Ничего не найдено</p>' : '');
  const dragOk = !$('#q').value;
  $$('#grid .card').forEach(el => {
    const id = el.dataset.id, hd = el.querySelector('.drag');
    el.onclick = () => editCard(card(id));
    // тянуть можно только за «перетаскиватель» — точки в углу
    hd.onmousedown = () => { el.draggable = dragOk; }; hd.onclick = e => e.stopPropagation();
    el.ondragstart = e => { e.dataTransfer.setData('text/plain', id); el.classList.add('dragging'); };
    el.ondragend = () => { el.classList.remove('dragging'); el.draggable = false; };
    el.ondragover = e => { e.preventDefault(); const r = el.getBoundingClientRect(), after = e.clientX > r.left + r.width / 2; el.classList.toggle('over-after', after); el.classList.toggle('over-before', !after); };
    el.ondragleave = () => el.classList.remove('over-after', 'over-before');
    el.ondrop = async e => {
      e.preventDefault(); const from = e.dataTransfer.getData('text/plain'); const after = el.classList.contains('over-after'); el.classList.remove('over-after', 'over-before');
      if (!from || from === id) return; const o = DB.order[CAT]; o.splice(o.indexOf(from), 1); o.splice(o.indexOf(id) + (after ? 1 : 0), 0, from);
      log('Порядок', `«${card(from).name}» → место ${o.indexOf(from) + 1}`); await save(); renderGrid();
    };
  });
}
$('#q').oninput = renderGrid;

// ---------- модальное окно ----------
function modal(html, onReady) { $('#dlgBody').innerHTML = html; $('#dlgBody').scrollTop = 0; setTimeout(() => thumbs.forEach(t => t()), 30); document.body.classList.add('pOpen'); const p = $('#dlgBody .progress[id]'); if (p && p.textContent) PS = { sel: '#' + p.id, t: p.textContent, t0: Date.now() }; onReady && onReady($('#dlgBody')); }
function closeModal() { document.body.classList.remove('pOpen'); }
$('#pX').onclick = closeModal; $('#ovl').onclick = () => { if (!busy) closeModal(); };
document.addEventListener('keydown', e => { if (e.key === 'Escape' && document.body.classList.contains('pOpen') && !busy) closeModal(); });

// ---------- карточка ----------
function editCard(c) {
  const P0 = P(), pos = DB.order[c.cat].indexOf(c.id) + 1;
  const sizesHtml = () => { const an = C.anomalies(c); return c.sizes.map(s => `<span class="sz ${s.enabled === false ? 'dis' : ''} ${an.has(s.sku) ? 'an' : ''} ${s.stock ? 'on' : ''}" data-sku="${h(s.sku)}" title="${h(s.sku)}${an.has(s.sku) ? ' · аномальная цена, скрыт' : ''} — нажмите, чтобы ${s.enabled === false ? 'включить' : 'выключить'} размер">${h(s.sz)} | ${s.J && s.stock ? fmt(s.J + P0) : '—'}</span>`).join('') || '<span class="dim">размеры появятся после инвентаризации</span>'; };
  const checkedHtml = () => `${h(c.group)}${c.status.checked ? ' · проверено ' + dstr(c.status.checked) : ''}`;
  const fPos = C.movedCards(DB, c.cat).get(c.id);
  const figUrl = c.figma ? `https://www.figma.com/design/${c.figma.key || figmaKey()}/?node-id=${c.figma.node.replace(':', '-')}` : '';
  const ft = c.figma && c.figma.title;
  modal(`<div class="cTitleRow"><input class="cTitle" id="cName" maxlength="30" value="${h(c.name)}" title="Название на витрине — можно поправить"><span class="pos">· место ${pos}</span></div>
  <div class="sub" style="margin:4px 0 0">${ft ? `в Figma: «${h(ft)}» ${ft.slice(0, 30) !== c.name ? '<button class="lnk" id="cNameBack">вернуть из Figma</button>' : '✓'}` : 'нет трафарета в Figma'}${fPos ? ` · ↕ в Figma ${fPos}-я <button class="lnk" id="cPlace">вернуть на место</button>` : ''}</div>
  <div class="strip" id="strip"></div>
  <div class="cF"><span class="dim">фото меняются только в Figma</span><button class="lnk" id="cFig" style="text-align:left;width:max-content" ${c.figma && DB.settings.figmaToken ? '' : 'disabled'}>Синхронизировать</button><span class="dim" id="cProg"></span></div>
  <div class="cFields">
    <div class="cF"><span class="dim">Трафарет в Figma</span>${figUrl ? `<a class="linkBox" href="${h(figUrl)}" target="_blank">${h(figUrl)}</a>` : '<span class="dim">—</span>'}</div>
    <div class="cF"><span class="dim">Раздел</span><select class="catSel" id="cCat"><option value="1016" ${c.cat === '1016' ? 'selected' : ''}>Девушкам</option><option value="1015" ${c.cat === '1015' ? 'selected' : ''}>Парням</option></select></div>
    <div class="cF"><span class="dim">Ссылка на 4Partners</span>${c.link ? `<a class="linkBox" href="${h(C.keyOf(c))}" target="_blank">${h(C.keyOf(c))}</a>` : '<span class="dim">—</span>'}</div>
    <div class="cF"><span class="dim">Размеры</span><div class="sizes" id="cSizes">${sizesHtml()}</div><button class="lnk" id="c4p" style="text-align:left;width:max-content" ${c.link ? '' : 'disabled'}>Сверить с 4Partners</button><div id="c4pOut"></div></div>
    <div class="cF"><span class="dim">ID TgShop</span><span id="cChecked">${checkedHtml()}</span></div>
  </div>
  <div class="acts"><div class="chkRow"><label class="chk"><input type="checkbox" id="cOn" ${c.enabled ? 'checked' : ''}> включена на витрине</label></div><button class="primary" id="cSave">сохранить</button><button id="cDel">удалить карточку</button></div>`, root => {
    const photos = [...c.photos];
    const strip = root.querySelector('#strip');
    const drawStrip = () => { strip.innerHTML = photos.map(p => `<div class="th"><img src="${h(C.photoUrl(p))}" alt="" draggable="false"></div>`).join('') || '<div class="th"></div><div class="th"></div><div class="th"></div>'; };
    drawStrip();
    // листать ленту фото захватом мышки (трекпад работает сам)
    let sx = null, sl = 0;
    strip.onmousedown = e => { sx = e.clientX; sl = strip.scrollLeft; strip.classList.add('grabbing'); };
    window.onmousemove = e => { if (sx !== null) strip.scrollLeft = sl - (e.clientX - sx); };
    window.onmouseup = () => { sx = null; strip.classList.remove('grabbing'); };
    const nameEl = root.querySelector('#cName'); nameEl.oninput = () => { };
    const bindSizes = () => root.querySelectorAll('.sz[data-sku]').forEach(el => el.onclick = () => { const s = c.sizes.find(x => x.sku === el.dataset.sku); s.enabled = s.enabled === false; el.classList.toggle('dis', s.enabled === false); });
    bindSizes();
    root.querySelector('#c4p').onclick = async () => {
      if (busy) return; const out = root.querySelector('#c4pOut'), btn = root.querySelector('#c4p'); btn.disabled = true; busy = true;
      out.innerHTML = '<div class="msg">Спрашиваю у 4Partners… ⏳</div>';
      try {
        const data = await N.fetch4P([c.link]), d = data[c.link];
        const r = C.updateCard(c, d && d.status === 200 ? d.vs : null, C.hasTwin(DB, c), C.idState(DB));
        if (r.error) { c.status.error = r.error; out.innerHTML = `<div class="msg bad">Не сверилось: ${h(r.error)}. Данные не тронуты.</div>`; }
        else {
          delete c.status.error; c.status.checked = new Date().toISOString();
          const pr = r.changes.filter(x => x.oSt && x.nSt && x.oJ !== x.nJ), end = r.changes.filter(x => x.oSt && !x.nSt), app = r.changes.filter(x => !x.oSt && x.nSt);
          const live = C.liveSizes(c).length, t = [];
          if (pr.length) t.push(`цена изменилась: ${pr.map(x => `${h(x.sz)} ${fmt(x.oJ + P0)} → ${fmt(x.nJ + P0)} ₽`).join(', ')}`);
          if (end.length) t.push(`закончились: ${end.map(x => h(x.sz)).join(', ')}`);
          if (app.length) t.push(`появились: ${app.map(x => h(x.sz)).join(', ')}`);
          if (r.added.length) t.push(`новые размеры: ${r.added.map(x => h(x.sz)).join(', ')}`);
          r.notes.forEach(n => t.push(h(n)));
          if (r.soldOut) t.push('🔴 распродалась целиком — останется на витрине с остатком 0'); if (r.back) t.push('🟢 вернулась в продажу');
          const state = live ? `🟢 В наличии ${live} из ${c.sizes.length} размеров` : `🔴 У 4Partners нет в наличии ни одного размера${c.status.soldOutSince ? ` (распродана с ${c.status.soldOutSince.split('-').reverse().join('.')})` : ''}`;
          out.innerHTML = `<div class="msg ${live ? 'ok' : 'bad'}"><b>${state}</b>${!c.enabled ? '<br>Карточка выключена — на витрине её нет.' : ''}<br>${t.length ? 'Что поменялось с прошлой проверки:<br>' + t.join('<br>') + '<br><span class="muted">Чтобы изменения попали на витрину — «выгрузить».</span>' : '<span class="muted">С прошлой проверки ничего не поменялось.</span>'}</div>`;
          log('Цены', `Сверка «${c.name}» с 4Partners: ${t.length ? 'есть изменения' : 'без изменений'}`);
        }
        await save(); root.querySelector('#cSizes').innerHTML = sizesHtml(); bindSizes(); root.querySelector('#cChecked').innerHTML = checkedHtml(); renderGrid(); renderStatus();
      } catch (e) { out.innerHTML = `<div class="msg bad">${h(e.message)}</div>`; }
      busy = false; btn.disabled = false;
    };
    if (root.querySelector('#cPlace')) root.querySelector('#cPlace').onclick = async () => { C.placeLikeFigma(DB, c); log('Порядок', `«${c.name}» → как в Figma, место ${DB.order[c.cat].indexOf(c.id) + 1}`); await save(); closeModal(); renderGrid(); };
    if (root.querySelector('#cNameBack')) root.querySelector('#cNameBack').onclick = () => { nameEl.value = c.figma.title.slice(0, 30); nameEl.oninput(); c.nameManual = false; };
    root.querySelector('#cFig').onclick = async () => { try { prog('#cProg', 'Рисую фото из Figma…'); const fresh = await photosFromFigma(c.figma); photos.splice(0, photos.length, ...fresh); drawStrip(); prog('#cProg', `Готово: ${photos.length} фото — нажмите «сохранить»`); } catch (er) { prog('#cProg', er.message); } };
    root.querySelector('#cDel').onclick = async () => { if (!confirm(`Удалить «${c.name}» из кабинета? При выгрузке товар уйдёт с витрины.`)) return; DB.cards = DB.cards.filter(x => x !== c); for (const k of ['1016', '1015']) DB.order[k] = DB.order[k].filter(x => x !== c.id); log('Витрина', `Удалена «${c.name}»`); await save(); closeModal(); render(); };
    root.querySelector('#cSave').onclick = async () => {
      const nm = nameEl.value.trim().slice(0, 30);
      if (nm && nm !== c.name) { c.nameManual = !(c.figma && c.figma.title && c.figma.title.slice(0, 30) === nm); c.name = nm; }
      const cat = root.querySelector('#cCat').value; if (cat !== c.cat) { DB.order[c.cat] = DB.order[c.cat].filter(x => x !== c.id); c.cat = cat; DB.order[cat].push(c.id); }
      c.photos = photos; c.enabled = root.querySelector('#cOn').checked;
      log('Карточка', `Изменена «${c.name}»`); await save(); closeModal(); render();
    };
  });
}

// ---------- фото: Figma → GitHub ----------
async function storePhoto(bytes, from, node) {
  await ghPreflight();
  const st = DB.settings, sha = await N.sha1(bytes), path = `photos/${sha}.jpg`;
  if (!storePhoto.have) storePhoto.have = await N.ghList(st.ghToken, st.ghPhotos, st.ghBranch, 'photos');
  if (!storePhoto.have.has(path)) { await N.ghPut(st.ghToken, st.ghPhotos, st.ghBranch, path, bytes, 'Фото ' + sha.slice(0, 8), true); storePhoto.have.add(path); await N.sleep(400); }
  return { url: N.rawUrl(st.ghPhotos, st.ghBranch, path), sha, from, node };
}
async function photosFromFigma(fg) {
  await ghPreflight();
  if (!DB.settings.figmaToken) throw new Error('Нет токена Figma');
  let ids = fg.photos;
  if (!ids || !ids.length) { const doc = await N.figmaNode(DB.settings.figmaToken, fg.key || figmaKey(), fg.node); const t = C.parseTrafarets({ children: [{ name: '', children: [{ ...doc, name: 'Товар' }] }] })[0]; ids = t ? t.photos : []; fg.photos = ids; fg.hash = t && t.hash; }
  if (!ids.length) throw new Error('В трафарете не найдено фото 379×481');
  const urls = await N.figmaRender(DB.settings.figmaToken, fg.key || figmaKey(), ids);
  const out = [];
  for (const id of ids) { if (!urls[id]) throw new Error('Figma не отрисовала ' + id); out.push(await storePhoto(await N.getBytes(urls[id]), 'figma', id)); }
  fg.syncedHash = fg.hash; fg.changed = false;
  return out;
}

// ---------- перенос текущей витрины ----------
async function migrate() {
  if (busy) return; busy = true;
  modal('<h2>Перенос текущей витрины</h2><div class="progress" id="mProg">Читаю витрину TgShop…</div><div id="mOut"></div>');
  try {
    if (DB.cards.length && !confirm('В кабинете уже есть карточки. Заменить их текущей витриной из TgShop?')) throw new Error('Отменено');
    const { cards } = await N.tgShowcase(DB.settings.shopId, (a, b) => prog('#mProg', `Читаю витрину TgShop: ${a} из ${b}…`));
    prog('#mProg', 'Беру ссылки поставщика из каталога (разово)…');
    const { text } = await N.sheetCSV(DB.settings.sheetId, DB.settings.sheetGid);
    const r = C.migrate(C.parseCSV(text), cards);
    DB.cards = r.cards; DB.order = r.order;
    if (r.markup && DB.settings.markupLines.length === 1 && DB.settings.markupLines[0].amount === 3150) DB.settings.markupLines = [{ label: 'Наценка (из каталога)', amount: r.markup }];
    log('Перенос', `Из TgShop: ${cards.length} товаров → ${DB.cards.length} карточек`); await save(); render();
    $('#mOut').innerHTML = `<div class="msg ok">Перенесено: девушкам ${DB.order['1016'].length}, парням ${DB.order['1015'].length} карточек; порядок — как сейчас на витрине.</div>${r.notes.length ? `<details open><summary>Обратите внимание — ${r.notes.length}</summary>${r.notes.map(h).join('<br>')}</details>` : ''}<p class="muted">Дальше: «Сверить с Figma» — карточки свяжутся с трафаретами.</p><div class="acts"><button class="primary" id="mOk">Готово</button></div>`;
    prog('#mProg', ''); $('#mOk').onclick = closeModal;
  } catch (e) { prog('#mProg', ''); $('#mOut').innerHTML = `<div class="msg bad">${h(e.message)}</div><div class="acts"><button id="mOk">Закрыть</button></div>`; $('#mOk').onclick = closeModal; }
  busy = false;
}
$('#migrate').onclick = migrate;

// ---------- сверка с Figma ----------
$('#bFigma').onclick = figmaSync;
async function figmaSync() {
  if (busy) return; const st = DB.settings;
  if (!st.figmaToken || !figmaKey() || !figmaRoot()) return alert('В настройках нужны токен Figma и ссылка на страницу «> Актуальная витрина»');
  busy = true; modal('<h2>Сверка с Figma</h2><div class="progress" id="fProg">Ищу витрину в Figma…</div><div id="fOut"></div>');
  const done = html => { prog('#fProg', ''); $('#fOut').innerHTML = html + '<div class="acts" id="fActs"><span style="flex:1"></span><button id="fOk">Закрыть</button></div>'; $('#fOk').onclick = closeModal; };
  try {
    const root = await N.figmaResolve(st.figmaToken, figmaKey(), figmaRoot());
    const doc = await N.figmaNode(st.figmaToken, figmaKey(), root.id, (a, n) => prog('#fProg', `Читаю трафареты: раздел ${a} из ${n}…`));
    const trs = C.parseTrafarets(doc);
    if (!trs.length) { busy = false; return done(`<div class="msg bad">В «${h(root.name)}» не нашлось ни одного трафарета «Товар N». Кабинет ничего не менял.</div>`); }
    const m = C.matchTrafarets(DB, trs);
    // трафарет «в обе коллекции», у которого есть карточка только в одном разделе — дособрать вторую
    const twins = [];
    for (const t of trs.filter(t => t.cat === 'both')) { const have = m.linked.filter(x => x.tr === t).map(x => x.card.cat); for (const cat of ['1016', '1015']) if (have.length && !have.includes(cat)) twins.push({ t, cat }); }
    const add = [...m.fresh.filter(t => t.link).flatMap(t => (t.cat === 'both' ? ['1016', '1015'] : [t.cat]).map(cat => ({ t, cat }))), ...twins];
    const noLink = m.fresh.filter(t => !t.link), del = m.without;
    // модель была в обеих коллекциях, а осталась в одной — частая ошибка при ручной сборке
    const halfLost = del.filter(c => DB.cards.some(x => x !== c && x.cat !== c.cat && x.link === c.link && x.hv === c.hv && !del.includes(x)));
    let renamed = 0, changed = 0, rebound = 0;
    for (const { card: c, tr } of m.linked) { const t = tr.title.slice(0, 30); if (t && c.name !== t && !(c.figma && c.figma.title === tr.title)) renamed++; if (!c.figma || c.figma.syncedHash !== tr.hash || c.figma.node !== tr.node) changed++; if (tr.hv && c.hv !== tr.hv) rebound++; }
    const left = cat => DB.order[cat].filter(id => !del.some(c => c.id === id)).length + add.filter(x => x.cat === cat).length;
    const empty = ['1016', '1015'].filter(cat => DB.order[cat].length && !left(cat));
    const season = DB.cards.length && del.length > DB.cards.length / 2;
    const nm = c => `${h(c.name)} · ${C.catName(c.cat)}`;
    let html = `<div class="msg info">Figma${root.page ? ` · «${h(root.page)}»` : ''}: трафаретов ${trs.length}. В кабинете ${DB.cards.length} карточек.</div>`;
    if (season) html += `<div class="msg warn"><b>Похоже, это новая витрина ✨</b> Уходит ${del.length} из ${DB.cards.length} карточек. Новые встанут в порядке Figma.</div>`;
    if (empty.length) html += `<div class="msg bad"><b>Внимание:</b> раздел ${empty.map(C.catName).join(' и ')} останется пустым. Если это не задумано — проверьте Figma.</div>`;
    if (halfLost.length) html += `<div class="msg bad"><b>Дубль остался в одной коллекции:</b> ${halfLost.map(nm).join(', ')}. Если модель должна быть в обеих — положите копию трафарета во второй раздел Figma.</div>`;
    html += `<table class="t"><tr><th>Что будет</th><th></th></tr><tr><td>➕ Добавятся</td><td class="n">${add.length}</td></tr><tr><td>➖ Удалятся (трафарета больше нет)</td><td class="n">${del.length}</td></tr><tr><td>🖼 Обновятся фото</td><td class="n">${changed}</td></tr><tr><td>✏️ Обновятся названия</td><td class="n">${renamed}</td></tr>${rebound ? `<tr><td>🔗 Сменился цвет/вариант 4Partners</td><td class="n">${rebound}</td></tr>` : ''}</table>`;
    if (add.length) html += `<details ${add.length <= 15 ? 'open' : ''}><summary>➕ Добавятся — ${add.length}</summary>${add.map(x => `«${h(x.t.title)}» · ${C.catName(x.cat)}`).join('<br>')}</details>`;
    if (del.length) html += `<details ${del.length <= 15 ? 'open' : ''}><summary>➖ Удалятся — ${del.length}</summary>${del.map(nm).join('<br>')}<div class="muted" style="margin-top:6px">При следующей выгрузке они уйдут и с витрины TgShop. Копия старой витрины — в архивной вкладке Figma.</div></details>`;
    if (noLink.length) html += `<div class="msg bad">Не добавлю — в трафарете нет ссылки 4Partners: ${noLink.map(t => `«${h(t.title)}» (${h(t.section)})`).join(', ')}</div>`;
    const nothing = !add.length && !del.length && !changed && !renamed && !rebound;
    if (nothing) html += `<div class="msg ok">✅ Кабинет совпадает с Figma</div>`;
    // порядок Figma запоминаем всегда — по нему кабинет отмечает «не как в Figma»
    DB.figmaOrder = { '1016': trs.filter(t => t.cat === '1016' || t.cat === 'both').map(t => t.node), '1015': trs.filter(t => t.cat === '1015' || t.cat === 'both').map(t => t.node) };
    done(html); DB.lastFigma = new Date().toISOString(); await save(); render();
    if (!nothing) {
      $('#fActs').insertAdjacentHTML('beforeend', `<button class="primary" id="fApply">Применить</button>`);
      $('#fApply').onclick = async () => {
        if ((del.length > 5 || empty.length || halfLost.length) && !confirm(`Удалить из кабинета ${del.length} карточек${empty.length ? ' (раздел ' + empty.map(C.catName).join(' и ') + ' станет пустым)' : ''}?`)) return;
        $('#fApply').disabled = true;
        const delIds = new Set(del.map(c => c.id));
        DB.cards = DB.cards.filter(c => !delIds.has(c.id)); for (const k of ['1016', '1015']) DB.order[k] = DB.order[k].filter(id => !delIds.has(id));
        for (const { card: c, tr } of m.linked) {
          const prev = c.figma || {}, t = tr.title.slice(0, 30);
          const keepName = prev.title === tr.title && c.name !== t;   // имя правили в кабинете, а в Figma оно не менялось — оставляем правку
          c.figma = { node: tr.node, key: figmaKey(), title: tr.title, photos: tr.photos, hash: tr.hash, syncedHash: prev.node === tr.node ? prev.syncedHash : undefined, section: tr.section };
          c.figma.changed = c.figma.syncedHash !== tr.hash;
          if (tr.hv && c.hv !== tr.hv) { c.hv = tr.hv; delete c.status.error; }
          if (t && !keepName) c.name = t;
        }
        const n = addFromTrafarets(add, trs);
        if (season) for (const k of ['1016', '1015']) C.sortLikeFigma(DB, k);
        log('Figma', `Применено: +${n}, −${del.length}, фото ${changed}, названий ${renamed}`); await save(); render();
        const ph = DB.cards.filter(c => c.figma && c.figma.changed);
        $('#fOut').insertAdjacentHTML('afterbegin', `<div class="msg ok"><b>Готово ✅</b> Добавлено ${n}, удалено ${del.length}.${n ? ' Дальше «Обновить цены и остатки» — у новых карточек появятся размеры и цены, потом «Выгрузить на витрину».' : ' Дальше — «Выгрузить на витрину».'}</div>`);
        if (ph.length && ghReady()) { busy = false; await syncPhotos(ph, '#fProg'); }
        else if (ph.length) prog('#fProg', 'Чтобы загрузились фото, подключите GitHub в настройках.');
      };
    }
  } catch (e) { done(`<div class="msg bad">${h(e.message)}</div>`); }
  busy = false;
}
function addFromTrafarets(list, trs) {
  const ids = C.idState(DB); let n = 0;
  for (const { t, cat } of list) {
    if (DB.cards.some(c => c.cat === cat && c.figma && c.figma.node === t.node)) continue;
    const c = C.newCard({ cat, group: C.allocGroup(ids, cat), name: t.title.slice(0, 30), link: t.link, hv: t.hv });
    c.figma = { node: t.node, key: figmaKey(), title: t.title, photos: t.photos, hash: t.hash, changed: true, section: t.section };
    DB.cards.push(c); DB.order[cat].push(c.id); C.placeLikeFigma(DB, c); n++;
  }
  return n;
}
if ($('#bSortFig')) $('#bSortFig').onclick = async () => {
  if (!DB.figmaOrder) return alert('Сначала «Сверить с Figma» — кабинет запомнит порядок трафаретов');
  const n = C.movedCards(DB, CAT).size; if (!n) return alert('Раздел уже стоит как в Figma ✅');
  if (!confirm(`Расставить раздел «${C.catName(CAT)}» как в Figma? Переставленных вручную: ${n}.`)) return;
  C.sortLikeFigma(DB, CAT); log('Порядок', `${C.catName(CAT)}: расставлен как в Figma`); await save(); renderGrid();
};
async function syncPhotos(list, progSel) {
  if (syncPhotos.running) { prog(progSel, 'Загрузка фото уже идёт — дождитесь окончания'); return; }
  syncPhotos.running = true; const was = busy; busy = true;
  let ok = 0; const bad = [];
  try {
    await ghPreflight();
    const need = list.filter(c => c.figma && (c.figma.photos || []).length), noIds = list.filter(c => c.figma && !(c.figma.photos || []).length);
    noIds.forEach(c => bad.push(c.name + ': в трафарете не найдено фото 379×481'));
    const ids = [...new Set(need.flatMap(c => c.figma.photos))];
    const urls = await N.figmaRender(DB.settings.figmaToken, figmaKey(), ids, (a, n) => prog(progSel, `Figma рисует фото: ${a} из ${n}…`));
    for (const [i, c] of need.entries()) {
      prog(progSel, `Загружаю на GitHub: карточка ${i + 1} из ${need.length} — ${c.name} (готово ${ok}, ошибок ${bad.length})`);
      try {
        const out = []; for (const id of c.figma.photos) { if (!urls[id]) throw new Error('Figma не отрисовала фото ' + id); out.push(await storePhoto(await N.getBytes(urls[id]), 'figma', id)); }
        c.photos = out; c.figma.syncedHash = c.figma.hash; c.figma.changed = false; ok++; await save();
      } catch (e) { bad.push(c.name + ': ' + e.message); if (/GitHub|не название|не найден|права записи/.test(e.message) && !/не отрисовала/.test(e.message)) break; }
    }
  } catch (e) { bad.unshift(e.message); }
  finally { syncPhotos.running = false; busy = was; }
  render(); prog(progSel, `Фото обновлены: ${ok} из ${list.length}${bad.length ? '. Ошибки (' + bad.length + '): ' + bad.slice(0, 5).join('; ') + (bad.length > 5 ? '…' : '') : ''}`);
  log('Фото', `Из Figma: ${ok}, ошибок ${bad.length}`);
}
$('#photosFigma').onclick = async () => { if (!ghReady()) return alert('Подключите GitHub'); if (syncPhotos.running) return alert('Загрузка фото уже идёт'); const list = DB.cards.filter(c => c.figma); if (!confirm(`Перерисовать фото ${list.length} карточек из Figma?`)) return; for (const c of list) c.figma.changed = true; await syncPhotos(list, '#setProg'); };
$('#photosDrive').onclick = async () => {
  if (!ghReady()) return alert('Подключите GitHub');
  const list = DB.cards.filter(c => c.photos.some(p => p.from === 'drive')); let n = 0;
  for (const c of list) { const out = []; for (const p of c.photos) { if (p.from !== 'drive') { out.push(p); continue; } try { out.push(await storePhoto(await N.getBytes(C.photoUrl(p)), 'file')); n++; } catch (e) { out.push(p); } prog('#setProg', `Переношу фото: ${n}…`); } c.photos = out; }
  await save(); render(); prog('#setProg', `Перенесено фото: ${n}`); log('Фото', `С Google Drive на GitHub: ${n}`);
};

// ---------- добавить по ссылкам 4Partners ----------
if ($('#bAdd')) $('#bAdd').onclick = () => modal(`<h2>Добавить карточки по ссылкам 4Partners</h2><p class="muted">По одной ссылке в строке, с выбранным цветом (#v… в конце). Карточки встанут в конец витрины в порядке списка; раздел определится по размерам: до 40 — девушкам, от 40 — парням, оба диапазона — две карточки.</p><textarea id="aL" rows="8"></textarea><div class="progress" id="aProg"></div><div class="acts"><button id="aCancel">Отмена</button><button class="primary" id="aGo">Добавить</button></div>`, root => {
  root.querySelector('#aCancel').onclick = closeModal;
  root.querySelector('#aGo').onclick = async () => {
    const links = root.querySelector('#aL').value.split(/\s+/).map(C.splitLink).filter(x => /4partners/.test(x.link) && x.hv);
    if (!links.length) return prog('#aProg', 'Нет ссылок с #v…');
    try {
      const data = await N.fetch4P([...new Set(links.map(x => x.link))], (a, b) => prog('#aProg', `Смотрю у поставщика: ${a} из ${b}…`));
      const ids = C.idState(DB); let n = 0; const bad = [];
      for (const { link, hv } of links) {
        const vs = data[link] && data[link].vs; const g = vs && C.genderOf(vs, hv);
        if (!g) { bad.push(link + '#v' + hv); continue; }
        const nm = ((vs.find(v => String(v.id) === hv) || {}).n || '').slice(0, 30);
        for (const cat of g === 'both' ? ['1016', '1015'] : [g]) {
          const c = C.newCard({ cat, group: C.allocGroup(ids, cat), name: nm, link, hv });
          C.updateCard(c, vs, g === 'both', ids);
          DB.cards.push(c); DB.order[cat].push(c.id); n++;
        }
      }
      log('Витрина', `Добавлено по ссылкам: ${n}`); await save(); render();
      prog('#aProg', `Добавлено карточек: ${n}.${bad.length ? ' Не найден цвет: ' + bad.join(', ') : ''}`);
    } catch (e) { prog('#aProg', e.message); }
  };
});

// ---------- обновить цены и остатки ----------
$('#bUpdate').onclick = runUpdate;
async function runUpdate(auto) {
  if (busy) return null; if (!DB.cards.length) return auto ? null : migrate(); let res = null;
  busy = true; modal('<h2>Обновление цен и остатков</h2><div class="progress" id="uProg">Снимаю цены и наличие у 4Partners…</div><div id="uOut"></div>');
  try {
    const list = DB.cards.filter(c => c.link), links = [...new Set(list.map(c => c.link))];
    const data = await N.fetch4P(links, (a, b) => prog('#uProg', `Снимаю цены и наличие у 4Partners: ${a} из ${b}…`));
    if (links.filter(l => data[l] && data[l].vs && data[l].vs.some(v => v.price)).length < links.length * 0.5) throw new Error('У большинства товаров нет цен — войдите на store.4partners.io и повторите');
    const ids = C.idState(DB);
    // перепроверка тех, кто распродался бы целиком
    const suspect = list.filter(c => { if (!C.liveSizes(c).length) return false; const copy = JSON.parse(JSON.stringify(c)); const r = C.updateCard(copy, data[c.link] && data[c.link].vs, C.hasTwin(DB, c), C.idState(DB)); return !r.error && !copy.sizes.some(s => s.stock); }).map(c => c.link);
    if (suspect.length) { prog('#uProg', 'Перепроверяю распродавшиеся модели…'); Object.assign(data, await N.fetch4P([...new Set(suspect)])); }
    DB.undo = JSON.stringify(DB.cards);
    const before = { live: DB.cards.reduce((a, c) => a + C.liveSizes(c).length, 0), sold: DB.cards.filter(c => c.status.soldOutSince).length };
    const R = { changes: [], added: [], errors: [], notes: [], soldOut: [], back: [] };
    for (const c of list) {
      const d = data[c.link], r = C.updateCard(c, d && d.status === 200 ? d.vs : null, C.hasTwin(DB, c), ids);
      if (r.error) { c.status.error = r.error; R.errors.push(`${c.name} (${C.catName(c.cat)}): ${r.error}`); continue; }
      R.changes.push(...r.changes); R.added.push(...r.added); r.notes.forEach(n => R.notes.push(c.name + ': ' + n));
      if (r.soldOut) R.soldOut.push(c.name); if (r.back) R.back.push(c.name);
    }
    const after = { live: DB.cards.reduce((a, c) => a + C.liveSizes(c).length, 0), sold: DB.cards.filter(c => c.status.soldOutSince).length };
    DB.lastUpdate = new Date().toISOString(); DB.lastReport = { at: DB.lastUpdate, before, after, R };
    const pr = R.changes.filter(c => c.oSt && c.nSt && c.oJ !== c.nJ);
    log('Цены', `Цен изменилось ${pr.length}, закончилось ${R.changes.filter(c => c.oSt && !c.nSt).length}, появилось ${R.changes.filter(c => !c.oSt && c.nSt).length}, новых размеров ${R.added.length}, ошибок ${R.errors.length}`);
    await save(); render(); prog('#uProg', ''); showReport(DB.lastReport, true);
    const up = pr.filter(c => c.nJ > c.oJ).length;
    const t = [`🔄 ${auto ? 'Автообновление: ' : ''}цены и остатки обновлены`, `Цена изменилась: ${pr.length}${pr.length ? ` (↑${up} ↓${pr.length - up})` : ''}`, `Закончилось размеров: ${R.changes.filter(c => c.oSt && !c.nSt).length}, появилось: ${R.changes.filter(c => !c.oSt && c.nSt).length}${R.added.length ? `, новых: ${R.added.length}` : ''}`];
    if (R.soldOut.length) t.push(`🔴 Распродались целиком: ${R.soldOut.join(', ')} — пора менять (задание в «Распроданных»)`);
    if (R.back.length) t.push(`🟢 Вернулись в продажу: ${R.back.join(', ')}`);
    if (R.errors.length) t.push(`⚠️ Не обновились: ${R.errors.length} (данные не тронуты)`);
    // итог по TgShop добавляется последней строкой; при автовыгрузке сообщение уходит после неё — одним письмом
    if (auto && DB.settings.autoMode === 'export') res = { R, pr, text: t };
    else { t.push(auto ? '\n📦 TgShop: витрина НЕ выгружена ⏸ (в настройках «только обновить»)' : '\n📦 TgShop: витрина НЕ выгружена — нажмите «Выгрузить на витрину»'); notify(t.join('\n')); res = { R, pr }; }
  } catch (e) { prog('#uProg', ''); $('#uOut').innerHTML = `<div class="msg bad">${h(e.message)}</div><div class="acts"><button id="uOk">Закрыть</button></div>`; $('#uOk').onclick = closeModal; if (auto) notify(`❌ Автообновление не прошло: ${e.message}\n\n📦 TgShop: витрина НЕ выгружена`); }
  busy = false; return res;
}
function showReport(rep, fresh) {
  const { before: b, after: a, R } = rep, P0 = P();
  const pr = R.changes.filter(c => c.oSt && c.nSt && c.oJ !== c.nJ), up = pr.filter(c => c.nJ > c.oJ).length;
  const ended = R.changes.filter(c => c.oSt && !c.nSt), appeared = R.changes.filter(c => !c.oSt && c.nSt), big = pr.filter(c => Math.abs(c.nJ - c.oJ) / c.oJ >= 0.05);
  const avg = pr.length ? (pr.reduce((s, c) => s + (c.nJ - c.oJ) / c.oJ, 0) / pr.length * 100).toFixed(1) : '0';
  const cl = c => c === '1016' ? 'Д' : 'П', line = c => `${h(c.name)} ${cl(c.cat)} ${h(c.sz)}`;
  let html = `<table class="t"><tr><th>Показатель</th><th>Было</th><th>Стало</th></tr><tr><td>Размеров в продаже</td><td class="n">${fmt(b.live)}</td><td class="n">${fmt(a.live)}</td></tr><tr><td>Распроданных карточек</td><td class="n">${b.sold}</td><td class="n">${a.sold}</td></tr><tr><td>Изменений цены</td><td>—</td><td class="n">${pr.length} (↑${up}, ↓${pr.length - up}, в среднем ${avg}%)</td></tr><tr><td>Закончилось / появилось размеров</td><td>—</td><td class="n">${ended.length} / ${appeared.length}</td></tr><tr><td>Новых размеров добавлено</td><td>—</td><td class="n">${R.added.length}</td></tr></table>`;
  if (R.errors.length) html += `<div class="msg bad"><b>Не обновились (данные не тронуты):</b><br>${R.errors.map(h).join('<br>')}</div>`;
  if (rep.stray && rep.stray.length) html += `<div class="msg warn">На витрине TgShop есть товары, которых нет в кабинете: ${rep.stray.map(h).join(', ')}. При полной выгрузке они будут удалены.</div>`;
  if (R.soldOut.length) html += `<div class="msg warn"><b>Распродались целиком:</b> ${R.soldOut.map(h).join(', ')} — останутся на витрине с остатком 0.</div>`;
  if (R.back.length) html += `<div class="msg ok"><b>Вернулись в продажу:</b> ${R.back.map(h).join(', ')}</div>`;
  if (R.notes.length) html += `<div class="msg warn">${R.notes.map(h).join('<br>')}</div>`;
  if (big.length) html += `<details open><summary>Цена изменилась на 5% и больше — ${big.length}</summary>${big.map(c => `${line(c)}: ${fmt(c.oJ + P0)} → ${fmt(c.nJ + P0)} ₽ (${((c.nJ - c.oJ) / c.oJ * 100).toFixed(1)}%)`).join('<br>')}</details>`;
  if (ended.length) html += `<details><summary>Закончились — ${ended.length}</summary>${ended.map(line).join('<br>')}</details>`;
  if (appeared.length) html += `<details><summary>Появились — ${appeared.length}</summary>${appeared.map(line).join('<br>')}</details>`;
  if (R.added.length) html += `<details><summary>Новые размеры — ${R.added.length}</summary>${R.added.map(line).join('<br>')}</details>`;
  modal(`<h2>Цены и остатки — ${dstr(rep.at)}</h2>${html}<div class="acts"><button id="rUndo" ${DB.undo ? '' : 'disabled'}>Откатить</button><button id="rXlsx">Отчёт .xlsx</button><span style="flex:1"></span><button id="rClose">Закрыть</button><button class="primary" id="rExp">Выгрузить на витрину</button></div>`, root => {
    root.querySelector('#rClose').onclick = closeModal; root.querySelector('#rExp').onclick = openExport;
    root.querySelector('#rUndo').onclick = async () => { if (!confirm('Вернуть карточки к состоянию до обновления?')) return; DB.cards = JSON.parse(DB.undo); DB.undo = null; log('Цены', 'Откат обновления'); await save(); render(); closeModal(); };
    root.querySelector('#rXlsx').onclick = () => {
      const rows = [['Модель', 'Д/П', 'Размер', 'Было, ₽', 'Стало, ₽', 'Изменение, %', 'Событие']];
      for (const c of R.changes) rows.push([c.name, cl(c.cat), c.sz, c.oJ ? c.oJ + P0 : '', c.nJ ? c.nJ + P0 : '', c.oSt && c.nSt && c.oJ ? +((c.nJ - c.oJ) / c.oJ * 100).toFixed(1) : '', c.oSt && !c.nSt ? 'закончился' : !c.oSt && c.nSt ? 'появился' : 'цена']);
      for (const c of R.added) rows.push([c.name, cl(c.cat), c.sz, '', c.nJ + P0, '', 'новый размер']);
      const sum = [['Показатель', 'Было', 'Стало'], ['Размеров в продаже', b.live, a.live], ['Распроданных', b.sold, a.sold], ['Изменений цены', '', pr.length], ['Закончилось', '', ended.length], ['Появилось', '', appeared.length], ['Новых размеров', '', R.added.length], ['Ошибок', '', R.errors.length]];
      download(writeXlsx([{ name: 'Итог', rows: sum, widths: [30, 12, 12] }, { name: 'Изменения', rows, widths: [32, 6, 8, 10, 10, 12, 14] }]), `Автообновление витрины ${new Date().toLocaleDateString('ru-RU')}.xlsx`);
    };
  });
}
function download(bytes, name) { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([bytes], { type: 'application/octet-stream' })); a.download = name.replace(/[\\/:*?"<>|]/g, '-'); document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000); }

// ---------- выгрузка ----------
// Сравнение файла с прошлой выгрузкой из кабинета (TgShop — следствие, его не спрашиваем)
function snapOf(rows) { const groups = {}, skus = {}; for (const r of rows) { groups[r[1]] = r[3]; skus[r[2]] = [+r[4], +r[10]]; } return { groups, skus }; }
function diffLast(rows, snap) {
  const d = { known: !!snap, addGroups: new Set(), delGroups: new Set(), price: 0, stock0: 0, stock5: 0, addSku: 0, delSku: 0 }; if (!snap) return d;
  const now = snapOf(rows);
  for (const g in now.groups) if (!(g in snap.groups)) d.addGroups.add(g);
  for (const g in snap.groups) if (!(g in now.groups)) d.delGroups.add(g);
  for (const k in now.skus) { const o = snap.skus[k], n = now.skus[k]; if (!o) { d.addSku++; continue; } if (o[0] !== n[0]) d.price++; if (o[1] !== n[1]) n[1] ? d.stock5++ : d.stock0++; }
  for (const k in snap.skus) if (!(k in now.skus)) d.delSku++;
  return d;
}
$('#bExport').onclick = openExport;
function fileBytes(rows) { return writeXlsx([{ name: 'Категории', rows: [['ID подкатегории', 'ID корневой', 'Название категории'], [1015, '', 'парням'], [1016, '', 'девушкам']] }, { name: 'Товары', rows: [C.HEADER, ...rows.map(r => r.map((v, i) => i === 0 ? +v : v))] }]); }
async function openExport(auto) {
  if (busy) return null; busy = true; let plan = null;
  modal('<h2>Выгрузка на витрину</h2><div class="progress" id="xProg">Собираю файл…</div><div id="xOut" style="display:flex;flex-direction:column;flex:1"></div>');
  try {
    const b = C.buildRows(DB), errs = C.validate(b.rows); const I = b.info;
    if (I.noLink.length) errs.unshift('нет ссылки 4Partners у включённых карточек: ' + I.noLink.join(', '));
    const L = DB.lastExport, d = diffLast(b.rows, L && L.snap), items = null;
    const warn = [];
    if (L && b.rows.length < L.rows * (1 - DB.settings.dropThreshold / 100)) warn.push(`строк ${b.rows.length} — на ${DB.settings.dropThreshold}%+ меньше прошлой выгрузки (${L.rows})`);
    if (auto && d.known && d.delGroups.size > 5) warn.push(`с витрины уйдёт ${d.delGroups.size} товаров — проверьте сверку с Figma`);
    let html = `<div class="msg ${errs.length ? 'bad' : ''}">В файле ${b.rows.length} строк (${b.rows.filter(r => r[10] === 5).length} в продаже, ${b.rows.filter(r => r[10] === 0).length} с остатком 0), товаров ${b.groups}</div>`;
    if (errs.length) html += `<div class="msg bad"><b>Загрузка невозможна:</b><br>${errs.slice(0, 30).map(h).join('<br>')}</div>`;
    if (warn.length) html += `<div class="msg warn">${warn.map(h).join('<br>')}</div>`;
    if (d.known) {
      html += `<div class="cap">С прошлой выгрузки (${dstr(L.at)})</div><table class="t"><tr><td>Новые товары</td><td class="n">${d.addGroups.size}</td></tr><tr><td>Уйдут с витрины</td><td class="n">${d.delGroups.size}</td></tr><tr><td>Цена изменится</td><td class="n">${d.price} SKU</td></tr><tr><td>Остаток станет 0 / станет 5</td><td class="n">${d.stock0} / ${d.stock5}</td></tr><tr><td>Новых размеров / убранных</td><td class="n">${d.addSku} / ${d.delSku}</td></tr></table>`;
      if (d.delGroups.size) html += `<div class="cap">Уйдут с витрины</div><div class="list">${[...d.delGroups].map(g => `<span>${h(L.snap.groups[g] || g)}</span>`).join('')}</div>`;
    } else html += `<div class="msg">Это первая выгрузка из кабинета 4.0 — сравнивать пока не с чем.</div>`;
    if (I.sold.length) html += `<div class="msg">Распроданные, с остатком 0: ${I.sold.map(h).join(', ')}</div>`;
    if (I.noPhoto.length) html += `<div class="msg warn">Без фото: ${I.noPhoto.map(h).join(', ')}</div>`;
    if (I.anomalies.length) html += `<div class="cap">Скрыты из-за аномальной цены</div><div class="list">${I.anomalies.map(x => `<span>${h(x)}</span>`).join('')}</div>`;
    if (I.off.length) html += `<div class="cap">Выключенные карточки</div><div class="list">${I.off.map(x => `<span>${h(x)}</span>`).join('')}</div>`;
    html += `<div class="acts"><button class="primary" id="xGo" ${errs.length ? 'disabled' : ''}>загрузить в TgShop</button><button id="xDl">скачать .xlsx</button></div>`;
    prog('#xProg', ''); $('#xOut').innerHTML = html;
    $('#xDl').onclick = () => download(fileBytes(b.rows), `Экспорт ${new Date().toLocaleDateString('ru-RU')} Каталог.xlsx`);
    $('#xGo').onclick = () => { if (warn.length && !confirm('Внимание:\n' + warn.join('\n') + '\n\nЗагрузить?')) return; upload(b, items); };
    plan = { b, errs, warn, d };
  } catch (e) { prog('#xProg', ''); $('#xOut').innerHTML = `<div class="msg bad">${h(e.message)}</div><div class="acts"><button id="xClose">Закрыть</button></div>`; $('#xClose').onclick = closeModal; plan = { fail: e.message }; }
  busy = false; return plan;
}
async function upload(b, items, auto) {
  if (busy) return false; busy = true; let done = false; $('#xGo').disabled = true; const out = $('#xOut');
  const say = (cls, t) => { out.insertAdjacentHTML('afterbegin', `<div class="msg ${cls}">${t}</div>`); $('#dlgBody').scrollTop = 0; };
  const dPrev = diffLast(b.rows, DB.lastExport && DB.lastExport.snap);   // что меняется относительно прошлой выгрузки — для отчёта
  try {
    const urls = [...new Set(b.rows.flatMap(r => String(r[5]).split(',')))].filter(u => !(DB.photoOk || []).includes(u));
    if (urls.length) { const img = await N.checkImages(urls, (a, n) => prog('#xProg', `Проверяю новые фото: ${a} из ${n}…`)); if (img.bad.length) throw new Error(`Не открываются фото (${img.bad.length}) — TgShop их не скачает:<br>${img.bad.slice(0, 5).map(h).join('<br>')}`); DB.photoOk = [...new Set([...(DB.photoOk || []), ...urls])].slice(-5000); }
    const name = `Экспорт ${new Date().toLocaleDateString('ru-RU')} ${new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }).replace(':', '-')} Каталог.xlsx`;
    prog('#xProg', 'Загружаю файл в TgShop…');
    await N.tgUpload(DB.settings.shopId, fileBytes(b.rows), name, 'DELETE_MISSING', 'DELETE_MISSING');
    const det = await N.tgWaitImport(DB.settings.shopId, name, s => prog('#xProg', `TgShop обрабатывает файл… ${s} с`));
    const bad = (det.errorGroups || []).filter(g => !/Габариты и вес/.test(g.message));
    say(bad.length || det.successCount !== det.totalCount ? 'bad' : 'ok', `Импорт: ${det.successCount} из ${det.totalCount}. ${h(det.jobStateDescription || '')}${bad.length ? '<br>' + bad.map(g => h(`${g.message}: ${g.count}`)).join('<br>') : ''}`);
    if (bad.length || det.successCount !== det.totalCount) throw new Error('TgShop принял файл с ошибками');
    prog('#xProg', 'Сверяю витрину…');
    const { items, cards } = await N.tgShowcase(DB.settings.shopId, (a, n) => prog('#xProg', `Сверяю витрину: ${a} из ${n}…`));
    const keys = cards.flatMap(c => c.skus.map(s => [s.externalId, c.externalId, s.price, s.amount, s.priority, (s.images || []).length].join('|')));
    const okHash = C.hashKeys(keys) === C.hashKeys(b.rows.map(C.rowKey)), okGroups = items.length === b.groups;
    const noimg = cards.reduce((a, c) => a + c.skus.filter(s => !(s.images || []).length).length, 0);
    const cdn = await N.checkImages([...new Set(cards.flatMap(c => c.skus.flatMap(s => (s.images || []).map(i => i.url + '?previewSize=240'))))], (a, n) => prog('#xProg', `Проверяю фото на витрине: ${a} из ${n}…`));
    const ok = okHash && okGroups && !noimg && !cdn.bad.length;
    say(ok ? 'ok' : 'bad', `${ok ? '<b>Витрина совпадает с файлом.</b>' : '<b>Есть расхождения.</b>'} Товаров ${items.length} (в файле ${b.groups}), SKU ${keys.length} (в файле ${b.rows.length}), контрольная сумма ${okHash ? 'совпала' : 'не совпала'}, без фото ${noimg}, фото открываются ${cdn.ok}${cdn.bad.length ? ', не открываются ' + cdn.bad.length : ''}.`);
    if (ok) DB.lastExport = { at: new Date().toISOString(), rows: b.rows.length, groups: b.groups, name, snap: snapOf(b.rows) };
    log('Выгрузка', `${b.rows.length} строк, ${b.groups} товаров, сверка ${ok ? 'OK' : 'с расхождениями'}`); await save(); render();
    const msg = ok ? `📦 TgShop: витрина выгружена ✅ и сошлась с кабинетом (${b.groups} товаров, ${b.rows.length} SKU)` : `📦 TgShop: витрина выгружена, но есть расхождения ⚠️ — откройте кабинет (${b.groups} товаров, ${b.rows.length} SKU)`;
    if (auto) done = msg;
    else {
      const t = ['🚀 Выгрузка вручную'];
      if (dPrev.known) {
        const ch = [];
        if (dPrev.price) ch.push(`цена изменилась: ${dPrev.price} SKU`);
        if (dPrev.stock0) ch.push(`закончилось: ${dPrev.stock0} SKU`);
        if (dPrev.stock5) ch.push(`появилось: ${dPrev.stock5} SKU`);
        if (dPrev.addGroups.size) ch.push(`новых товаров: ${dPrev.addGroups.size}`);
        if (dPrev.delGroups.size) ch.push(`ушло с витрины: ${dPrev.delGroups.size}`);
        if (dPrev.addSku || dPrev.delSku) ch.push(`размеров добавлено/убрано: ${dPrev.addSku}/${dPrev.delSku}`);
        t.push(ch.length ? 'С прошлой выгрузки: ' + ch.join(', ') : 'С прошлой выгрузки ничего не поменялось');
      }
      if (DB.lastUpdate) t.push(`Цены и остатки сняты у 4Partners: ${dstr(DB.lastUpdate)}`);
      notify([...t, '', msg].join('\n'));
    }
    prog('#xProg', 'Порядок на самой витрине проверьте в Telegram, кнопка «Каталог».'); if (!auto) done = ok;
  } catch (e) { prog('#xProg', ''); say('bad', h(e.message).replace(/&lt;br&gt;/g, '<br>')); const msg = `📦 TgShop: витрина НЕ выгружена ❌ — ${e.message.replace(/<br>/g, ' ')}`; if (auto) done = msg; else notify(msg); }
  busy = false; return done;
}

// ---------- наценка ----------
function renderMarkup() {
  if ($('#mkRows').contains(document.activeElement)) return;
  const L = DB.settings.markupLines;
  $('#mkRows').innerHTML = L.map((l, i) => `<div class="mkrow"><div class="field" style="margin:0"><span class="lab"><input data-i="${i}" data-k="label" value="${h(l.label)}" placeholder="Подпись, например «Доставка»"></span><input class="uline" data-i="${i}" data-k="amount" inputmode="numeric" value="RUB ${fmt(l.amount)}"></div><button class="del" data-del="${i}" title="Убрать строку">×</button></div>`).join('');
  $('#mkTotal').textContent = 'RUB ' + fmt(P());
  $$('#mkRows input[data-k=amount]').forEach(el => { el.onfocus = () => { el.value = L[+el.dataset.i].amount; }; el.onblur = () => { L[+el.dataset.i].amount = +String(el.value).replace(/[^\d-]/g, '') || 0; el.value = 'RUB ' + fmt(L[+el.dataset.i].amount); $('#mkTotal').textContent = 'RUB ' + fmt(P()); }; });
  $$('#mkRows input[data-k=label]').forEach(el => el.oninput = () => { L[+el.dataset.i].label = el.value; });
  $$('#mkRows [data-del]').forEach(el => el.onclick = () => { L.splice(+el.dataset.del, 1); renderMarkup(); });
}
$('#mkAdd').onclick = () => { DB.settings.markupLines.push({ label: 'Наценка', amount: 0 }); renderMarkup(); };
$('#mkSave').onclick = async () => { document.activeElement && document.activeElement.blur(); log('Наценка', `Итого ${P()} ₽`); await save(); renderMarkup(); renderGrid(); flash('#mkSave', 'сохранено'); };
function flash(sel, t) { const el = $(sel), was = el.dataset.t || el.textContent; el.dataset.t = was; el.textContent = t; setTimeout(() => el.textContent = was, 1500); }

// ---------- распроданные, журнал ----------
function renderSold() {
  const s = DB.cards.filter(c => c.enabled && c.status.soldOutSince);
  $('#soldList').innerHTML = s.length ? `<table class="tbl" style="margin-bottom:34px"><tr><th>Карточка</th><th>Раздел</th><th>Был</th><th>Обновлений подряд</th></tr>${s.map(c => `<tr><td><a href="${h(C.keyOf(c))}" target="_blank" style="color:inherit;text-decoration:none">${h(c.name)}</a></td><td>${C.catName(c.cat)}</td><td>${c.status.soldOutSince.split('-').reverse().join('.')}</td><td>${c.status.soldRuns || 1}</td></tr>`).join('')}</table>` : '<p class="dim" style="margin:0 0 34px">Распроданных нет 🎉</p>';
  $('#task').value = C.staffTask(DB);
}
$('#taskCopy').onclick = async () => { await navigator.clipboard.writeText($('#task').value); flash('#taskCopy', 'скопировано'); };
function renderLog() { $('#logList').innerHTML = DB.history.length ? `<table class="tbl"><tr><th>Дата</th><th>Тип</th><th>Статус</th></tr>${DB.history.map(x => `<tr><td style="white-space:nowrap">${new Date(x.at).toLocaleString('ru-RU')}</td><td>${h(x.kind)}</td><td>${h(x.text)}</td></tr>`).join('')}</table>` : '<p class="dim">Пока пусто.</p>'; }

// ---------- настройки ----------
const FIELDS = [['§', 'Тексты товаров'], ['fullDesc', 'Полное описание', 'area'], ['shortDesc', 'Краткое описание', 'area'], ['attrs', 'Характеристики', 'area'], ['sizeGrid', 'Размерная сетка', 'area'],
  ['§', 'TgShop'], ['shopId', 'ID магазина'], ['dropThreshold', 'Стоп, если строк меньше прошлой выгрузки на, %', 'number'],
  ['§', 'Figma'], ['figmaToken', 'Личный токен Figma', 'password'], ['figmaUrl', 'Ссылка на страницу Figma «> Актуальная витрина»'],
  ['§', 'GitHub'], ['ghToken', 'Токен GitHub', 'password'], ['ghPhotos', 'Репозиторий для фото'], ['ghBackup', 'Репозиторий для копии'], ['ghBranch', 'Ветка'],
  ['§', 'Telegram для уведомлений'], ['tgBot', 'Токен бота', 'password'], ['tgChat', 'Чат ID'],
  ['§', 'Автоматизация'], ['autoOn', 'автообновление', 'check'], ['autoTimes', 'Во сколько (через запятую, время ноутбука)'], ['autoMode', 'После обновления', 'select', [['update', 'только обновить и прислать итог — выгружу сам'], ['export', 'сразу выгрузить на витрину, если нет ошибок']]],
  ['§', 'Перенос (разово)'], ['sheetId', 'Google Таблица старого каталога (ID)'], ['sheetGid', 'gid листа «Матрица»']];
const TG_ROW = [$('#tgFind').parentElement, $('#tgProg')];   // ссылки Telegram переносятся внутрь формы при каждой отрисовке
function renderSettings() {
  if ($('#setForm').contains(document.activeElement)) return;
  $('#setForm').innerHTML = FIELDS.map(([k, l, t, opts]) => k === '§' ? `<h3>${l}</h3>` : t === 'check' ? `<div class="field"><label class="chk"><input name="${k}" type="checkbox" ${DB.settings[k] ? 'checked' : ''}> ${l}</label></div>` : `<div class="field"><span class="lab">${l}</span>` + (t === 'area' ? `<textarea name="${k}" rows="2">${h(DB.settings[k])}</textarea>` : t === 'select' ? `<select name="${k}">${opts.map(([v, n]) => `<option value="${v}" ${DB.settings[k] === v ? 'selected' : ''}>${n}</option>`).join('')}</select>` : `<input class="uline" name="${k}" type="${t || 'text'}" value="${h(DB.settings[k])}" autocomplete="off">`) + '</div>').join('');
  // ссылки Telegram — сразу под разделом Telegram, как в макете
  const chat = $('#setForm [name=tgChat]').closest('.field'); chat.after(TG_ROW[1]); chat.after(TG_ROW[0]);
  renderUsers();
}
$('#setSave').onclick = async () => {
  for (const k of ['ghPhotos', 'ghBackup']) { const v = $(`#setForm [name=${k}]`).value.trim(); if (v && !/^[\w.-]+\/[\w.-]+$/.test(v)) return prog('#setProg', `Поле «${k === 'ghPhotos' ? 'Репозиторий для фото' : 'Репозиторий для копии'}»: нужно название вида владелец/имя (например avtomonov-design/context-store-photos), а не ${/^github_pat_|^ghp_/.test(v) ? 'токен' : 'ссылка'}`); }
  ghPreflight.ok = false; for (const [k, , t] of FIELDS) { if (k === '§') continue; const el = $(`#setForm [name=${k}]`); DB.settings[k] = t === 'number' ? +el.value : t === 'check' ? el.checked : el.value.trim(); } storePhoto.have = null; await save(); prog('#setProg', 'Настройки сохранены'); renderStatus(); await applyAuto(true); };
$('#bkGh').onclick = () => backupGh(false);
$('#tgFind').onclick = tgFindChat; $('#tgTest').onclick = tgTest;
function tgSay(t, kind = 'info') { const el = $('#tgProg'); el.className = 'note ' + kind; el.textContent = t; }
async function tgFindChat() {
  const tok = $('#setForm [name=tgBot]').value.trim().replace(/^bot/i, '').replace(/\s+/g, '');
  if (!tok) return tgSay('Сначала вставьте токен бота в поле «Токен своего бота» 👆', 'warn');
  if (!/^\d+:[\w-]{30,}$/.test(tok)) return tgSay('Это не похоже на токен бота. Он выглядит так: 123456789:AAH…, скопируйте его из @BotFather целиком', 'warn');
  tgSay('Ищу ваш чат с ботом… ⏳');
  try {
    const me = await N.bridge('fetch', { url: `https://api.telegram.org/bot${tok}/getMe` }, 20000);
    if (!me.ok) return tgSay('Telegram не принял токен — проверьте, что скопировали его целиком', 'bad');
    const r = await N.bridge('fetch', { url: `https://api.telegram.org/bot${tok}/getUpdates` }, 20000);
    const ups = ((r.data && r.data.result) || []).map(u => (u.message || u.my_chat_member || u.edited_message || {}).chat).filter(Boolean);
    const c = ups.reverse().find(x => x.type === 'private');
    if (!c) return tgSay(`Бот @${me.data.result.username} на месте, но не вижу ваших сообщений. Откройте его в Telegram, нажмите «Старт» (или напишите любое слово) и нажмите кнопку ещё раз`, 'warn');
    $('#setForm [name=tgChat]').value = c.id;
    DB.settings.tgBot = tok; DB.settings.tgChat = String(c.id); await save();
    tgSay(`Нашёл: ${c.first_name || ''}${c.username ? ' @' + c.username : ''} (chat id ${c.id}) и сохранил ✅ Теперь нажмите «Проверить уведомления»`, 'ok');
  } catch (e) { tgSay('Не получилось: ' + e.message, 'bad'); }
}
async function tgTest() {
  const st = DB.settings; if (!st.tgBot || !st.tgChat) return tgSay('Сначала «Найти мой chat id»', 'warn');
  tgSay('Отправляю… ⏳');
  try {
    const r = await N.bridge('fetch', { url: `https://api.telegram.org/bot${st.tgBot}/sendMessage`, method: 'POST', headers: { 'Content-Type': 'application/json' }, body: { text: JSON.stringify({ chat_id: st.tgChat, text: 'Кабинет витрины на связи ✅ Сюда будут приходить итоги обновления цен и выгрузки.' }) } }, 20000);
    r.ok ? tgSay('Отправил — проверьте Telegram 🎉', 'ok') : tgSay('Telegram ответил ошибкой: ' + ((r.data && r.data.description) || r.status), 'bad');
  } catch (e) { tgSay('Не получилось: ' + e.message, 'bad'); }
}
$('#bkGhLoad').onclick = async () => { try { const st = DB.settings; const d = JSON.parse(new TextDecoder().decode(await N.ghRead(st.ghToken, st.ghBackup, st.ghBranch, 'backup/db.json'))); if (!confirm(`Восстановить копию: ${d.cards.length} карточек? Текущие данные будут заменены.`)) return; DB = { ...DB, ...d, settings: { ...DEFAULTS, ...d.settings } }; await save(); render(); prog('#setProg', 'Восстановлено с GitHub'); } catch (e) { prog('#setProg', e.message); } };
$('#bkFile').onclick = () => { const { undo, sessions, ...rest } = DB; rest.settings = { ...rest.settings, figmaToken: '', ghToken: '', tgBot: '' }; download(new TextEncoder().encode(JSON.stringify(rest)), `Кабинет витрины — копия ${new Date().toLocaleDateString('ru-RU')}.json`); };
$('#bkLoad').onchange = async e => { const f = e.target.files[0]; if (!f) return; try { const d = JSON.parse(await f.text()); if (!Array.isArray(d.cards)) throw new Error('Это не копия кабинета 2.0'); if (!confirm(`Восстановить ${d.cards.length} карточек?`)) return; const keep = { figmaToken: DB.settings.figmaToken, ghToken: DB.settings.ghToken, tgBot: DB.settings.tgBot }; DB = { ...DB, ...d, settings: { ...DEFAULTS, ...d.settings } }; for (const k in keep) if (!DB.settings[k]) DB.settings[k] = keep[k]; await save(); render(); } catch (er) { alert(er.message); } e.target.value = ''; };

// ---------- автоматизация ----------
let BRIDGE_V = '';
const autoTimes = () => String(DB.settings.autoTimes || '').split(/[,;\s]+/).map(x => x.trim()).filter(x => /^\d{1,2}:\d{2}$/.test(x)).map(x => x.padStart(5, '0'));
const vOk = (v, need) => { const a = String(v).split('.').map(Number), b = need.split('.').map(Number); for (let i = 0; i < 3; i++) { if ((a[i] || 0) !== b[i]) return (a[i] || 0) > b[i]; } return true; };
async function applyAuto(say) {
  const on = DB.settings.autoOn, times = autoTimes();
  if (on && !times.length) { say && tgSay('Укажите время автообновления, например 10:00, 19:00', 'warn'); return; }
  if (!vOk(BRIDGE_V, '3.1.0')) { if (on && say) tgSay(`Автообновление включено, но мост ${BRIDGE_V} не умеет будить кабинет: пока оно сработает, только если вкладка кабинета открыта. Обновите мост до 3.1.0 — и всё заработает само.`, 'warn'); return; }
  if (on && say) { const s0 = dueSlot(); if (s0) { DB.lastAutoSlot = s0; await save(); } }   // не срабатывать сразу при включении
  try { await N.bridge('schedule', { on, times }); if (say) tgSay(on ? `🤖 Автообновление включено: каждый день в ${times.join(', ')}${DB.settings.autoMode === 'export' ? ' с выгрузкой на витрину' : ''}. Chrome должен быть открыт, ноутбук — не спать (если спал, догоню после пробуждения в течение 3 часов).` : 'Автообновление выключено', on ? 'ok' : 'info'); }
  catch (e) { say && tgSay('Не получилось включить расписание: ' + e.message, 'bad'); }
}
function dueSlot() {
  if (!DB.settings.autoOn) return null; const now = new Date();
  for (const t of autoTimes().reverse()) {
    const [hh, mm] = t.split(':').map(Number), d = new Date(now); d.setHours(hh, mm, 0, 0);
    const key = d.toISOString().slice(0, 10) + ' ' + t;
    if (d <= now && now - d < 3 * 3600 * 1000) return DB.lastAutoSlot === key ? null : key;
  }
  return null;
}
async function autoCheck() {
  const slot = dueSlot(); if (!slot || busy || autoCheck.running) return false;
  autoCheck.running = true; DB.lastAutoSlot = slot; await save();
  try {
    log('Авто', 'Запуск ' + slot.slice(11) + (DB.settings.autoMode === 'export' ? ' (обновить и выгрузить)' : ' (только обновить)'));
    const r = await runUpdate(true);
    if (r && DB.settings.autoMode === 'export') {
      const plan = await openExport(true);
      const why = plan.fail ? [plan.fail] : [...plan.errs, ...plan.warn]; if (r.R.errors.length) why.push(`не обновились ${r.R.errors.length} карточек`);
      let tail;
      if (why.length) { tail = `📦 TgShop: витрина НЕ выгружена ⏸ — нужна ваша проверка:\n${why.slice(0, 6).join('\n')}\nОткройте кабинет → «Выгрузить на витрину»`; log('Авто', 'Выгрузка остановлена: ' + why.join('; ')); await save(); }
      else tail = await upload(plan.b, null, true) || '📦 TgShop: витрина НЕ выгружена ❌ — откройте кабинет';
      notify([...r.text, '', tail].join('\n'));
    }
    DB.lastAuto = { at: new Date().toISOString(), slot, ok: !!r }; await save(); render();
  } finally { autoCheck.running = false; }
  return true;
}
window.addEventListener('message', e => { if (e.source === window && e.data && e.data.__kab === 'autoTick') autoCheck(); });
setInterval(() => { if (DB.cards.length) autoCheck(); }, 60000);

// ---------- короткий бегунок прокрутки (6×59, как в макете) и плавная прокрутка колесом ----------
function makeThumb(box, th, pad = 70) {
  const upd = () => { if (!th.offsetParent) return; const max = box.scrollHeight - box.clientHeight; if (max < 4) return th.classList.remove('on'); th.classList.add('on'); const r = box.getBoundingClientRect(), pr = th.offsetParent.getBoundingClientRect(), track = box.clientHeight - pad * 2 - 59; th.style.top = (r.top - pr.top + pad + track * (box.scrollTop / max)) + 'px'; };
  box.addEventListener('scroll', upd, { passive: true }); new ResizeObserver(upd).observe(box); new MutationObserver(upd).observe(box, { childList: true, subtree: true }); return upd;
}
const thumbs = [makeThumb($('#dlgBody'), $('#pThumb')), makeThumb($('#helpText'), $('#helpThumb'), 90)];
// колесо мыши — плавно; трекпад и так плавный, его не трогаем
function smoothWheel(getEl) {
  let target = null, raf = 0, el = null;
  addEventListener('wheel', e => {
    const box = getEl(e); if (!box || e.ctrlKey) return;
    const mouse = e.deltaMode === 1 || (Math.abs(e.deltaY) >= 50 && Number.isInteger(e.deltaY) && e.deltaX === 0);
    if (!mouse) return;
    e.preventDefault(); const isWin = box === document.scrollingElement;
    if (el !== box) { el = box; target = box.scrollTop; }
    const max = box.scrollHeight - box.clientHeight; target = Math.max(0, Math.min(max, (target ?? box.scrollTop) + e.deltaY * (e.deltaMode === 1 ? 40 : 1)));
    cancelAnimationFrame(raf);
    const step = () => { const cur = box.scrollTop, d = target - cur; if (Math.abs(d) < .5) { box.scrollTop = target; el = null; return; } box.scrollTop = cur + d * .14; raf = requestAnimationFrame(step); };
    if (isWin) document.documentElement.style.scrollBehavior = 'auto'; step();
  }, { passive: false });
}
smoothWheel(e => { const t = e.target; if (t.closest && t.closest('.strip, textarea')) return null; return (t.closest && (t.closest('#dlgBody') || t.closest('#helpText'))) || (document.body.classList.contains('pOpen') || !$('#scrApp').offsetParent ? null : document.scrollingElement); });

// ---------- вход: логин и пароль ----------
// Пользователи и сессии лежат в базе моста (на этом компьютере). Сессия — cookie без срока: живёт до закрытия браузера.
const SESS = 'kab_s';
const cookieGet = () => (document.cookie.match(/(?:^|; )kab_s=([^;]+)/) || [])[1];
const cookieSet = v => { document.cookie = `${SESS}=${v || ''}; path=/kabinet; SameSite=Strict${location.protocol === 'https:' ? '; Secure' : ''}${v ? '' : '; max-age=0'}`; };
const rnd = n => [...crypto.getRandomValues(new Uint8Array(n))].map(b => b.toString(16).padStart(2, '0')).join('');
async function pwHash(pw, salt) {
  const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(pw), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: new TextEncoder().encode(salt), iterations: 150000 }, k, 256);
  return [...new Uint8Array(bits)].map(b => b.toString(16).padStart(2, '0')).join('');
}
let ME = null;
const users = () => DB.users || (DB.users = []);
const shortName = n => { const p = String(n || '').trim().split(/\s+/); return p.length > 1 ? `${p[0]} ${p[1][0]}.` : (p[0] || ''); };
function currentUser() { const t = cookieGet(), s = t && DB.sessions && DB.sessions[t]; return (s && users().find(u => u.login === s.login)) || null; }
async function makeUser(login, name, pw) { const salt = rnd(16); return { login, name: name || login, salt, hash: await pwHash(pw, salt), at: new Date().toISOString() }; }
async function startSession(u) {
  const t = rnd(24); DB.sessions = DB.sessions || {}; DB.sessions[t] = { login: u.login, at: new Date().toISOString() };
  const ks = Object.keys(DB.sessions); if (ks.length > 30) ks.sort((a, b) => DB.sessions[a].at < DB.sessions[b].at ? -1 : 1).slice(0, ks.length - 30).forEach(k => delete DB.sessions[k]);
  cookieSet(t); await save(); ME = u;
}
function showAuth() {
  const first = !users().length;
  closeModal(); $('#scrApp').classList.add('hidden'); screen('scrAuth');
  $('#authHint').textContent = '';
  $('#aName').classList.toggle('hidden', !first);
  $('#aPass').autocomplete = first ? 'new-password' : 'current-password';
  $('#aGo').textContent = first ? 'создать' : 'войти';
  $('#authErr').textContent = ''; $('#scrAuth').classList.remove('err');
  setTimeout(() => $('#aLogin').focus(), 50);
}
function enterApp() {
  screen(null); $('#scrApp').classList.remove('hidden');
  $('#who').textContent = shortName(ME.name); $('#who').title = `${ME.name} (${ME.login}) — нажмите, чтобы выйти`;
  render();
}
const authFail = t => { const sc = $('#scrAuth'); $('#authErr').textContent = t; sc.classList.add('err', 'shake'); setTimeout(() => sc.classList.remove('shake'), 400); };
$('#aPass').oninput = () => { $('#aEye').classList.toggle('hidden', !$('#aPass').value); $('#scrAuth').classList.remove('err'); $('#authErr').textContent = ''; };
$('#aLogin').oninput = () => { $('#scrAuth').classList.remove('err'); $('#authErr').textContent = ''; };
$('#aEye').onclick = () => { const p = $('#aPass'), show = p.type === 'password'; p.type = show ? 'text' : 'password'; $('#aEye img').src = show ? 'img/eye-open.svg' : 'img/eye-closed.svg'; $('#aEye').title = show ? 'Скрыть пароль' : 'Показать пароль'; p.focus(); };
$('#authForm').onsubmit = async e => {
  e.preventDefault();
  const lg = $('#aLogin').value.trim(), pw = $('#aPass').value, first = !users().length;
  if (!lg) return authFail('введите логин');
  if (!pw) return authFail('введите пароль');
  $('#aGo').disabled = true;
  try {
    if (first) {
      if (pw.length < 6) return authFail('пароль — минимум 6 символов');
      const u = await makeUser(lg, $('#aName').value.trim() || lg, pw); users().push(u); log('Вход', `Создан пользователь ${lg}`);
      await startSession(u); return enterApp();
    }
    const u = users().find(x => x.login.toLowerCase() === lg.toLowerCase());
    if (!u || await pwHash(pw, u.salt) !== u.hash) return authFail(u ? 'неверный пароль' : 'нет такого пользователя');
    await startSession(u); $('#aPass').value = ''; enterApp();
  } finally { $('#aGo').disabled = false; }
};
$('#who').onclick = async () => {
  if (!confirm(`Выйти из кабинета (${ME.name})?`)) return;
  const t = cookieGet(); if (t && DB.sessions) delete DB.sessions[t]; cookieSet(''); await save(); ME = null; $('#aLogin').value = ''; $('#aPass').value = ''; showAuth();
};
// пользователи в настройках
function renderUsers() {
  const box = $('#users'); if (!box || box.contains(document.activeElement)) return;
  box.innerHTML = users().map((u, i) => `<div class="userRow" data-i="${i}"><b>${h(u.login)}</b><span>${h(u.name)}${ME && u.login === ME.login ? ' <span class="dim">· это вы</span>' : ''}</span><span style="flex:1"></span><button class="lnk" data-edit="${i}">изменить</button>${ME && u.login === ME.login ? '' : `<button class="lnk bad" data-del="${i}">удалить</button>`}</div>`).join('') +
    `<div class="newUser"><div class="field" style="margin:0"><span class="lab">Логин</span><input class="uline" id="nuLogin" autocomplete="off"></div><div class="field" style="margin:0"><span class="lab">Имя</span><input class="uline" id="nuName" autocomplete="off"></div><div class="field" style="margin:0"><span class="lab">Пароль</span><input class="uline" id="nuPass" type="password" autocomplete="new-password"></div><button class="lnk" id="nuAdd">добавить пользователя</button></div><div class="note" id="uProg2"></div>`;
  const say = (t, k = '') => { const n = $('#uProg2'); n.className = 'note ' + k; n.textContent = t; };
  $('#nuAdd').onclick = async () => {
    const lg = $('#nuLogin').value.trim(), nm = $('#nuName').value.trim(), pw = $('#nuPass').value;
    if (!lg || !pw) return say('нужны логин и пароль', 'warn'); if (pw.length < 6) return say('пароль — минимум 6 символов', 'warn');
    if (users().some(u => u.login.toLowerCase() === lg.toLowerCase())) return say('такой логин уже есть', 'warn');
    users().push(await makeUser(lg, nm, pw)); log('Вход', `Добавлен пользователь ${lg}`); await save(); renderUsers(); say(`Добавлен ${lg} ✅`, 'ok');
  };
  $$('#users [data-del]').forEach(b => b.onclick = async () => { const u = users()[+b.dataset.del]; if (!confirm(`Удалить пользователя ${u.login}?`)) return; DB.users.splice(+b.dataset.del, 1); for (const k in DB.sessions || {}) if (DB.sessions[k].login === u.login) delete DB.sessions[k]; log('Вход', `Удалён пользователь ${u.login}`); await save(); renderUsers(); });
  $$('#users [data-edit]').forEach(b => b.onclick = () => {
    const i = +b.dataset.edit, u = users()[i], row = b.closest('.userRow');
    row.innerHTML = `<b>${h(u.login)}</b><input class="uline" id="euName" value="${h(u.name)}" placeholder="имя" style="max-width:220px"><input class="uline" id="euPass" type="password" placeholder="новый пароль (не обязательно)" autocomplete="new-password" style="max-width:260px"><span style="flex:1"></span><button class="lnk" id="euSave">сохранить</button><button class="lnk" id="euCancel">отмена</button>`;
    row.querySelector('#euCancel').onclick = () => { document.activeElement.blur(); renderUsers(); };
    row.querySelector('#euSave').onclick = async () => {
      const nm = row.querySelector('#euName').value.trim(), pw = row.querySelector('#euPass').value;
      if (pw && pw.length < 6) return say('пароль — минимум 6 символов', 'warn');
      if (nm) u.name = nm; if (pw) { u.salt = rnd(16); u.hash = await pwHash(pw, u.salt); }
      log('Вход', `Изменён пользователь ${u.login}${pw ? ' (новый пароль)' : ''}`); await save(); document.activeElement.blur(); renderUsers();
      if (ME && ME.login === u.login) { ME = u; $('#who').textContent = shortName(u.name); }
      say('Сохранено ✅', 'ok');
    };
  });
}

(async () => {
  const v = await N.hasBridge();
  document.body.classList.remove('booting');
  if (!v) { document.body.innerHTML = `<main style="max-width:640px;margin:60px auto;padding:0 20px;font:18px/1.4 'Arial Narrow','Roboto Condensed',sans-serif;color:#5a5965"><h1>Нужно расширение-мост</h1><p>Кабинет работает через расширение «conтекст store — кабинет витрины (мост)» в этом Chrome: оно ходит в 4Partners и TgShop через ваши входы и хранит базу на этом компьютере.</p><p>Установите его по инструкции и обновите эту страницу.</p><p style="opacity:.6">Если уже установили: откройте chrome://extensions — у расширения должно быть название «…(мост)» и версия 3.1.0 или новее, и оно должно быть включено.</p></main>`; return; }
  $('#ver').textContent = 'кабинет витрины ' + APP_VERSION + ' · мост ' + v;
  BRIDGE_V = v; await load();
  if (DB.settings.autoOn) applyAuto(false);
  if (new URLSearchParams(location.search).get('auto')) {
    // фоновая вкладка расписания: без входа, интерфейс закрыт заставкой
    document.title = '🤖 Автообновление витрины'; $('#autoVeil').classList.remove('hidden'); $('#scrApp').classList.remove('hidden'); render();
    await autoCheck(); setTimeout(() => N.bridge('closeMe').catch(() => { }), 8000); return;
  }
  ME = currentUser(); ME ? enterApp() : showAuth();
  autoCheck();
})();
