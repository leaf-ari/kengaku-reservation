// ============================================================
//  ★★★ ここにGoogle Apps ScriptのウェブアプリURLを貼ってください ★★★
//  ※ https://script.google.com/macros/s/xxxxx/exec の形式で入力
// ============================================================
const GAS_URL = 'https://script.google.com/macros/s/AKfycbzDTdIS8RcWP6omnqsi6gZgDD2E_Ndp0b8l9HqSLM31XlW_vFGhF3Wh1gvQnFy9WIRt/exec';

// 時間スロット定義（9:00〜17:00、各1時間枠）
const TIME_SLOTS = [
  { time: '09:00', range: '〜10:00' },
  { time: '10:00', range: '〜11:00' },
  { time: '11:00', range: '〜12:00' },
  { time: '12:00', range: '〜13:00' },
  { time: '13:00', range: '〜14:00' },
  { time: '14:00', range: '〜15:00' },
  { time: '15:00', range: '〜16:00' },
  { time: '16:00', range: '〜17:00' },
  { time: '17:00', range: '〜18:00' },
];

const MAX_PER_SLOT = 2;
const DAY_NAMES    = ['日', '月', '火', '水', '木', '金', '土'];

// アプリ状態
let weekOffset = 0;
const availabilityCache = {};
let selectedDate = null;
let selectedTime = null;

// ============================================================
// 初期化
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
  updateWeekNavUI();
  loadWeekData();

  document.getElementById('prevWeek').addEventListener('click', onPrevWeek);
  document.getElementById('nextWeek').addEventListener('click', onNextWeek);
  document.getElementById('todayBtn').addEventListener('click', onTodayWeek);
  document.getElementById('retryBtn').addEventListener('click', onRetry);
  document.getElementById('backBtn').addEventListener('click', showCalendarView);
  document.getElementById('reservationForm').addEventListener('submit', handleSubmit);

  document.querySelectorAll('.form-input, .form-textarea').forEach(el => {
    el.addEventListener('input', () => {
      const errEl = document.getElementById(el.id + 'Error');
      if (errEl) errEl.textContent = '';
      el.classList.remove('is-error');
    });
  });
});

// ============================================================
// 週ナビゲーション
// ============================================================
function getWeekMonday() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dow  = today.getDay();
  const diff = dow === 0 ? -6 : 1 - dow;
  const mon  = new Date(today);
  mon.setDate(today.getDate() + diff + weekOffset * 7);
  return mon;
}

function getWeekDates() {
  const mon = getWeekMonday();
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(mon);
    d.setDate(d.getDate() + i);
    return d;
  });
}

function updateWeekNavUI() {
  const dates = getWeekDates();
  const start = dates[0];
  const end   = dates[6];
  document.getElementById('weekLabel').textContent =
    `${start.getMonth()+1}月${start.getDate()}日 〜 ${end.getMonth()+1}月${end.getDate()}日`;
  document.getElementById('prevWeek').disabled = weekOffset <= -2;
  document.getElementById('nextWeek').disabled = weekOffset >= 12;
  document.getElementById('todayBtn').style.display = weekOffset !== 0 ? 'inline-block' : 'none';
}

function onPrevWeek()  { if (weekOffset > -2)  { weekOffset--; updateWeekNavUI(); loadWeekData(); } }
function onNextWeek()  { if (weekOffset < 12)  { weekOffset++; updateWeekNavUI(); loadWeekData(); } }
function onTodayWeek() { weekOffset = 0; updateWeekNavUI(); loadWeekData(); }
function onRetry()     { setCalendarState('loading'); loadWeekData(); }

// ============================================================
// データ読み込み
// ============================================================
async function loadWeekData() {
  const monday    = getWeekMonday();
  const mondayStr = toISODate(monday);

  if (availabilityCache[mondayStr]) {
    renderCalendar(getWeekDates(), availabilityCache[mondayStr]);
    return;
  }

  setCalendarState('loading');

  if (!isValidGASUrl(GAS_URL)) {
    console.warn('[見学予約] GAS URLが設定されていません。デモ表示をします。');
    availabilityCache[mondayStr] = {};
    renderCalendar(getWeekDates(), {});
    return;
  }

  try {
    const url  = `${GAS_URL}?action=getWeekAvailability&startDate=${encodeURIComponent(mondayStr)}`;
    const res  = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();

    if (json.success) {
      availabilityCache[mondayStr] = json.availability || {};
      renderCalendar(getWeekDates(), availabilityCache[mondayStr]);
    } else {
      console.error('[見学予約] GASエラー:', json.message);
      setCalendarState('error');
    }
  } catch (err) {
    console.error('[見学予約] 通信エラー:', err);
    setCalendarState('error');
  }
}

