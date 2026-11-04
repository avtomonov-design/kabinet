const APP_VERSION = '3.2.0';
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
let CAT = '1016', busy = false;

// ---------- хранение ----------
async function load() { const db2 = await N.dbGet('db2'); if (db2) DB = { ...DB, ...db2, settings: { ...DEFAULTS, ...(db2.settings || {}) } }; if (/UqC8M7ln2Uisxpo1YEMdfh.*node-id=2-34/.test(DB.settings.figmaUrl)) DB.settings.figmaUrl = DEFAULTS.figmaUrl; delete DB.showcase; }
let bkTimer = null;
async function save(quiet) {
  await N.dbSet('db2', DB);
  $('#saved').textContent = 'Сохранено ' + new Date().toLocaleTimeString('ru-RU');
  if (DB.settings.ghToken && DB.settings.ghBackup) { clearTimeout(bkTimer); bkTimer = setTimeout(() => backupGh(true), 60000); }
}
async function backupGh(silent) {
  try { const { undo, ...rest } = DB; await N.ghPut(DB.settings.ghToken, DB.settings.ghBackup, DB.settings.ghBranch, 'backup/db.json', new TextEncoder().encode(JSON.stringify(rest)), 'Резервная копия ' + new Date().toISOString()); if (!silent) prog('#setProg', 'Копия сохранена на GitHub'); DB.lastBackup = new Date().toISOString(); await N.dbSet('db2', DB); }
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
function tab(name) { $$('nav button').forEach(b => b.classList.toggle('on', b.dataset.tab === name)); $$('.tab').forEach(t => t.classList.toggle('on', t.id === name)); render(); }
$$('nav button').forEach(b => b.onclick = () => tab(b.dataset.tab));
$$('#catSeg button').forEach(b => b.onclick = () => { CAT = b.dataset.cat; $$('#catSeg button').forEach(x => x.classList.toggle('on', x === b)); renderGrid(); });

function render() { renderGrid(); renderStatus(); renderMarkup(); renderSold(); renderLog(); renderSettings(); }
function renderStatus() {
  const en = DB.cards.filter(c => c.enabled), sold = en.filter(c => c.status.soldOutSince).length, warn = en.filter(c => C.hints(DB, c, P()).some(x => x[0] === 'bad' || x[0] === 'warn')).length;
  $('#status').innerHTML = `Цены обновлены: <b>${dstr(DB.lastUpdate)}</b> · Выгрузка: <b>${dstr(DB.lastExport && DB.lastExport.at)}</b> · Сверка с Figma: <b>${dstr(DB.lastFigma)}</b> · распроданных ${sold} · с подсказками ${warn} · Авто: <b>${DB.settings.autoOn ? autoTimes().join(', ') + (DB.settings.autoMode === 'export' ? ' + выгрузка' : '') : 'выкл'}</b>`;
  $('#cntW').textContent = DB.order['1016'].length; $('#cntM').textContent = DB.order['1015'].length;
}

// ---------- витрина: сетка карточек ----------
function filtered() {
  Object.defineProperty(DB, '_moved', { value: C.movedCards(DB, CAT), configurable: true, writable: true, enumerable: false });
  const q = $('#q').value.trim().toLowerCase(), f = $('#flt').value;
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
    const tags = C.hints(DB, c, P()).map(([k, t]) => `<span class="tag ${k}">${h(t)}</span>`).join('');
    return `<div class="card ${c.enabled ? '' : 'off'}" draggable="true" data-id="${c.id}"><span class="pos">${i + 1}</span><input type="checkbox" class="switch sw" ${c.enabled ? 'checked' : ''} title="${c.enabled ? 'Выключить' : 'Включить'}"><div class="ph">${ph ? `<img src="${h(ph)}" loading="lazy" alt="">` : 'нет фото'}</div><div class="body"><div class="nm" title="${h(c.name)}">${h(c.name) || '<span class="muted">без названия</span>'}</div><div class="pr">${pr ? (pr[0] === pr[1] ? fmt(pr[0]) : fmt(pr[0]) + ' – ' + fmt(pr[1])) + ' ₽' : '<span class="muted">нет в продаже</span>'}</div><div class="tags">${tags}</div></div></div>`;
  }).join('') || (DB.cards.length ? '<p class="muted">Ничего не найдено</p>' : '');
  const dragOk = !$('#q').value && !$('#flt').value;
  $$('#grid .card').forEach(el => {
    const id = el.dataset.id;
    el.querySelector('.sw').onclick = async e => { e.stopPropagation(); const c = card(id); c.enabled = e.target.checked; log('Витрина', `${c.enabled ? 'Включена' : 'Выключена'} «${c.name}»`); await save(); renderGrid(); renderStatus(); };
    el.onclick = () => editCard(card(id));
    el.draggable = dragOk;
    el.ondragstart = e => { e.dataTransfer.setData('text/plain', id); el.classList.add('drag'); };
    el.ondragend = () => el.classList.remove('drag');
    el.ondragover = e => { e.preventDefault(); const r = el.getBoundingClientRect(), after = e.clientX > r.left + r.width / 2; el.classList.toggle('over-after', after); el.classList.toggle('over-before', !after); };
    el.ondragleave = () => el.classList.remove('over-after', 'over-before');
    el.ondrop = async e => {
      e.preventDefault(); const from = e.dataTransfer.getData('text/plain'); const after = el.classList.contains('over-after'); el.classList.remove('over-after', 'over-before');
      if (!from || from === id) return; const o = DB.order[CAT]; o.splice(o.indexOf(from), 1); o.splice(o.indexOf(id) + (after ? 1 : 0), 0, from);
      log('Порядок', `«${card(from).name}» → место ${o.indexOf(from) + 1}`); await save(); renderGrid();
    };
  });
}
$('#q').oninput = renderGrid; $('#flt').onchange = renderGrid;

