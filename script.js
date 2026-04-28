// ============================================================
//  ★★★ ここにGoogle Apps ScriptのウェブアプリURLを貼ってください ★★★
//  例: 'https://script.google.com/macros/s/AKfyc.../exec'
// ============================================================
const GAS_URL = 'AKfycbzDTdIS8RcWP6omnqsi6gZgDD2E_Ndp0b8l9HqSLM31XlW_vFGhF3Wh1gvQnFy9WIRt';

// 時間スロット定義（9:00〜17:00、各1時間枠）
const TIME_SLOTS = [
  { time: '09:00', label: '09:00', range: '〜10:00' },
  { time: '10:00', label: '10:00', range: '〜11:00' },
  { time: '11:00', label: '11:00', range: '〜12:00' },
  { time: '12:00', label: '12:00', range: '〜13:00' },
  { time: '13:00', label: '13:00', range: '〜14:00' },
  { time: '14:00', label: '14:00', range: '〜15:00' },
  { time: '15:00', label: '15:00', range: '〜16:00' },
  { time: '16:00', label: '16:00', range: '〜17:00' },
  { time: '17:00', label: '17:00', range: '〜18:00' },
];

const MAX_PER_SLOT = 2;

// 現在選択中の時間
let selectedTime = null;

// ============================================================
// 初期化
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
  const dateInput = document.getElementById('date');

  // 今日〜6ヶ月後を選択可能範囲に設定
  const today = new Date();
  const maxDate = new Date(today);
  maxDate.setMonth(maxDate.getMonth() + 6);

  dateInput.min = toISODate(today);
  dateInput.max = toISODate(maxDate);

  // 日付変更時に時間スロットを読み込む
  dateInput.addEventListener('change', () => {
    const date = dateInput.value;
    if (date) {
      loadTimeSlots(date);
      clearError('dateError');
    } else {
      resetTimeGrid();
    }
  });

  // フォーム送信
  document.getElementById('reservationForm').addEventListener('submit', handleSubmit);

  // 入力フィールドのリアルタイムバリデーション（送信後のエラーをクリア）
  document.querySelectorAll('.form-input, .form-textarea').forEach(el => {
    el.addEventListener('input', () => {
      const errorId = el.id + 'Error';
      if (document.getElementById(errorId)) {
        clearError(errorId);
        el.classList.remove('is-error');
      }
    });
  });
});

// ============================================================
// 時間スロット - 空き枠読み込み
// ============================================================
async function loadTimeSlots(date) {
  const grid = document.getElementById('timeGrid');
  const hint = document.createElement('p');
  hint.className = 'time-hint is-loading';
  hint.textContent = '空き枠を確認しています...';
  grid.innerHTML = '';
  grid.appendChild(hint);

  selectedTime = null;
  document.getElementById('selectedTime').value = '';

  // GAS URLが未設定の場合はデモ表示
  if (GAS_URL === 'YOUR_GAS_URL_HERE') {
    console.warn('[見学予約] GAS URLが設定されていません。デモ表示をします。');
    setTimeout(() => renderTimeGrid({}), 500);
    return;
  }

  try {
    const url = `${GAS_URL}?action=getAvailability&date=${encodeURIComponent(date)}`;
    const res = await fetch(url, { cache: 'no-store' });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const json = await res.json();

    if (json.success) {
      renderTimeGrid(json.availability || {});
    } else {
      showGridError('空き枠の取得に失敗しました。再度お試しください。');
    }
  } catch (err) {
    console.error('[見学予約] 空き枠取得エラー:', err);
    showGridError('通信エラーが発生しました。\n通信環境を確認して再度お試しください。');
  }
}

// 時間スロットグリッドを描画
function renderTimeGrid(availability) {
  const grid = document.getElementById('timeGrid');
  grid.innerHTML = '';

  TIME_SLOTS.forEach(({ time, label, range }) => {
    const count = (availability[time] !== undefined) ? Number(availability[time]) : 0;
    const remaining = MAX_PER_SLOT - count;
    const isFull = remaining <= 0;
    const isOneLeft = remaining === 1;

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.setAttribute('data-time', time);
    btn.disabled = isFull;

    let statusText;
    let statusClass;

    if (isFull) {
      statusText = '満席';
      statusClass = 'time-btn--full';
    } else if (isOneLeft) {
      statusText = '残1枠';
      statusClass = 'time-btn--one-left time-btn--available';
    } else {
      statusText = `残${remaining}枠`;
      statusClass = 'time-btn--available';
    }

    btn.className = `time-btn ${statusClass}`;
    btn.innerHTML = `
      <span class="time-btn__label">${label}</span>
      <span class="time-btn__range">${range}</span>
      <span class="time-btn__status">${statusText}</span>
    `;

    if (!isFull) {
      btn.addEventListener('click', () => onSelectTime(time, btn));
    }

    grid.appendChild(btn);
  });
}

// 時間を選択する
function onSelectTime(time, clickedBtn) {
  document.querySelectorAll('.time-btn').forEach(b => {
    b.classList.remove('time-btn--selected');
  });

  clickedBtn.classList.add('time-btn--selected');
  selectedTime = time;
  document.getElementById('selectedTime').value = time;
  clearError('timeError');
}

// グリッドをリセット（日付未選択状態）
function resetTimeGrid() {
  const grid = document.getElementById('timeGrid');
  grid.innerHTML = '<p class="time-hint">先に希望日を選択してください</p>';
  selectedTime = null;
  document.getElementById('selectedTime').value = '';
}