function setCalendarState(state) {
  document.getElementById('calendarLoading').style.display = state === 'loading' ? 'flex'  : 'none';
  document.getElementById('calendarError').style.display   = state === 'error'   ? 'flex'  : 'none';
  document.getElementById('tableScrollArea').style.display = state === 'table'   ? 'block' : 'none';
}

// ============================================================
// カレンダー描画
// 〇=0件  △=1件  ×=2件以上 or 過去
// ============================================================
function renderCalendar(weekDates, availability) {
  const table = document.getElementById('calendarTable');
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  table.innerHTML = '';

  // ===== ヘッダー行 =====
  const thead = table.createTHead();
  const hRow  = thead.insertRow();

  const thTime = document.createElement('th');
  thTime.className = 'th-time';
  thTime.textContent = '時間';
  hRow.appendChild(thTime);

  weekDates.forEach(date => {
    const th   = document.createElement('th');
    const dow  = date.getDay();
    const isToday = date.getTime() === today.getTime();
    let cls = 'th-date';
    if (isToday) cls += ' th-date--today';
    if (dow === 6) cls += ' th-date--sat';
    if (dow === 0) cls += ' th-date--sun';
    th.className = cls;
    th.innerHTML = `<span class="th-day">${DAY_NAMES[dow]}</span><span class="th-date-num">${date.getMonth()+1}/${date.getDate()}</span>`;
    hRow.appendChild(th);
  });

  // ===== ボディ行 =====
  const tbody = table.createTBody();

  TIME_SLOTS.forEach(({ time }) => {
    const tr = tbody.insertRow();

    const tdTime = tr.insertCell();
    tdTime.className = 'cell-time';
    tdTime.textContent = time;

    weekDates.forEach(date => {
      const dateStr = toISODate(date);
      const td      = tr.insertCell();
      const dow     = date.getDay();

      let cellCls = 'cell-slot';
      if (date.getTime() === today.getTime()) cellCls += ' cell-slot--today';
      else if (dow === 6) cellCls += ' cell-slot--sat';
      else if (dow === 0) cellCls += ' cell-slot--sun';
      td.className = cellCls;

      const isPast  = isPastSlot(date, time);
      const count   = getCount(availability, dateStr, time);
      const isFull  = count >= MAX_PER_SLOT;

      if (isPast || isFull) {
        // ×（満席・過去）
        const span = document.createElement('span');
        span.className = 'slot-x';
        span.textContent = '×';
        td.appendChild(span);

      } else if (count === 1) {
        // △（残り1枠）
        const btn = document.createElement('button');
        btn.type      = 'button';
        btn.className = 'slot-tri';
        btn.textContent = '△';
        btn.setAttribute('aria-label', `${formatJpDate(dateStr)} ${time} 残り1枠 予約する`);
        btn.addEventListener('click', () => openFormView(dateStr, time));
        td.appendChild(btn);

      } else {
        // 〇（空きあり）
        const btn = document.createElement('button');
        btn.type      = 'button';
        btn.className = 'slot-o';
        btn.textContent = '〇';
        btn.setAttribute('aria-label', `${formatJpDate(dateStr)} ${time} 予約する`);
        btn.addEventListener('click', () => openFormView(dateStr, time));
        td.appendChild(btn);
      }
    });
  });

  setCalendarState('table');
}

function getCount(availability, dateStr, time) {
  if (!availability || !availability[dateStr]) return 0;
  const v = availability[dateStr][time];
  return v !== undefined ? Number(v) : 0;
}