// ---------- модальное окно ----------
const dlg = $('#dlg');
function modal(html, onReady) { $('#dlgBody').innerHTML = html; if (!dlg.open) dlg.showModal(); const p = $('#dlgBody .progress[id]'); if (p && p.textContent) PS = { sel: '#' + p.id, t: p.textContent, t0: Date.now() }; onReady && onReady($('#dlgBody')); }
function closeModal() { if (dlg.open) dlg.close(); }

// ---------- карточка ----------
function editCard(c) {
  const P0 = P(), an = C.anomalies(c), pos = DB.order[c.cat].indexOf(c.id) + 1;
  const sizesHtml = () => { const an = C.anomalies(c); return c.sizes.map(s => `<span class="sz ${s.enabled === false ? 'dis' : an.has(s.sku) ? 'an' : s.stock ? 'on' : ''}" data-sku="${h(s.sku)}" title="${h(s.sku)} — нажмите, чтобы ${s.enabled === false ? 'включить' : 'выключить'} размер">${h(s.sz)} <small>${s.J ? fmt(s.J + P0) : '—'}</small></span>`).join('') || '<span class="muted">размеры появятся после обновления цен</span>'; };
  const checkedHtml = () => `${h(c.group)}${c.status.checked ? ' · проверено ' + dstr(c.status.checked) : ''}`;
  const fPos = C.movedCards(DB, c.cat).get(c.id);
  modal(`<h2>${h(c.name) || 'Карточка'} <span class="muted">· ${C.catName(c.cat)}, место ${pos}</span></h2>${fPos ? `<div class="msg info">↕ Стоит не как в Figma: там ${fPos}-я. <button class="small" id="cPlace">Вернуть на место как в Figma</button></div>` : ''}
  <div class="strip" id="strip"></div>
  <div class="acts"><button id="cFig" ${c.figma && DB.settings.figmaToken ? '' : 'disabled'}>Обновить фото из трафарета</button><span class="muted">Фото меняются только в Figma</span><span class="muted" id="cProg"></span></div>
  <div class="form">
    <label>Название на витрине</label><div><input id="cName" maxlength="30" value="${h(c.name)}">${c.figma && c.figma.title ? `<div class="muted" style="margin-top:4px">В Figma: «${h(c.figma.title)}» ${c.figma.title.slice(0, 30) !== c.name ? '<button class="small" id="cNameBack">вернуть из Figma</button>' : '✓'}</div>` : ''}</div>
    <label>Трафарет Figma</label><input id="cFigUrl" readonly title="Меняется в Figma" placeholder="ссылка на трафарет (node-id=…)" value="${c.figma ? h(`https://www.figma.com/design/${c.figma.key || figmaKey()}/?node-id=${c.figma.node.replace(':', '-')}`) : ''}">
    <label>Ссылка 4Partners с цветом</label><input id="cLink" readonly title="Меняется в трафарете Figma" value="${h(c.link ? C.keyOf(c) : '')}" placeholder="https://store.4partners.io/ru/product/…#v…">
    <label>Раздел</label><select id="cCat"><option value="1016" ${c.cat === '1016' ? 'selected' : ''}>Девушкам</option><option value="1015" ${c.cat === '1015' ? 'selected' : ''}>Парням</option></select>
    <label>Размеры</label><div><div class="sizes" id="cSizes">${sizesHtml()}</div><div class="acts" style="margin:8px 0 0"><button class="small" id="c4p" ${c.link ? '' : 'disabled'}>🔄 Сверить с 4Partners</button>${c.link ? `<a class="muted" href="${h(C.keyOf(c))}" target="_blank">открыть на 4Partners ↗</a>` : ''}</div><div id="c4pOut"></div></div>
    <label>ID в TgShop</label><div class="muted" style="padding-top:8px" id="cChecked">${checkedHtml()}</div>
  </div>
  <div class="acts"><button class="danger" id="cDel">Удалить карточку</button><span style="flex:1"></span><label class="muted"><input type="checkbox" id="cOn" ${c.enabled ? 'checked' : ''}> включена на витрине</label><button id="cClose">Закрыть</button><button class="primary" id="cSave">Сохранить</button></div>`, root => {
    let photos = [...c.photos];
    const drawStrip = () => { root.querySelector('#strip').innerHTML = photos.map(p => `<div class="th" style="cursor:default"><img src="${h(C.photoUrl(p))}" alt=""></div>`).join('') || '<span class="muted">Фото нет — нажмите «Обновить фото из трафарета»</span>'; };
    drawStrip();
    const bindSizes = () => root.querySelectorAll('.sz[data-sku]').forEach(el => el.onclick = () => { const s = c.sizes.find(x => x.sku === el.dataset.sku); s.enabled = s.enabled === false; el.classList.toggle('dis', s.enabled === false); });
    bindSizes();
    root.querySelector('#c4p').onclick = async () => {
      if (busy) return; const out = root.querySelector('#c4pOut'), btn = root.querySelector('#c4p'); btn.disabled = true; busy = true;
      out.innerHTML = '<div class="msg info">Спрашиваю у 4Partners… ⏳</div>';
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
          const liveList = C.liveSizes(c).map(x => `${h(x.sz)} — ${fmt(x.J + P0)} ₽`).join(', ');
          const state = live ? `🟢 В наличии ${live} из ${c.sizes.length} размеров: ${liveList}` : `🔴 У 4Partners нет в наличии ни одного размера${c.status.soldOutSince ? ` (распродана с ${c.status.soldOutSince.split('-').reverse().join('.')})` : ''}`;
          out.innerHTML = `<div class="msg ${live ? 'ok' : 'bad'}"><b>${state}</b>${!c.enabled ? '<br><span class="muted">Карточка выключена — на витрине её нет.</span>' : ''}<br>${t.length ? '<b>Что поменялось с прошлой проверки:</b><br>' + t.join('<br>') + '<br><span class="muted">Чтобы изменения попали на витрину — «Выгрузить на витрину».</span>' : '<span class="muted">С прошлой проверки ничего не поменялось — кабинет и 4Partners совпадают.</span>'}</div>`;
          log('Цены', `Сверка «${c.name}» с 4Partners: ${t.length ? 'есть изменения' : 'без изменений'}`);
        }
        await save(); root.querySelector('#cSizes').innerHTML = sizesHtml(); bindSizes(); root.querySelector('#cChecked').innerHTML = checkedHtml(); renderGrid(); renderStatus();
      } catch (e) { out.innerHTML = `<div class="msg bad">${h(e.message)}</div>`; }
      busy = false; btn.disabled = false;
    };
    root.querySelector('#cClose').onclick = closeModal;
    if (root.querySelector('#cPlace')) root.querySelector('#cPlace').onclick = async () => { C.placeLikeFigma(DB, c); log('Порядок', `«${c.name}» → как в Figma, место ${DB.order[c.cat].indexOf(c.id) + 1}`); await save(); closeModal(); renderGrid(); };
    if (root.querySelector('#cNameBack')) root.querySelector('#cNameBack').onclick = () => { root.querySelector('#cName').value = c.figma.title.slice(0, 30); c.nameManual = false; };
    root.querySelector('#cFig').onclick = async () => { try { prog('#cProg', 'Рисую фото из Figma…'); photos = await photosFromFigma(c.figma); drawStrip(); prog('#cProg', `Готово: ${photos.length} фото`); } catch (er) { prog('#cProg', er.message); } };
    root.querySelector('#cDel').onclick = async () => { if (!confirm(`Удалить «${c.name}» из кабинета? При выгрузке товар уйдёт с витрины.`)) return; DB.cards = DB.cards.filter(x => x !== c); for (const k of ['1016', '1015']) DB.order[k] = DB.order[k].filter(x => x !== c.id); log('Витрина', `Удалена «${c.name}»`); await save(); closeModal(); render(); };
    root.querySelector('#cSave').onclick = async () => {
      const nm = root.querySelector('#cName').value.trim().slice(0, 30);
      if (nm !== c.name) { c.nameManual = !(c.figma && c.figma.title && c.figma.title.slice(0, 30) === nm); c.name = nm; }
      const { link, hv } = C.splitLink(root.querySelector('#cLink').value); if (link !== c.link || hv !== c.hv) { c.link = link; c.hv = hv; delete c.status.error; }
      const fu = root.querySelector('#cFigUrl').value.trim(), node = C.figmaNodeFromUrl(fu);
      if (node && (!c.figma || c.figma.node !== node)) c.figma = { node, key: C.figmaKeyFromUrl(fu) || figmaKey(), changed: true };
      if (!fu) c.figma = null;
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
$('#bSortFig').onclick = async () => {
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
    if (!auto) t.push('Чтобы изменения попали на витрину, нажмите «Выгрузить на витрину»');
    notify(t.join('\n'));
    res = { R, pr };
  } catch (e) { prog('#uProg', ''); $('#uOut').innerHTML = `<div class="msg bad">${h(e.message)}</div><div class="acts"><button id="uOk">Закрыть</button></div>`; $('#uOk').onclick = closeModal; if (auto) notify(`❌ Автообновление не прошло: ${e.message}`); }
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
  modal('<h2>Выгрузка на витрину</h2><div class="progress" id="xProg">Собираю файл…</div><div id="xOut"></div>');
  try {
    const b = C.buildRows(DB), errs = C.validate(b.rows); const I = b.info;
    if (I.noLink.length) errs.unshift('нет ссылки 4Partners у включённых карточек: ' + I.noLink.join(', '));
    const L = DB.lastExport, d = diffLast(b.rows, L && L.snap), items = null;
    const warn = [];
    if (L && b.rows.length < L.rows * (1 - DB.settings.dropThreshold / 100)) warn.push(`строк ${b.rows.length} — на ${DB.settings.dropThreshold}%+ меньше прошлой выгрузки (${L.rows})`);
    if (auto && d.known && d.delGroups.size > 5) warn.push(`с витрины уйдёт ${d.delGroups.size} товаров — проверьте сверку с Figma`);
    let html = `<div class="msg ${errs.length ? 'bad' : 'ok'}">В файле ${b.rows.length} строк (${b.rows.filter(r => r[10] === 5).length} в продаже, ${b.rows.filter(r => r[10] === 0).length} с остатком 0), товаров ${b.groups}.</div>`;
    if (d.known) {
      html += `<table class="t"><tr><th>С прошлой выгрузки (${dstr(L.at)})</th><th></th></tr><tr><td>Новые товары</td><td class="n">${d.addGroups.size}</td></tr><tr><td>Уйдут с витрины</td><td class="n">${d.delGroups.size}</td></tr><tr><td>Цена изменится</td><td class="n">${d.price} SKU</td></tr><tr><td>Остаток станет 0 / станет 5</td><td class="n">${d.stock0} / ${d.stock5}</td></tr><tr><td>Новых размеров / убранных</td><td class="n">${d.addSku} / ${d.delSku}</td></tr></table>`;
      if (d.delGroups.size) html += `<details ${d.delGroups.size <= 10 ? 'open' : ''}><summary>Уйдут с витрины — ${d.delGroups.size}</summary>${[...d.delGroups].map(g => h(L.snap.groups[g] || g)).join('<br>')}</details>`;
    } else html += `<div class="msg info">Это первая выгрузка из кабинета 3.2 — сравнивать пока не с чем.</div>`;
    if (errs.length) html += `<div class="msg bad"><b>Загрузка невозможна:</b><br>${errs.slice(0, 30).map(h).join('<br>')}</div>`;
    if (warn.length) html += `<div class="msg warn">${warn.map(h).join('<br>')}</div>`;
    if (I.sold.length) html += `<div class="msg info">Распроданные, с остатком 0: ${I.sold.map(h).join(', ')}</div>`;
    if (I.anomalies.length) html += `<details><summary>Скрыто из-за аномальной цены — ${I.anomalies.length}</summary>${I.anomalies.map(h).join('<br>')}</details>`;
    if (I.off.length) html += `<details><summary>Выключенные карточки (не попадут на витрину) — ${I.off.length}</summary>${I.off.map(h).join('<br>')}</details>`;
    if (I.noPhoto.length) html += `<div class="msg warn">Без фото: ${I.noPhoto.map(h).join(', ')}</div>`;
    html += `<div class="acts"><button id="xDl">Скачать .xlsx</button><span style="flex:1"></span><button id="xClose">Закрыть</button><button class="primary" id="xGo" ${errs.length ? 'disabled' : ''}>Загрузить в TgShop</button></div>`;
    prog('#xProg', ''); $('#xOut').innerHTML = html;
    $('#xClose').onclick = closeModal;
    $('#xDl').onclick = () => download(fileBytes(b.rows), `Экспорт ${new Date().toLocaleDateString('ru-RU')} Каталог.xlsx`);
    $('#xGo').onclick = () => { if (warn.length && !confirm('Внимание:\n' + warn.join('\n') + '\n\nЗагрузить?')) return; upload(b, items); };
    plan = { b, errs, warn, d };
  } catch (e) { prog('#xProg', ''); $('#xOut').innerHTML = `<div class="msg bad">${h(e.message)}</div><div class="acts"><button id="xClose">Закрыть</button></div>`; $('#xClose').onclick = closeModal; plan = { fail: e.message }; }
  busy = false; return plan;
}
async function upload(b, items, auto) {
  if (busy) return false; busy = true; let done = false; $('#xGo').disabled = true; const out = $('#xOut');
  const say = (cls, t) => out.insertAdjacentHTML('beforeend', `<div class="msg ${cls}">${t}</div>`);
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
    notify(ok ? `✅ ${auto ? 'Автовыгрузка: в' : 'В'}итрина выгружена и сошлась с кабинетом\n${b.groups} товаров, ${b.rows.length} SKU` : `⚠️ Витрина выгружена, но есть расхождения — откройте кабинет\n${b.groups} товаров, ${b.rows.length} SKU`);
    prog('#xProg', 'Порядок на самой витрине проверьте в Telegram, кнопка «Каталог».'); done = ok;
  } catch (e) { prog('#xProg', ''); say('bad', h(e.message).replace(/&lt;br&gt;/g, '<br>')); notify(`❌ Выгрузка не прошла: ${e.message.replace(/<br>/g, ' ')}`); }
  busy = false; return done;
}

// ---------- наценка ----------
function renderMarkup() {
  const L = DB.settings.markupLines;
  $('#mkRows').innerHTML = L.map((l, i) => `<div class="mkrow"><input data-i="${i}" data-k="label" value="${h(l.label)}" placeholder="Подпись, например «Доставка»"><input data-i="${i}" data-k="amount" type="number" value="${l.amount}"><button data-del="${i}" title="Убрать">×</button></div>`).join('');
  $('#mkTotal').textContent = 'Итого наценка: ' + fmt(P()) + ' ₽';
  $$('#mkRows input').forEach(el => el.onchange = async () => { const l = L[+el.dataset.i]; l[el.dataset.k] = el.dataset.k === 'amount' ? +el.value : el.value; log('Наценка', `Итого ${P()} ₽`); await save(); renderMarkup(); renderGrid(); });
  $$('#mkRows [data-del]').forEach(el => el.onclick = async () => { L.splice(+el.dataset.del, 1); await save(); renderMarkup(); renderGrid(); });
}
$('#mkAdd').onclick = async () => { DB.settings.markupLines.push({ label: '', amount: 0 }); await save(); renderMarkup(); };

// ---------- распроданные, журнал ----------
function renderSold() {
  const s = DB.cards.filter(c => c.enabled && c.status.soldOutSince);
  $('#soldList').innerHTML = s.length ? `<table class="t"><tr><th>Карточка</th><th>Раздел</th><th>Нет с</th><th>Обновлений подряд</th><th></th></tr>${s.map(c => `<tr><td>${h(c.name)}</td><td>${C.catName(c.cat)}</td><td>${c.status.soldOutSince.split('-').reverse().join('.')}</td><td class="n">${c.status.soldRuns || 1}</td><td><a href="${h(C.keyOf(c))}" target="_blank">4Partners</a></td></tr>`).join('')}</table>` : '<p class="muted">Распроданных нет.</p>';
  $('#task').value = C.staffTask(DB);
}
$('#taskCopy').onclick = async () => { await navigator.clipboard.writeText($('#task').value); $('#taskCopy').textContent = 'Скопировано'; setTimeout(() => $('#taskCopy').textContent = 'Скопировать задание', 1500); };
function renderLog() { $('#logList').innerHTML = DB.history.length ? `<table class="t">${DB.history.map(x => `<tr><td class="n">${new Date(x.at).toLocaleString('ru-RU')}</td><td>${h(x.kind)}</td><td>${h(x.text)}</td></tr>`).join('')}</table>` : '<p class="muted">Пока пусто.</p>'; }

// ---------- настройки ----------
const FIELDS = [['§', 'TgShop'], ['shopId', 'ID магазина'], ['dropThreshold', 'Стоп, если строк меньше прошлой выгрузки на, %', 'number'],
  ['§', 'Figma'], ['figmaToken', 'Личный токен Figma', 'password'], ['figmaUrl', 'Ссылка на страницу Figma «> Актуальная витрина»'],
  ['§', 'GitHub (фото и резервная копия)'], ['ghToken', 'Токен GitHub', 'password'], ['ghPhotos', 'Репозиторий для фото (владелец/имя, публичный)'], ['ghBackup', 'Репозиторий для копии (владелец/имя, приватный)'], ['ghBranch', 'Ветка'],
  ['§', 'Telegram'], ['tgBot', 'Токен своего бота (@BotFather)', 'password'], ['tgChat', 'Ваш chat id'],
  ['§', 'Автоматизация'], ['autoOn', 'Обновлять цены и остатки сам', 'check'], ['autoTimes', 'Во сколько (через запятую, время ноутбука)'], ['autoMode', 'После обновления', 'select', [['update', 'только обновить и прислать итог — выгружу сам'], ['export', 'сразу выгрузить на витрину, если проверки чистые']]],
  ['§', 'Тексты товара'], ['fullDesc', 'Полное описание', 'area'], ['shortDesc', 'Краткое описание', 'area'], ['attrs', 'Характеристики', 'area'], ['sizeGrid', 'Размерная сетка'],
  ['§', 'Перенос (разово)'], ['sheetId', 'Google Таблица старого каталога (ID)'], ['sheetGid', 'gid листа «Матрица»']];
function renderSettings() {
  if ($('#setForm').contains(document.activeElement)) return;
  $('#setForm').innerHTML = FIELDS.map(([k, l, t, opts]) => k === '§' ? `<div class="sec">${l}</div>` : `<label>${l}</label>` + (t === 'area' ? `<textarea name="${k}" rows="3">${h(DB.settings[k])}</textarea>` : t === 'check' ? `<div style="padding-top:6px"><input class="switch" name="${k}" type="checkbox" ${DB.settings[k] ? 'checked' : ''}></div>` : t === 'select' ? `<select name="${k}">${opts.map(([v, n]) => `<option value="${v}" ${DB.settings[k] === v ? 'selected' : ''}>${n}</option>`).join('')}</select>` : `<input name="${k}" type="${t || 'text'}" value="${h(DB.settings[k])}">`)).join('');
}
$('#setSave').onclick = async () => {
  for (const k of ['ghPhotos', 'ghBackup']) { const v = $(`#setForm [name=${k}]`).value.trim(); if (v && !/^[\w.-]+\/[\w.-]+$/.test(v)) return prog('#setProg', `Поле «${k === 'ghPhotos' ? 'Репозиторий для фото' : 'Репозиторий для копии'}»: нужно название вида владелец/имя (например avtomonov-design/context-store-photos), а не ${/^github_pat_|^ghp_/.test(v) ? 'токен' : 'ссылка'}`); }
  ghPreflight.ok = false; for (const [k, , t] of FIELDS) { if (k === '§') continue; const el = $(`#setForm [name=${k}]`); DB.settings[k] = t === 'number' ? +el.value : t === 'check' ? el.checked : el.value.trim(); } storePhoto.have = null; await save(); prog('#setProg', 'Настройки сохранены'); renderStatus(); await applyAuto(true); };
$('#bkGh').onclick = () => backupGh(false);
$('#tgFind').onclick = tgFindChat; $('#tgTest').onclick = tgTest;
function tgSay(t, kind = 'info') { const el = $('#tgProg'); el.className = 'msg ' + kind; el.textContent = t; }
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
$('#bkFile').onclick = () => { const { undo, ...rest } = DB; rest.settings = { ...rest.settings, figmaToken: '', ghToken: '', tgBot: '' }; download(new TextEncoder().encode(JSON.stringify(rest)), `Кабинет витрины — копия ${new Date().toLocaleDateString('ru-RU')}.json`); };
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
    log('Авто', 'Запуск ' + slot.slice(11));
    const r = await runUpdate(true);
    if (r && DB.settings.autoMode === 'export') {
      const plan = await openExport(true);
      const why = plan.fail ? [plan.fail] : [...plan.errs, ...plan.warn]; if (r.R.errors.length) why.push(`не обновились ${r.R.errors.length} карточек`);
      if (why.length) { notify(`⏸ Выгрузку не делал — нужна ваша проверка:\n${why.slice(0, 6).join('\n')}\nОткройте кабинет → «Выгрузить на витрину»`); log('Авто', 'Выгрузка остановлена: ' + why.join('; ')); await save(); }
      else await upload(plan.b, null, true);
    }
    DB.lastAuto = { at: new Date().toISOString(), slot, ok: !!r }; await save(); render();
  } finally { autoCheck.running = false; }
  return true;
}
window.addEventListener('message', e => { if (e.source === window && e.data && e.data.__kab === 'autoTick') autoCheck(); });
setInterval(() => { if (DB.cards.length) autoCheck(); }, 60000);

