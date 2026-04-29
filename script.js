// ============================================================
//  見学予約システム - 学生用フロントエンド
//  株式会社リーフ採用向け
// ============================================================

// ============================================================
// ★★★ 設定定数（必要に応じて変更してください）★★★
// ============================================================
const GAS_URL      = 'https://script.google.com/macros/s/AKfycbzDTdIS8RcWP6omnqsi6gZgDD2E_Ndp0b8l9HqSLM31XlW_vFGhF3Wh1gvQnFy9WIRt/exec';
const LINE_ADD_URL = 'ここにLINE友だち追加URL'; // 例: https://lin.ee/xxxxxxx

// ============================================================
// 定数
// ============================================================
const AREAS          = ['東京', '埼玉', '新潟', '愛知', '福岡', '岩手', '沖縄'];
const THREE_HOUR_AREAS = ['東京', '埼玉'];
const MAX_LANES      = 2;
const DEADLINE_DAYS  = 7; // 何日前まで予約受付
const DAY_NAMES      = ['日', '月', '火', '水', '木', '金', '土'];

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

// ============================================================
// アプリ状態
// ============================================================
let weekOffset = 0;
const availabilityCache = {};
let selectedDate = null;
let selectedTime = null;
let selectedArea = '';

// ============================================================
// 初期化
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
  // LINE友だち追加ボタン
  const lineBtn = document.getElementById('lineAddBtn');
  if (lineBtn && LINE_ADD_URL && LINE_ADD_URL !== 'ここにLINE友だち追加URL') {
    lineBtn.href = LINE_ADD_URL;
  } else if (lineBtn) {
    lineBtn.style.opacity = '0.5';
    lineBtn.title = 'LINE友だち追加URLが設定されていません';
  }

  updateWeekNavUI();
  loadWeekData();

  document.getElementById('prevWeek').addEventListener('click', onPrevWeek);
  document.getElementById('nextWeek').addEventListener('click', onNextWeek);
  document.getElementById('todayBtn').addEventListener('click', onTodayWeek);
  document.getElementById('retryBtn').addEventListener('click', onRetry);
  document.getElementById('backBtn').addEventListener('click', showCalendarView);
  document.getElementById('reservationForm').addEventListener('submit', handleSubmit);

  // エリア選択 → カレンダー再描画
  document.getElementById('areaSelect').addEventListener('change', function () {
    selectedArea = this.value;
    const hint = document.getElementById('areaHint');
    if (selectedArea) {
      const duration = THREE_HOUR_AREAS.includes(selectedArea) ? '3時間（現地見学）' : '1時間（Zoom）';
      hint.textContent = `${selectedArea}：${duration}の枠で予約できます`;
    } else {
      hint.textContent = 'エリアを選ぶと、予約可能な枠が表示されます';
    }
    const mondayStr = toISODate(getWeekMonday());
    if (availabilityCache[mondayStr]) {
      renderCalendar(getWeekDates(), availabilityCache[mondayStr]);
    }
  });

  // フォームエリア選択 → 選択スロット表示更新
  document.getElementById('area').addEventListener('change', function () {
    if (selectedDate && selectedTime) {
      updateSelectedSlotDisplay(selectedDate, selectedTime, this.value);
    }
  });

  // 参加者入力 → 人数カウント更新
  ['participant1', 'participant2', 'participant3'].forEach(id => {
    document.getElementById(id).addEventListener('input', updateParticipantCount);
  });

  // 入力エラークリア
  document.querySelectorAll('.form-input, .form-select, .form-textarea').forEach(el => {
    el.addEventListener('input', () => {
      clearFieldError(el.id);
    });
    el.addEventListener('change', () => {
      clearFieldError(el.id);
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

function onPrevWeek()  { if (weekOffset > -2) { weekOffset--; updateWeekNavUI(); loadWeekData(); } }
function onNextWeek()  { if (weekOffset < 12) { weekOffset++; updateWeekNavUI(); loadWeekData(); } }
function onTodayWeek() { weekOffset = 0; updateWeekNavUI(); loadWeekData(); }
function onRetry()     { setCalendarState('loading'); loadWeekData(); }

// ============================================================
// データ読み込み（週1回のAPIリクエストで全スロット取得）
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
    console.warn('[見学予約] GAS URLが設定されていません。');
    availabilityCache[mondayStr] = {};
    renderCalendar(getWeekDates(), {});
    return;
  }

  try {
    const url = `${GAS_URL}?action=getWeekAvailability&startDate=${encodeURIComponent(mondayStr)}`;
    console.log('[見学予約] 取得URL:', url);
    const res  = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    console.log('[見学予約] GAS応答:', json.success, Object.keys(json.availability || {}).length, '日分');

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
  document.getElementById('calendarLoading').style.display  = state === 'loading' ? 'flex'  : 'none';
  document.getElementById('calendarError').style.display    = state === 'error'   ? 'flex'  : 'none';
  document.getElementById('tableScrollArea').style.display  = state === 'table'   ? 'block' : 'none';
}

// ============================================================
// カレンダー描画
// ============================================================
function renderCalendar(weekDates, availability) {
  const table = document.getElementById('calendarTable');
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  table.innerHTML = '';

  // ヘッダー行
  const thead = table.createTHead();
  const hRow  = thead.insertRow();

  const thTime = document.createElement('th');
  thTime.className = 'th-time';
  thTime.textContent = '時間';
  hRow.appendChild(thTime);

  weekDates.forEach(date => {
    const th  = document.createElement('th');
    const dow = date.getDay();
    const isToday = date.getTime() === today.getTime();
    let cls = 'th-date';
    if (isToday)  cls += ' th-date--today';
    if (dow === 6) cls += ' th-date--sat';
    if (dow === 0) cls += ' th-date--sun';
    th.className = cls;
    th.innerHTML = `<span class="th-day">${DAY_NAMES[dow]}</span><span class="th-date-num">${date.getMonth()+1}/${date.getDate()}</span>`;
    hRow.appendChild(th);
  });

  // ボディ行
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

      const isPast     = isPastOrDeadline(date, time);
      const slotStatus = isPast ? 'x' : getSlotStatus(availability, dateStr, time, selectedArea);

      if (slotStatus === 'x') {
        const span = document.createElement('span');
        span.className   = 'slot-x';
        span.textContent = '×';
        span.setAttribute('aria-label', '予約不可');
        td.appendChild(span);
      } else if (slotStatus === 'tri') {
        const btn = document.createElement('button');
        btn.type        = 'button';
        btn.className   = 'slot-tri';
        btn.textContent = '△';
        btn.setAttribute('aria-label', `${formatJpDate(dateStr)} ${time} 残り1枠 予約する`);
        btn.addEventListener('click', () => openFormView(dateStr, time));
        td.appendChild(btn);
      } else {
        const btn = document.createElement('button');
        btn.type        = 'button';
        btn.className   = 'slot-o';
        btn.textContent = '〇';
        btn.setAttribute('aria-label', `${formatJpDate(dateStr)} ${time} 予約する`);
        btn.addEventListener('click', () => openFormView(dateStr, time));
        td.appendChild(btn);
      }
    });
  });

  setCalendarState('table');
}

