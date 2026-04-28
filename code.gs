// ============================================================
//  見学予約システム - Google Apps Script
//  株式会社リーフ採用向け
// ============================================================

const SHEET_NAME   = '予約一覧';
const MAX_PER_SLOT = 2;
const TIMEZONE     = 'Asia/Tokyo';

// スプレッドシートの列インデックス（0始まり）
const COL = {
  TIMESTAMP:    0,
  STUDENT_NAME: 1,
  SCHOOL_NAME:  2,
  PHONE:        3,
  EMAIL:        4,
  DATE:         5,
  TIME:         6,
  STAFF_NAME:   7,
  MEMO:         8,
  STATUS:       9,
};

// ============================================================
// GET ハンドラ
// ============================================================
function doGet(e) {
  const p = e.parameter;

  // 1週間の空き枠取得
  if (p.action === 'getWeekAvailability' && p.startDate) {
    return handleGetWeekAvailability(p.startDate);
  }

  // 1日の空き枠取得（後方互換）
  if (p.action === 'getAvailability' && p.date) {
    return handleGetAvailability(p.date);
  }

  // 動作確認用
  return jsonResponse({ success: true, message: 'GAS is running. date=' + new Date().toISOString() });
}

// ============================================================
// POST ハンドラ（予約登録）
// ============================================================
function doPost(e) {
  const lock = LockService.getScriptLock();

  try {
    lock.waitLock(15000);

    var data = JSON.parse(e.postData.contents);

    // ----- 入力バリデーション -----
    var required = ['studentName', 'schoolName', 'phone', 'email', 'date', 'time', 'staffName'];
    for (var i = 0; i < required.length; i++) {
      var key = required[i];
      if (!data[key] || String(data[key]).trim() === '') {
        return jsonResponse({ success: false, message: '必須項目が入力されていません。' });
      }
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(data.date)) {
      return jsonResponse({ success: false, message: '日付の形式が正しくありません。' });
    }

    if (!/^\d{2}:\d{2}$/.test(data.time)) {
      return jsonResponse({ success: false, message: '時間の形式が正しくありません。' });
    }

    var sheet = getOrCreateSheet();

    // ----- 空き枠チェック（二重登録防止） -----
    var count = countReservations(sheet, data.date, data.time);
    if (count >= MAX_PER_SLOT) {
      return jsonResponse({
        success: false,
        message: 'この時間帯はすでに予約が埋まっています。\n別の時間帯を選択してください。',
      });
    }

    // ----- スプレッドシートに書き込み -----
    var now       = new Date();
    var timestamp = Utilities.formatDate(now, TIMEZONE, 'yyyy/MM/dd HH:mm:ss');

    sheet.appendRow([
      timestamp,
      data.studentName.trim(),
      data.schoolName.trim(),
      data.phone.trim(),
      data.email.trim(),
      data.date,
      data.time,
      data.staffName.trim(),
      (data.memo || '').trim(),
      '予約済み',
    ]);

    formatLastRow(sheet);

    return jsonResponse({
      success: true,
      message: '予約が完了しました',
      data: {
        studentName: data.studentName.trim(),
        date:        data.date,
        time:        data.time,
      },
    });

  } catch (err) {
    Logger.log('doPost error: ' + err.toString());
    return jsonResponse({ success: false, message: 'サーバーエラーが発生しました。' });
  } finally {
    lock.releaseLock();
  }
}