(async () => {
  $('.brand small').textContent = 'подключаюсь к расширению…';
  const v = await N.hasBridge();
  if (!v) { document.body.innerHTML = `<main style="max-width:640px;margin:60px auto;font:15px/1.5 -apple-system,Segoe UI,sans-serif"><h1>Нужно расширение-мост</h1><p>Кабинет работает через расширение «conтекст store — кабинет витрины (мост)» в этом Chrome: оно ходит в 4Partners и TgShop через ваши входы и хранит базу на этом компьютере.</p><p>Установите его по инструкции из чата и обновите эту страницу.</p><p style="color:#6b6b73">Если уже установили: откройте chrome://extensions — у расширения должно быть название «…(мост)» и версия 3.1.0. Если там «кабинет витрины 2.0», значит, файлы не заменились — распакуйте архив в ту же папку и нажмите «Обновить» (круглая стрелка).</p></main>`; return; }
  $('.brand small').textContent = 'кабинет витрины · ' + APP_VERSION + ' · мост ' + v;
  BRIDGE_V = v; await load(); render();
  if (DB.settings.autoOn) applyAuto(false);
  if (new URLSearchParams(location.search).get('auto')) { document.title = '🤖 Автообновление витрины'; await autoCheck(); setTimeout(() => N.bridge('closeMe').catch(() => { }), 8000); }
  else autoCheck();
})();