// スロットの状態を返す: 'o' | 'tri' | 'x'
function getSlotStatus(availability, dateStr, time, area) {
  if (!area) {
    // エリア未選択：単純なレーン数で表示
    const count = ((availability[dateStr] || {})[time]) || 0;
    if (count >= MAX_LANES) return 'x';
    if (count === 1) return 'tri';
    return 'o';
  }

  const duration  = THREE_HOUR_AREAS.includes(area) ? 3 : 1;
  const startHour = parseInt(time.split(':')[0], 10);

  // 営業時間外（最終終了18:00）
  if (startHour + duration > 18) return 'x';

  let maxLanes = 0;
  for (let h = 0; h < duration; h++) {
    const checkHour = startHour + h;
    const checkTime = (checkHour < 10 ? '0' : '') + checkHour + ':00';
    const lanes = ((availability[dateStr] || {})[checkTime]) || 0;
    if (lanes >= MAX_LANES) return 'x';
    if (lanes > maxLanes) maxLanes = lanes;
  }

  if (maxLanes === 0) return 'o';
  if (maxLanes === 1) return 'tri';
  return 'x';
}

// 過去 or 予約締切（DEADLINE_DAYS日前）かどうか
function isPastOrDeadline(dateObj, timeStr) {
  const now = new Date();
  const [h] = timeStr.split(':').map(Number);
  const slotTime = new Date(dateObj);
  slotTime.setHours(h, 0, 0, 0);
  if (slotTime < now) return true;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffDays = (dateObj.getTime() - today.getTime()) / (1000 * 60 * 60 * 24);
  return diffDays < DEADLINE_DAYS;
}