// ============================================================
// ビュー切り替え
// ============================================================
function openFormView(date, time) {
  selectedDate = date;
  selectedTime = time;

  document.getElementById('date').value         = date;
  document.getElementById('selectedTime').value = time;

  const slot = TIME_SLOTS.find(t => t.time === time);
  document.getElementById('selectedDateDisplay').textContent = formatJpDate(date);
  document.getElementById('selectedTimeDisplay').textContent = time + (slot ? slot.range : '');

  resetFormFields();

  document.getElementById('calendarView').style.display = 'none';
  document.getElementById('formView').style.display     = 'block';
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function showCalendarView() {
  document.getElementById('formView').style.display     = 'none';
  document.getElementById('calendarView').style.display = 'block';
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ============================================================
// フォームバリデーション（電話・メールなし）
// ============================================================
function validateForm() {
  let valid = true;

  // ---- テキスト入力フィールドのチェック ----
  const fields = [
    { id: 'studentName', label: '学生氏名' },
    { id: 'schoolName',  label: '学校名' },
    { id: 'staffName',   label: '担当者名' },
  ];

  fields.forEach(({ id, label }) => {
    const el  = document.getElementById(id);
    const err = document.getElementById(id + 'Error');
    if (!el || !el.value.trim()) {
      if (err) err.textContent = `${label}を入力してください`;
      if (el)  el.classList.add('is-error');
      valid = false;
    } else {
      if (err) err.textContent = '';
      el.classList.remove('is-error');
    }
  });

  // ---- 日付・時間（カレンダーから自動セット）のチェック ----
  if (!selectedDate) {
    console.warn('[見学予約] selectedDate が未セットです');
    valid = false;
  }
  if (!selectedTime) {
    console.warn('[見学予約] selectedTime が未セットです');
    valid = false;
  }

  return valid;
}

// ============================================================
// フォーム送信
// ============================================================
async function handleSubmit(e) {
  e.preventDefault();

  if (!validateForm()) {
    const firstErr = document.querySelector('.error-msg:not(:empty), .is-error');
    if (firstErr) firstErr.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return;
  }

  if (!isValidGASUrl(GAS_URL)) {
    openErrorModal('GAS URLが設定されていません。\nREADME.mdの手順に従ってscript.jsのGAS_URLを設定してください。');
    return;
  }

  // 電話・メールなし — hidden input からも読んで万全を期す
  const dateVal = selectedDate  || document.getElementById('date').value         || null;
  const timeVal = selectedTime  || document.getElementById('selectedTime').value || null;

  const payload = {
    studentName: document.getElementById('studentName').value.trim(),
    schoolName:  document.getElementById('schoolName').value.trim(),
    date:        dateVal,
    time:        timeVal,
    staffName:   document.getElementById('staffName').value.trim(),
    memo:        document.getElementById('memo').value.trim(),
  };

  // ★送信内容をコンソールに出力（デバッグ用）
  console.log('[見学予約] 送信ペイロード:', JSON.stringify(payload));

  setLoading(true);

  try {
    const res  = await fetch(GAS_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body:    JSON.stringify(payload),
    });
    const json = await res.json();

    // ★GASからの応答をコンソールに出力（デバッグ用）
    console.log('[見学予約] GAS応答:', JSON.stringify(json));

    if (json.success) {
      const mondayStr = toISODate(getWeekMonday());
      delete availabilityCache[mondayStr];
      openSuccessModal(payload);
    } else {
      openErrorModal(json.message || '予約の登録に失敗しました。\nしばらく待ってから再度お試しください。');
    }
  } catch (err) {
    console.error('[見学予約] 送信エラー:', err);
    openErrorModal('通信エラーが発生しました。\n通信環境を確認して再度お試しください。');
  } finally {
    setLoading(false);
  }
}

// ============================================================
// モーダル
// ============================================================
function openSuccessModal(data) {
  const slot = TIME_SLOTS.find(t => t.time === data.time);
  document.getElementById('successDetails').innerHTML = `
    <strong>${escapeHtml(data.studentName)}</strong> 様<br>
    ${escapeHtml(formatJpDate(data.date))}<br>
    ${escapeHtml(data.time + (slot ? slot.range : ''))} にて見学予約を受け付けました。
  `;
  document.getElementById('successModal').classList.add('is-open');
}

function closeSuccessModal() {
  document.getElementById('successModal').classList.remove('is-open');
  showCalendarView();
  loadWeekData();
}

function openErrorModal(message) {
  document.getElementById('errorMessage').textContent = message;
  document.getElementById('errorModal').classList.add('is-open');
}

function closeErrorModal() {
  document.getElementById('errorModal').classList.remove('is-open');
}

window.closeSuccessModal = closeSuccessModal;
window.closeErrorModal   = closeErrorModal;

// ============================================================
// ユーティリティ
// ============================================================
function isPastSlot(dateObj, timeStr) {
  const now  = new Date();
  const [h]  = timeStr.split(':').map(Number);
  const slot = new Date(dateObj);
  slot.setHours(h, 0, 0, 0);
  return slot < now;
}

function isValidGASUrl(url) {
  return url && url !== 'YOUR_GAS_URL_HERE' && url.startsWith('https://script.google.com/');
}

function toISODate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function formatJpDate(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dow = new Date(y, m - 1, d).getDay();
  return `${y}年${m}月${d}日（${DAY_NAMES[dow]}）`;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function setLoading(isLoading) {
  const overlay = document.getElementById('loadingOverlay');
  const btn     = document.getElementById('submitBtn');
  if (isLoading) {
    overlay.classList.add('is-visible');
    overlay.removeAttribute('aria-hidden');
    btn.disabled = true;
  } else {
    overlay.classList.remove('is-visible');
    overlay.setAttribute('aria-hidden', 'true');
    btn.disabled = false;
  }
}

function resetFormFields() {
  ['studentName', 'schoolName', 'staffName', 'memo'].forEach(id => {
    const el = document.getElementById(id);
    if (el) { el.value = ''; el.classList.remove('is-error'); }
  });
  document.querySelectorAll('.error-msg').forEach(el => (el.textContent = ''));
}
