// ============================================================
//  見学予約システム - 管理ページ（社内用）
//  株式会社リーフ採用向け
// ============================================================

// ============================================================
// ★★★ 設定定数 ★★★
// ============================================================
const GAS_URL = 'https://script.google.com/macros/s/AKfycbzDTdIS8RcWP6omnqsi6gZgDD2E_Ndp0b8l9HqSLM31XlW_vFGhF3Wh1gvQnFy9WIRt/exec';

// ============================================================
// 定数
// ============================================================
const AREAS            = ['東京', '埼玉', '新潟', '愛知', '福岡', '岩手', '沖縄'];
const THREE_HOUR_AREAS = ['東京', '埼玉'];
const MAX_LANES        = 2;
const DAY_NAMES        = ['日', '月', '火', '水', '木', '金', '土'];
const DEADLINE_DAYS    = 7;

const TIME_SLOTS = ['09:00','10:00','11:00','12:00','13:00','14:00','15:00','16:00','17:00'];

// ============================================================
// 状態
// ============================================================
let allReservations     = [];
let weekOffset          = 0;
let calAvailability     = {};
let calAreaFilter       = '';
let currentSlotDate     = null;
let currentSlotTime     = null;
let prefilledDate       = null;
let prefilledTime       = null;

// ============================================================
// タブ切り替え
// ============================================================
function switchTab(tab) {
  document.querySelectorAll('.adm-tab').forEach(t => t.classList.remove('active'));
  document.getElementById('tabList').classList.toggle('active', tab === 'list');
  document.getElementById('tabCalendar').classList.toggle('active', tab === 'calendar');
  document.getElementById('listView').style.display     = tab === 'list'     ? 'block' : 'none';
  document.getElementById('calendarView').style.display = tab === 'calendar' ? 'block' : 'none';

  if (tab === 'list' && allReservations.length === 0) loadReservations();
  if (tab === 'calendar') loadCalendarData();
}

// ============================================================
// 初期化
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
  loadReservations();
});

// ============================================================
// 予約一覧読み込み
// ============================================================
async function loadReservations() {
  showListState('loading');
  try {
    const res  = await fetch(`${GAS_URL}?action=getReservations`, { cache: 'no-store' });
    const json = await res.json();
    if (!json.success) throw new Error(json.message);
    allReservations = json.reservations || [];
    renderList(allReservations);
  } catch (err) {
    console.error('[管理] 予約一覧取得エラー:', err);
    showListState('error');
  }
}

function showListState(state) {
  document.getElementById('listLoading').style.display  = state === 'loading' ? 'flex' : 'none';
  document.getElementById('listError').style.display    = state === 'error'   ? 'flex' : 'none';
  document.getElementById('listEmpty').style.display    = state === 'empty'   ? 'flex' : 'none';
  document.getElementById('listTableWrap').style.display= state === 'table'   ? 'block': 'none';
}