// ============================================================
// ビュー切り替え
// ============================================================
function openFormView(date, time) {
  selectedDate = date;
  selectedTime = time;

  document.getElementById('hiddenDate').value = date;
  document.getElementById('hiddenTime').value = time;

  // カレンダーで選択済みエリアをフォームに反映
  if (selectedArea) {
    document.getElementById('area').value = selectedArea;
  }

  updateSelectedSlotDisplay(date, time, document.getElementById('area').value);
  resetFormFields();
  updateParticipantCount();

  document.getElementById('calendarView').style.display = 'none';
  document.getElementById('formView').style.display     = 'block';
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function showCalendarView() {
  document.getElementById('formView').style.display     = 'none';
  document.getElementById('calendarView').style.display = 'block';
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function updateSelectedSlotDisplay(date, time, area) {
  const slot     = TIME_SLOTS.find(t => t.time === time);
  const duration = area && THREE_HOUR_AREAS.includes(area) ? 3 : 1;
  const endHour  = parseInt(time.split(':')[0], 10) + duration;
  const endTime  = `〜${endHour < 10 ? '0' : ''}${endHour}:00`;

  document.getElementById('selectedDateDisplay').textContent = formatJpDate(date);
  document.getElementById('selectedTimeDisplay').textContent = time + (area ? endTime : (slot ? slot.range : ''));
  document.getElementById('selectedAreaDisplay').textContent =
    area ? `${area}（${duration === 3 ? '現地見学・3時間' : 'Zoom・1時間'}）` : 'エリアはフォームで選択';
}

// ============================================================
// 参加者人数カウント
// ============================================================
function updateParticipantCount() {
  let count = 0;
  if (document.getElementById('participant1').value.trim()) count++;
  if (document.getElementById('participant2').value.trim()) count++;
  if (document.getElementById('participant3').value.trim()) count++;
  document.getElementById('participantCountDisplay').textContent = count;
}

// ============================================================
// フォームバリデーション
// ============================================================
function validateForm() {
  let valid = true;

  const textFields = [
    { id: 'representativeName', label: '代表者氏名' },
    { id: 'birthDate',          label: '生年月日' },
    { id: 'phone',              label: '電話番号' },
    { id: 'email',              label: 'メールアドレス' },
    { id: 'schoolName',         label: '学校名' },
    { id: 'department',         label: '学科' },
    { id: 'participant1',       label: '参加者1氏名' },
  ];

  textFields.forEach(({ id, label }) => {
    const el = document.getElementById(id);
    if (!el || !el.value.trim()) {
      showFieldError(id, `${label}を入力してください`);
      valid = false;
    }
  });

  const selectFields = [
    { id: 'grade', label: '学年' },
    { id: 'area',  label: '見学希望エリア' },
  ];
  selectFields.forEach(({ id, label }) => {
    const el = document.getElementById(id);
    if (!el || !el.value) {
      showFieldError(id, `${label}を選択してください`);
      valid = false;
    }
  });

  // メール形式チェック
  const email = document.getElementById('email').value.trim();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    showFieldError('email', 'メールアドレスの形式が正しくありません');
    valid = false;
  }

  if (!selectedDate || !selectedTime) {
    console.warn('[見学予約] 日時が未選択です');
    valid = false;
  }

  return valid;
}

function showFieldError(fieldId, message) {
  const el  = document.getElementById(fieldId);
  const err = document.getElementById(fieldId + 'Error');
  if (el)  el.classList.add('is-error');
  if (err) err.textContent = message;
}

function clearFieldError(fieldId) {
  const el  = document.getElementById(fieldId);
  const err = document.getElementById(fieldId + 'Error');
  if (el)  el.classList.remove('is-error');
  if (err) err.textContent = '';
}

// ============================================================
// フォーム送信
// ============================================================
async function handleSubmit(e) {
  e.preventDefault();

  if (!validateForm()) {
    const firstErr = document.querySelector('.is-error, .error-msg:not(:empty)');
    if (firstErr) firstErr.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return;
  }

  if (!isValidGASUrl(GAS_URL)) {
    openErrorModal('GAS URLが設定されていません。\nscript.jsのGAS_URLを設定してください。');
    return;
  }

  const payload = {
    action:             'createReservation',
    representativeName: document.getElementById('representativeName').value.trim(),
    birthDate:          document.getElementById('birthDate').value.trim(),
    phone:              document.getElementById('phone').value.trim(),
    email:              document.getElementById('email').value.trim(),
    schoolName:         document.getElementById('schoolName').value.trim(),
    grade:              document.getElementById('grade').value,
    department:         document.getElementById('department').value.trim(),
    area:               document.getElementById('area').value,
    date:               selectedDate,
    time:               selectedTime,
    participant1:       document.getElementById('participant1').value.trim(),
    participant2:       document.getElementById('participant2').value.trim(),
    participant3:       document.getElementById('participant3').value.trim(),
    memo:               document.getElementById('memo').value.trim(),
  };

  console.log('[見学予約] 送信ペイロード:', JSON.stringify(payload));
  setLoading(true);

  try {
    const res  = await fetch(GAS_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body:    JSON.stringify(payload),
    });
    const json = await res.json();
    console.log('[見学予約] GAS応答:', JSON.stringify(json));

    if (json.success) {
      // キャッシュ削除して最新データを取得
      delete availabilityCache[toISODate(getWeekMonday())];
      openSuccessModal(payload, json.reservationId);
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
function openSuccessModal(data, reservationId) {
  const slot     = TIME_SLOTS.find(t => t.time === data.time);
  const duration = THREE_HOUR_AREAS.includes(data.area) ? 3 : 1;
  const endHour  = parseInt(data.time.split(':')[0], 10) + duration;
  const endTime  = `〜${endHour < 10 ? '0' : ''}${endHour}:00`;

  document.getElementById('successDetails').innerHTML = `
    <strong>${escapeHtml(data.representativeName)}</strong> 様<br>
    ${escapeHtml(formatJpDate(data.date))}<br>
    ${escapeHtml(data.time + endTime)}<br>
    ${escapeHtml(data.area)}にて見学予約を受け付けました。
    ${reservationId ? `<br><span style="font-size:.8rem;color:#757575">予約ID: ${escapeHtml(reservationId)}</span>` : ''}
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
  ['representativeName', 'birthDate', 'phone', 'email', 'schoolName',
   'department', 'participant1', 'participant2', 'participant3', 'memo'].forEach(id => {
    const el = document.getElementById(id);
    if (el) { el.value = ''; el.classList.remove('is-error'); }
  });
  ['grade'].forEach(id => {
    const el = document.getElementById(id);
    if (el) { el.value = ''; el.classList.remove('is-error'); }
  });
  document.querySelectorAll('.error-msg').forEach(el => (el.textContent = ''));
}