// ============================================================
// 1週間の空き枠取得
// 引数 startDate: 'YYYY-MM-DD'（月曜日）
// 戻り値: { success: true, availability: { 'YYYY-MM-DD': { 'HH:mm': count } } }
// ============================================================
function handleGetWeekAvailability(startDate) {
  try {
    var sheet = getOrCreateSheet();
    var slots = ['09:00','10:00','11:00','12:00','13:00','14:00','15:00','16:00','17:00'];
    var result = {};

    // startDate を年月日に分解して Date を生成（タイムゾーン問題を回避）
    var parts = startDate.split('-');
    var year  = parseInt(parts[0], 10);
    var month = parseInt(parts[1], 10) - 1; // 0始まり
    var day   = parseInt(parts[2], 10);
    var baseDate = new Date(year, month, day);

    for (var i = 0; i < 7; i++) {
      var d = new Date(baseDate);
      d.setDate(baseDate.getDate() + i);
      var dateStr = Utilities.formatDate(d, TIMEZONE, 'yyyy-MM-dd');

      result[dateStr] = {};
      for (var j = 0; j < slots.length; j++) {
        result[dateStr][slots[j]] = countReservations(sheet, dateStr, slots[j]);
      }
    }

    return jsonResponse({ success: true, availability: result });
  } catch (err) {
    Logger.log('handleGetWeekAvailability error: ' + err.toString());
    return jsonResponse({ success: false, message: err.message });
  }
}

// ============================================================
// 1日の空き枠取得（後方互換）
// ============================================================
function handleGetAvailability(date) {
  try {
    var sheet  = getOrCreateSheet();
    var slots  = ['09:00','10:00','11:00','12:00','13:00','14:00','15:00','16:00','17:00'];
    var result = {};

    for (var i = 0; i < slots.length; i++) {
      result[slots[i]] = countReservations(sheet, date, slots[i]);
    }

    return jsonResponse({ success: true, availability: result });
  } catch (err) {
    Logger.log('handleGetAvailability error: ' + err.toString());
    return jsonResponse({ success: false, message: err.message });
  }
}

// ============================================================
// 指定日・時間の予約件数をカウント
// ============================================================
function countReservations(sheet, targetDate, targetTime) {
  var data  = sheet.getDataRange().getValues();
  var count = 0;

  for (var i = 1; i < data.length; i++) {
    var status = String(data[i][COL.STATUS]).trim();

    // キャンセル済みはカウントしない
    if (status === 'キャンセル') continue;

    var rowDate = normalizeDate(data[i][COL.DATE]);
    var rowTime = normalizeTime(data[i][COL.TIME]);

    if (rowDate === targetDate && rowTime === targetTime) {
      count++;
    }
  }

  return count;
}

// ============================================================
// シート取得 or 作成（初回のみヘッダーを自動生成）
// ============================================================
function getOrCreateSheet() {
  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME);

  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    initSheet(sheet);
  }

  return sheet;
}

function initSheet(sheet) {
  var headers = [
    '受付日時', '学生氏名', '学校名', '電話番号', 'メールアドレス',
    '希望日', '希望時間', '担当者名', 'メモ', 'ステータス',
  ];

  sheet.appendRow(headers);
  sheet.setFrozenRows(1);

  // ヘッダー書式
  var hr = sheet.getRange(1, 1, 1, headers.length);
  hr.setBackground('#2e7d32');
  hr.setFontColor('#ffffff');
  hr.setFontWeight('bold');
  hr.setHorizontalAlignment('center');

  // 列幅
  var widths = [160, 110, 160, 130, 190, 100, 90, 110, 220, 90];
  for (var i = 0; i < widths.length; i++) {
    sheet.setColumnWidth(i + 1, widths[i]);
  }

  // 希望日・希望時間列をテキスト形式に設定（自動変換を防ぐ）
  sheet.getRange('F:F').setNumberFormat('@');
  sheet.getRange('G:G').setNumberFormat('@');
}

function formatLastRow(sheet) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return;
  var range = sheet.getRange(lastRow, 1, 1, 10);
  range.setVerticalAlignment('middle');
  if (lastRow % 2 === 0) {
    range.setBackground('#f9fbe7');
  }
}

// ============================================================
// 型正規化（Googleスプレッドシートはセル値を自動変換することがある）
// ============================================================
function normalizeDate(value) {
  if (value instanceof Date) {
    return Utilities.formatDate(value, TIMEZONE, 'yyyy-MM-dd');
  }
  return String(value).trim();
}

function normalizeTime(value) {
  if (value instanceof Date) {
    return Utilities.formatDate(value, TIMEZONE, 'HH:mm');
  }
  // 数値の場合（例: 0.375 = 9/24時間 = 9:00）
  if (typeof value === 'number') {