// ============================================================
// 一覧描画
// ============================================================
function renderList(reservations) {
  if (reservations.length === 0) { showListState('empty'); return; }

  const tbody = document.getElementById('reservationTableBody');
  tbody.innerHTML = '';

  reservations.forEach(r => {
    const tr = document.createElement('tr');
    if (r['ステータス'] === 'キャンセル済み') tr.classList.add('is-cancelled');

    const statusBadge = r['ステータス'] === '予約済み'
      ? `<span class="status-badge status-badge--active">予約済み</span>`
      : r['ステータス'] === 'キャンセル済み'
      ? `<span class="status-badge status-badge--cancel">キャンセル済み</span>`
      : `<span class="status-badge status-badge--other">${escHtml(r['ステータス'])}</span>`;

    tr.innerHTML = `
      <td style="font-size:.78rem;color:#757575">${escHtml(r['予約ID'])}</td>
      <td style="white-space:nowrap;font-size:.78rem">${escHtml((r['受付日時']||'').substring(0,16))}</td>
      <td><strong>${escHtml(r['代表者氏名'])}</strong></td>
      <td>${escHtml(r['学校名'])}</td>
      <td>${escHtml(r['見学希望エリア'])}</td>
      <td style="white-space:nowrap">${escHtml(formatDate(r['希望日']))}</td>
      <td style="white-space:nowrap">${escHtml(r['希望時間'])}</td>
      <td style="text-align:center">${escHtml(r['予約時間数'])}h</td>
      <td style="text-align:center">${escHtml(r['予約人数'])}</td>
      <td>${statusBadge}</td>
      <td>
        <div class="td-actions">
          <button class="adm-btn adm-btn--outline adm-btn--sm" onclick="openDetailModal('${escHtml(r['予約ID'])}')">詳細</button>
          ${r['ステータス'] === '予約済み'
            ? `<button class="adm-btn adm-btn--ghost adm-btn--sm" onclick="confirmCancel('${escHtml(r['予約ID'])}','${escHtml(r['代表者氏名'])}')">キャンセル</button>`
            : ''}
          <button class="adm-btn adm-btn--sm" style="background:#ffcdd2;color:#c62828" onclick="confirmDelete('${escHtml(r['予約ID'])}','${escHtml(r['代表者氏名'])}')">削除</button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });

  showListState('table');
}

// ============================================================
// フィルタ
// ============================================================
function applyListFilters() {
  const date   = document.getElementById('filterDate').value;
  const area   = document.getElementById('filterArea').value;
  const status = document.getElementById('filterStatus').value;

  const filtered = allReservations.filter(r => {
    if (date   && r['希望日'] !== date)        return false;
    if (area   && r['見学希望エリア'] !== area) return false;
    if (status && r['ステータス'] !== status)  return false;
    return true;
  });

  renderList(filtered);
}

function clearListFilters() {
  document.getElementById('filterDate').value   = '';
  document.getElementById('filterArea').value   = '';
  document.getElementById('filterStatus').value = '';
  renderList(allReservations);
}

// ============================================================
// 詳細モーダル
// ============================================================
function openDetailModal(reservationId) {
  const r = allReservations.find(x => x['予約ID'] === reservationId);
  if (!r) return;

  const fields = [
    ['予約ID',                r['予約ID']],
    ['受付日時',              r['受付日時']],
    ['代表者氏名',            r['代表者氏名']],
    ['生年月日',              r['生年月日']],
    ['電話番号',              r['電話番号']],
    ['メールアドレス',         r['メールアドレス']],
    ['学校名',                r['学校名']],
    ['学年',                  r['学年']],
    ['学科',                  r['学科']],
    ['見学希望エリア',         r['見学希望エリア']],
    ['希望日',                formatDate(r['希望日'])],
    ['希望時間',              r['希望時間']],
    ['予約時間数',            r['予約時間数'] + '時間'],
    ['参加者1氏名',           r['参加者1氏名']],
    ['参加者2氏名',           r['参加者2氏名'] || '─'],
    ['参加者3氏名',           r['参加者3氏名'] || '─'],
    ['予約人数',              r['予約人数'] + '名'],
    ['メモ',                  r['メモ'] || '─'],
    ['ステータス',            r['ステータス']],
    ['カレンダーイベントID',  r['GoogleカレンダーイベントID'] || '─'],
  ];

  const html = `<div class="adm-detail-grid">${
    fields.map(([label, val]) =>
      `<span class="adm-detail-label">${escHtml(label)}</span><span class="adm-detail-value">${escHtml(String(val||''))}</span>`
    ).join('')
  }</div>`;

  document.getElementById('detailContent').innerHTML = html;

  const footer = document.getElementById('detailActions');
  footer.innerHTML = '';
  if (r['ステータス'] === '予約済み') {
    const cancelBtn = document.createElement('button');
    cancelBtn.className   = 'adm-btn adm-btn--ghost';
    cancelBtn.textContent = 'キャンセルする';
    cancelBtn.onclick     = () => { closeDetailModal(); confirmCancel(r['予約ID'], r['代表者氏名']); };
    footer.appendChild(cancelBtn);
  }
  const deleteBtn = document.createElement('button');
  deleteBtn.className   = 'adm-btn adm-btn--sm';
  deleteBtn.style.cssText = 'background:#ffcdd2;color:#c62828;';
  deleteBtn.textContent = '削除する';
  deleteBtn.onclick     = () => { closeDetailModal(); confirmDelete(r['予約ID'], r['代表者氏名']); };
  footer.appendChild(deleteBtn);

  const closeBtn = document.createElement('button');
  closeBtn.className   = 'adm-btn adm-btn--ghost';
  closeBtn.textContent = '閉じる';
  closeBtn.onclick     = closeDetailModal;
  footer.appendChild(closeBtn);

  document.getElementById('detailModal').classList.add('is-open');
}

function closeDetailModal() {
  document.getElementById('detailModal').classList.remove('is-open');
}

// ============================================================
// キャンセル確認
// ============================================================
function confirmCancel(reservationId, name) {
  document.getElementById('confirmTitle').textContent   = 'キャンセルの確認';
  document.getElementById('confirmMessage').textContent =
    `「${name}」様の予約をキャンセルしますか？\nデータは残りますがステータスが「キャンセル済み」に変わります。`;
  document.getElementById('confirmOkBtn').className     = 'adm-btn adm-btn--ghost adm-btn--lg';
  document.getElementById('confirmOkBtn').style.background = '#e65100';
  document.getElementById('confirmOkBtn').style.color    = '#fff';
  document.getElementById('confirmOkBtn').onclick        = () => executeCancel(reservationId);
  document.getElementById('confirmModal').classList.add('is-open');
}

async function executeCancel(reservationId) {
  closeConfirmModal();
  showOverlay(true);
  try {
    const json = await postAction({ action: 'cancelReservation', reservationId });
    if (json.success) {
      showToast('キャンセルしました', 'success');
      await loadReservations();
      invalidateCalCache();
    } else {
      showToast('エラー: ' + json.message, 'error');
    }
  } catch (err) {
    showToast('通信エラー', 'error');
  } finally {
    showOverlay(false);
  }
}

// ============================================================
// 削除確認
// ============================================================
function confirmDelete(reservationId, name) {
  document.getElementById('confirmTitle').textContent   = '削除の確認';
  document.getElementById('confirmMessage').textContent =
    `「${name}」様の予約を完全に削除します。\nこの操作は元に戻せません。本当に削除しますか？`;
  document.getElementById('confirmOkBtn').className     = 'adm-btn adm-btn--danger adm-btn--lg';
  document.getElementById('confirmOkBtn').style.background = '';
  document.getElementById('confirmOkBtn').style.color    = '';
  document.getElementById('confirmOkBtn').onclick        = () => executeDelete(reservationId);
  document.getElementById('confirmModal').classList.add('is-open');
}

async function executeDelete(reservationId) {
  closeConfirmModal();
  showOverlay(true);
  try {
    const json = await postAction({ action: 'deleteReservation', reservationId });
    if (json.success) {
      showToast('削除しました', 'success');
      await loadReservations();
      invalidateCalCache();
    } else {
      showToast('エラー: ' + json.message, 'error');
    }
  } catch (err) {
    showToast('通信エラー', 'error');
  } finally {
    showOverlay(false);
  }
}

function closeConfirmModal() {
  document.getElementById('confirmModal').classList.remove('is-open');
}

// ============================================================
// カレンダービュー
// ============================================================
function onCalAreaChange() {
  calAreaFilter = document.getElementById('calAreaSelect').value;
  if (calAvailability[calMondayStr()]) {
    renderCalendarTable(getCalWeekDates(), calAvailability[calMondayStr()]);
  }
}

function onCalPrev() {
  if (weekOffset > -2) { weekOffset--; updateCalWeekNav(); loadCalendarData(); }
}
function onCalNext() {
  if (weekOffset < 12) { weekOffset++; updateCalWeekNav(); loadCalendarData(); }
}
function onCalToday() {
  weekOffset = 0; updateCalWeekNav(); loadCalendarData();
}

function calMondayStr() { return toISODate(getCalMonday()); }

function getCalMonday() {
  const today = new Date();
  today.setHours(0,0,0,0);
  const dow  = today.getDay();
  const diff = dow === 0 ? -6 : 1 - dow;
  const mon  = new Date(today);
  mon.setDate(today.getDate() + diff + weekOffset * 7);
  return mon;
}

function getCalWeekDates() {
  const mon = getCalMonday();
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(mon);
    d.setDate(d.getDate() + i);
    return d;
  });
}

function updateCalWeekNav() {
  const dates = getCalWeekDates();
  document.getElementById('calWeekLabel').textContent =
    `${dates[0].getMonth()+1}月${dates[0].getDate()}日 〜 ${dates[6].getMonth()+1}月${dates[6].getDate()}日`;
  document.getElementById('calPrevWeek').disabled = weekOffset <= -2;
  document.getElementById('calNextWeek').disabled = weekOffset >= 12;
  document.getElementById('calTodayBtn').style.display = weekOffset !== 0 ? 'inline-block' : 'none';
}

async function loadCalendarData() {
  updateCalWeekNav();
  const mondayStr = calMondayStr();

  if (calAvailability[mondayStr]) {
    renderCalendarTable(getCalWeekDates(), calAvailability[mondayStr]);
    return;
  }

  setCalState('loading');
  try {
    const [availRes, resRes] = await Promise.all([
      fetch(`${GAS_URL}?action=getWeekAvailability&startDate=${encodeURIComponent(mondayStr)}`, { cache: 'no-store' }),
      fetch(`${GAS_URL}?action=getReservations&startDate=${encodeURIComponent(mondayStr)}&endDate=${encodeURIComponent(calSundayStr())}`, { cache: 'no-store' }),
    ]);
    const [availJson, resJson] = await Promise.all([availRes.json(), resRes.json()]);

    if (!availJson.success) throw new Error(availJson.message);
    calAvailability[mondayStr] = availJson.availability || {};

    // 週の予約データを allReservations にマージ
    if (resJson.success) {
      const weekRes = resJson.reservations || [];
      weekRes.forEach(r => {
        if (!allReservations.find(x => x['予約ID'] === r['予約ID'])) {
          allReservations.push(r);
        }
      });
    }

    renderCalendarTable(getCalWeekDates(), calAvailability[mondayStr]);
  } catch (err) {
    console.error('[管理カレンダー] 読み込みエラー:', err);
    setCalState('error');
  }
}

function calSundayStr() {
  const dates = getCalWeekDates();
  return toISODate(dates[6]);
}

function setCalState(state) {
  document.getElementById('calLoading').style.display   = state === 'loading' ? 'flex' : 'none';
  document.getElementById('calError').style.display     = state === 'error'   ? 'flex' : 'none';
  document.getElementById('calTableWrap').style.display = state === 'table'   ? 'block': 'none';
}

function renderCalendarTable(weekDates, availability) {
  const table = document.getElementById('calTable');
  const today = new Date();
  today.setHours(0,0,0,0);

  table.innerHTML = '';

  // ヘッダー
  const thead = table.createTHead();
  const hRow  = thead.insertRow();

  const thTime = document.createElement('th');
  thTime.className = 'adm-cal-th-time';
  thTime.textContent = '時間';
  hRow.appendChild(thTime);

  weekDates.forEach(date => {
    const th  = document.createElement('th');
    const dow = date.getDay();
    const isToday = date.getTime() === today.getTime();
    let cls = 'adm-cal-th-date';
    if (isToday)   cls += ' adm-th-today';
    if (dow === 6) cls += ' adm-th-sat';
    if (dow === 0) cls += ' adm-th-sun';
    th.className = cls;
    th.innerHTML = `<span class="adm-th-day">${DAY_NAMES[dow]}</span><span class="adm-th-date-num">${date.getMonth()+1}/${date.getDate()}</span>`;
    hRow.appendChild(th);
  });

  // ボディ
  const tbody = table.createTBody();

  TIME_SLOTS.forEach(time => {
    const tr = tbody.insertRow();

    const tdTime = tr.insertCell();
    tdTime.className = 'adm-cal-td-time';
    tdTime.textContent = time;

    weekDates.forEach(date => {
      const dateStr = toISODate(date);
      const td      = tr.insertCell();
      const dow     = date.getDay();

      let cls = 'adm-cal-td-slot';
      if (date.getTime() === today.getTime()) cls += ' adm-cal-td-today';
      else if (dow === 6) cls += ' adm-cal-td-sat';
      else if (dow === 0) cls += ' adm-cal-td-sun';
      td.className = cls;

      // スロット内の予約数
      const slotCount = countReservationsInSlot(dateStr, time);
      const isPast    = isSlotPast(date, time);

      // 管理者は締切日関係なくすべて操作可能
      const isDeadline = !isPast && isBeforeDeadline(date);
      const laneCount  = ((availability[dateStr] || {})[time]) || 0;
      const status     = getSlotStatus(availability, dateStr, time, calAreaFilter);

      const btn = document.createElement('button');
      btn.type  = 'button';

      if (isPast) {
        btn.className   = 'adm-slot-deadline';
        btn.textContent = '─';
        btn.disabled    = true;
      } else if (isDeadline) {
        // 締切済みでも管理者は操作可
        btn.className   = laneCount >= MAX_LANES ? 'adm-slot-x' : (laneCount === 1 ? 'adm-slot-tri' : 'adm-slot-o');
        btn.textContent = laneCount >= MAX_LANES ? '×' : (laneCount === 1 ? '△' : '〇');
        btn.setAttribute('aria-label', `${formatDate(dateStr)} ${time} （締切済）`);
        btn.style.opacity = '0.7';
        btn.addEventListener('click', () => openSlotModal(dateStr, time));
      } else {
        btn.className   = status === 'x' ? 'adm-slot-x' : (status === 'tri' ? 'adm-slot-tri' : 'adm-slot-o');
        btn.textContent = status === 'x' ? '×' : (status === 'tri' ? '△' : '〇');
        btn.setAttribute('aria-label', `${formatDate(dateStr)} ${time} 予約状況を確認`);
        btn.addEventListener('click', () => openSlotModal(dateStr, time));
      }

      // 予約数バッジ（予約が入っている場合）
      if (slotCount > 0 && !isPast) {
        const badge = document.createElement('span');
        badge.className   = 'adm-slot-badge';
        badge.textContent = slotCount;
        btn.style.position = 'relative';
        btn.appendChild(badge);
      }

      td.appendChild(btn);
    });
  });

  setCalState('table');
}

function getSlotStatus(availability, dateStr, time, area) {
  if (!area) {
    const count = ((availability[dateStr] || {})[time]) || 0;
    if (count >= MAX_LANES) return 'x';
    if (count === 1) return 'tri';
    return 'o';
  }
  const duration  = THREE_HOUR_AREAS.includes(area) ? 3 : 1;
  const startHour = parseInt(time.split(':')[0], 10);
  if (startHour + duration > 18) return 'x';
  let maxLanes = 0;
  for (let h = 0; h < duration; h++) {
    const checkHour = startHour + h;
    const checkTime = (checkHour < 10 ? '0' : '') + checkHour + ':00';
    const lanes = ((availability[dateStr] || {})[checkTime]) || 0;
    if (lanes >= MAX_LANES) return 'x';
    if (lanes > maxLanes) maxLanes = lanes;
  }
  return maxLanes === 0 ? 'o' : maxLanes === 1 ? 'tri' : 'x';
}

function countReservationsInSlot(dateStr, timeStr) {
  const slotHour = parseInt(timeStr.split(':')[0], 10);
  return allReservations.filter(r => {
    if (r['希望日'] !== dateStr) return false;
    if (r['ステータス'] !== '予約済み') return false;
    const startHour = parseInt((r['希望時間'] || '').split(':')[0], 10);
    const hours     = parseInt(r['予約時間数'], 10) || 1;
    return slotHour >= startHour && slotHour < startHour + hours;
  }).length;
}

function isSlotPast(dateObj, timeStr) {
  const now = new Date();
  const [h] = timeStr.split(':').map(Number);
  const slot = new Date(dateObj);
  slot.setHours(h, 0, 0, 0);
  return slot < now;
}

function isBeforeDeadline(dateObj) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = (dateObj - today) / (1000 * 60 * 60 * 24);
  return diff < DEADLINE_DAYS;
}

// ============================================================
// スロットモーダル（管理者向け）
// ============================================================
function openSlotModal(dateStr, time) {
  currentSlotDate = dateStr;
  currentSlotTime = time;

  const duration = calAreaFilter ? (THREE_HOUR_AREAS.includes(calAreaFilter) ? 3 : 1) : 1;
  const endHour  = parseInt(time.split(':')[0], 10) + duration;
  const endTime  = `〜${endHour < 10 ? '0' : ''}${endHour}:00`;

  document.getElementById('slotModalTitle').textContent = `${formatDate(dateStr)} ${time}${calAreaFilter ? endTime : ''}`;

  // このスロットをカバーする予約を検索
  const slotHour = parseInt(time.split(':')[0], 10);
  const rsvList  = allReservations.filter(r => {
    if (r['希望日'] !== dateStr) return false;
    const startHour = parseInt((r['希望時間'] || '').split(':')[0], 10);
    const hours     = parseInt(r['予約時間数'], 10) || 1;
    return slotHour >= startHour && slotHour < startHour + hours;
  });

  let html = `<div class="adm-slot-info"><p class="adm-slot-info__title">現在の予約（${rsvList.length}/${MAX_LANES}枠）</p></div>`;

  if (rsvList.length === 0) {
    html += '<p style="color:#757575;font-size:.88rem;padding:8px 0">まだ予約はありません</p>';
  } else {
    html += '<div class="adm-slot-reservations">';
    rsvList.forEach(r => {
      const isCancelled = r['ステータス'] === 'キャンセル済み';
      html += `
        <div class="adm-slot-reservation-item ${isCancelled ? 'is-cancelled' : ''}">
          <div>
            <p class="adm-slot-res-name">${escHtml(r['代表者氏名'])} ${isCancelled ? '（キャンセル済）' : ''}</p>
            <p class="adm-slot-res-sub">${escHtml(r['学校名'])} / ${escHtml(r['見学希望エリア'])} / ${escHtml(r['予約人数'])}名</p>
            <p class="adm-slot-res-sub" style="font-size:.72rem;color:#9e9e9e">${escHtml(r['予約ID'])}</p>
          </div>
          <div class="adm-slot-res-actions">
            <button class="adm-btn adm-btn--outline adm-btn--sm" onclick="closeSlotModal();openDetailModal('${escHtml(r['予約ID'])}')">詳細</button>
            ${!isCancelled ? `<button class="adm-btn adm-btn--ghost adm-btn--sm" onclick="closeSlotModal();confirmCancel('${escHtml(r['予約ID'])}','${escHtml(r['代表者氏名'])}')">取消</button>` : ''}
          </div>
        </div>`;
    });
    html += '</div>';
  }

  document.getElementById('slotContent').innerHTML = html;

  const activeCount = rsvList.filter(r => r['ステータス'] === '予約済み').length;
  const addBtn = document.getElementById('slotAddBtn');
  addBtn.disabled = activeCount >= MAX_LANES;
  addBtn.onclick  = () => { closeSlotModal(); openAddModal(dateStr, time); };

  document.getElementById('slotModal').classList.add('is-open');
}

function closeSlotModal() {
  document.getElementById('slotModal').classList.remove('is-open');
}

// ============================================================
// 予約追加モーダル
// ============================================================
function openAddModal(date, time) {
  prefilledDate = date || null;
  prefilledTime = time || null;

  // フォームリセット
  document.getElementById('addForm').reset();
  document.querySelectorAll('#addForm .adm-error').forEach(el => el.textContent = '');
  document.querySelectorAll('#addForm .adm-input').forEach(el => el.classList.remove('is-error'));

  // プリフィル
  if (date) document.getElementById('add_date').value = date;
  if (time) document.getElementById('add_time').value = time;
  if (calAreaFilter) document.getElementById('add_area').value = calAreaFilter;

  document.getElementById('addModal').classList.add('is-open');
}

function closeAddModal() {
  document.getElementById('addModal').classList.remove('is-open');
}

async function submitAddForm() {
  // バリデーション
  const requiredText = [
    { id: 'add_representativeName', label: '代表者氏名' },
    { id: 'add_birthDate',          label: '生年月日' },
    { id: 'add_phone',              label: '電話番号' },
    { id: 'add_email',              label: 'メールアドレス' },
    { id: 'add_schoolName',         label: '学校名' },
    { id: 'add_department',         label: '学科' },
    { id: 'add_participant1',       label: '参加者1氏名' },
  ];
  const requiredSelect = [
    { id: 'add_grade', label: '学年' },
    { id: 'add_area',  label: '見学希望エリア' },
    { id: 'add_date',  label: '希望日' },
    { id: 'add_time',  label: '希望時間' },
  ];

  let valid = true;
  [...requiredText, ...requiredSelect].forEach(({ id, label }) => {
    const el = document.getElementById(id);
    if (!el.value.trim()) {
      el.classList.add('is-error');
      const err = document.getElementById(id + 'Error');
      if (err) err.textContent = `${label}を入力してください`;
      valid = false;
    }
  });

  if (!valid) return;

  const payload = {
    action:             'createReservation',
    representativeName: document.getElementById('add_representativeName').value.trim(),
    birthDate:          document.getElementById('add_birthDate').value.trim(),
    phone:              document.getElementById('add_phone').value.trim(),
    email:              document.getElementById('add_email').value.trim(),
    schoolName:         document.getElementById('add_schoolName').value.trim(),
    grade:              document.getElementById('add_grade').value,
    department:         document.getElementById('add_department').value.trim(),
    area:               document.getElementById('add_area').value,
    date:               document.getElementById('add_date').value,
    time:               document.getElementById('add_time').value,
    participant1:       document.getElementById('add_participant1').value.trim(),
    participant2:       document.getElementById('add_participant2').value.trim(),
    participant3:       document.getElementById('add_participant3').value.trim(),
    memo:               document.getElementById('add_memo').value.trim(),
    bypassDeadline:     true, // 管理者は締切ルールをスキップ
  };

  document.getElementById('addSubmitBtn').disabled = true;
  showOverlay(true);

  try {
    const json = await postAction(payload);
    if (json.success) {
      showToast(`予約を追加しました（${json.reservationId}）`, 'success');
      closeAddModal();
      await loadReservations();
      invalidateCalCache();
      if (document.getElementById('calendarView').style.display !== 'none') {
        loadCalendarData();
      }
    } else {
      showToast('エラー: ' + json.message, 'error');
    }
  } catch (err) {
    showToast('通信エラー', 'error');
  } finally {
    document.getElementById('addSubmitBtn').disabled = false;
    showOverlay(false);
  }
}

// ============================================================
// API通信
// ============================================================
async function postAction(payload) {
  const res = await fetch(GAS_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body:    JSON.stringify(payload),
  });
  return res.json();
}

function invalidateCalCache() {
  Object.keys(calAvailability).forEach(k => delete calAvailability[k]);
}

// ============================================================
// UI ヘルパー
// ============================================================
function showOverlay(visible) {
  const el = document.getElementById('admLoadingOverlay');
  el.classList.toggle('is-visible', visible);
}

let toastTimer = null;
function showToast(msg, type) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className   = `adm-toast is-show ${type === 'success' ? 'is-success' : type === 'error' ? 'is-error' : ''}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.className = 'adm-toast'; }, 3000);
}

function toISODate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function formatDate(dateStr) {
  if (!dateStr || !dateStr.includes('-')) return dateStr || '';
  const [y, m, d] = dateStr.split('-').map(Number);
  const dow = new Date(y, m - 1, d).getDay();
  return `${y}年${m}月${d}日（${DAY_NAMES[dow]}）`;
}

function escHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