// グリッドにエラー表示
function showGridError(message) {
  const grid = document.getElementById('timeGrid');
  grid.innerHTML = `<p class="time-hint" style="color:#c62828;">${message}</p>`;
}

// ============================================================
// フォームバリデーション
// ============================================================
function validateForm() {
  let isValid = true;

  const requiredFields = [
    { id: 'studentName', errorId: 'studentNameError', label: '学生氏名' },
    { id: 'schoolName',  errorId: 'schoolNameError',  label: '学校名' },
    { id: 'phone',       errorId: 'phoneError',       label: '電話番号' },
    { id: 'email',       errorId: 'emailError',       label: 'メールアドレス' },
    { id: 'date',        errorId: 'dateError',        label: '希望日' },
    { id: 'staffName',   errorId: 'staffNameError',   label: '担当者名' },
  ];

  requiredFields.forEach(({ id, errorId, label }) => {
    const el = document.getElementById(id);
    const val = el.value.trim();
    if (!val) {
      showError(errorId, `${label}を入力してください`);
      el.classList.add('is-error');
      isValid = false;
    } else {
      clearError(errorId);
      el.classList.remove('is-error');
    }
  });

  // メールアドレス形式チェック
  const emailEl = document.getElementById('email');
  const emailVal = emailEl.value.trim();
  if (emailVal && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailVal)) {
    showError('emailError', '正しいメールアドレスを入力してください');
    emailEl.classList.add('is-error');
    isValid = false;
  }

  // 時間スロット選択チェック
  if (!selectedTime) {
    showError('timeError', '希望時間を選択してください');
    isValid = false;
  } else {
    clearError('timeError');
  }

  return isValid;
}

// ============================================================
// フォーム送信
// ============================================================
async function handleSubmit(e) {
  e.preventDefault();

  if (!validateForm()) {
    // 最初のエラー項目にスクロール
    const firstError = document.querySelector('.error-msg:not(:empty), .is-error');
    if (firstError) {
      firstError.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    return;
  }

  if (GAS_URL === 'YOUR_GAS_URL_HERE') {
    openErrorModal(
      'GAS URLが設定されていません。\n\nREADME.mdの手順に従って\nscript.js の GAS_URL を設定してください。'
    );
    return;
  }

  const payload = {
    studentName: document.getElementById('studentName').value.trim(),
    schoolName:  document.getElementById('schoolName').value.trim(),
    phone:       document.getElementById('phone').value.trim(),
    email:       document.getElementById('email').value.trim(),
    date:        document.getElementById('date').value,
    time:        selectedTime,
    staffName:   document.getElementById('staffName').value.trim(),
    memo:        document.getElementById('memo').value.trim(),
  };

  setLoading(true);

  try {
    const res = await fetch(GAS_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body:    JSON.stringify(payload),
    });

    const json = await res.json();

    if (json.success) {
      openSuccessModal(payload);
      // 送信成功後に時間スロットを再読み込みして残枠を更新
      loadTimeSlots(payload.date);
    } else {
      openErrorModal(json.message || '予約の登録に失敗しました。\nしばらく待ってから再度お試しください。');
      // 満席になっていた場合は再読み込み
      if (payload.date) loadTimeSlots(payload.date);
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
  const dateLabel = formatJpDate(data.date);
  const slot = TIME_SLOTS.find(t => t.time === data.time);
  const timeLabel = slot ? `${slot.label}${slot.range}` : data.time;

  document.getElementById('successDetails').innerHTML = `
    <strong>${escapeHtml(data.studentName)}</strong> 様<br>
    ${escapeHtml(dateLabel)}<br>
    ${escapeHtml(timeLabel)} にて見学予約を受け付けました。
  `;

  const modal = document.getElementById('successModal');
  modal.classList.add('is-open');
}

function closeSuccessModal() {
  document.getElementById('successModal').classList.remove('is-open');
  resetForm();
}

function openErrorModal(message) {
  document.getElementById('errorMessage').textContent = message;
  document.getElementById('errorModal').classList.add('is-open');
}

function closeErrorModal() {
  document.getElementById('errorModal').classList.remove('is-open');
}

// グローバルに公開（HTMLのonclick属性から呼ぶ）
window.closeSuccessModal = closeSuccessModal;
window.closeErrorModal   = closeErrorModal;

// ============================================================
// フォームリセット
// ============================================================
function resetForm() {
  document.getElementById('reservationForm').reset();
  selectedTime = null;
  resetTimeGrid();

  document.querySelectorAll('.error-msg').forEach(el => (el.textContent = ''));
  document.querySelectorAll('.is-error').forEach(el => el.classList.remove('is-error'));

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ============================================================
// ユーティリティ
// ============================================================
function setLoading(isLoading) {
  const overlay = document.getElementById('loadingOverlay');
  const btn = document.getElementById('submitBtn');
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

function showError(id, msg) {
  const el = document.getElementById(id);
  if (el) el.textContent = msg;
}

function clearError(id) {
  const el = document.getElementById(id);
  if (el) el.textContent = '';
}

function toISODate(date) {
  return date.toISOString().split('T')[0];
}

function formatJpDate(dateStr) {
  // "2024-04-01" → "2024年4月1日（月）"
  const [year, month, day] = dateStr.split('-').map(Number);
  const d = new Date(year, month - 1, day);
  const weekDays = ['日', '月', '火', '水', '木', '金', '土'];
  return `${year}年${month}月${day}日（${weekDays[d.getDay()]}）`;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
