// ============================================================
//  見学予約システム - Google Apps Script
//  株式会社リーフ採用向け
// ============================================================

const SHEET_NAME   = '予約一覧';
const MAX_PER_SLOT = 2;
const TIMEZONE     = 'Asia/Tokyo';

// ============================================================
// GET ハンドラ
// ============================================================
function doGet(e) {
  var p = e.parameter;

  if (p.action === 'getWeekAvailability' && p.startDate) {
    return handleGetWeekAvailability(p.startDate);
  }
  if (p.action === 'getAvailability' && p.date) {
    return handleGetAvailability(p.date);
  }

  return jsonResponse({ success: true, message: 'GAS is running. ' + new Date().toISOString() });
}

// ============================================================
// POST ハンドラ（予約登録）
// ============================================================
function doPost(e) {
  var lock = LockService.getScriptLock();

  try {
    lock.waitLock(15000);

    var data = JSON.parse(e.postData.contents);

    // ----- 入力バリデーション -----
    var required = ['studentName', 'schoolName', 'date', 'time', 'staffName'];
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
    appendReservation(sheet, data);

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
// startDate: 'YYYY-MM-DD'（月曜日）
// ============================================================
function handleGetWeekAvailability(startDate) {
  try {
    var sheet = getOrCreateSheet();
    var slots = ['09:00','10:00','11:00','12:00','13:00','14:00','15:00','16:00','17:00'];
    var result = {};

    var parts    = startDate.split('-');
    var baseDate = new Date(parseInt(parts[0],10), parseInt(parts[1],10)-1, parseInt(parts[2],10));

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
// 予約件数カウント
//
// ★修正ポイント★
//  - ヘッダー行から列名で列番号を動的取得（固定インデックス廃止）
//  - ステータス = '予約済み' の行だけカウント
//  - 日付・時間を正規化してから比較（"9:00"/"09:00" 混在に対応）
// ============================================================
function countReservations(sheet, targetDate, targetTime) {
  var data = sheet.getDataRange().getValues();
  if (data.length < 2) return 0;

  // ヘッダー行から列インデックスを動的に取得
  var headers   = data[0];
  var dateCol   = findColumnIndex(headers, '希望日');
  var timeCol   = findColumnIndex(headers, '希望時間');
  var statusCol = findColumnIndex(headers, 'ステータス');

  if (dateCol === -1 || timeCol === -1) {
    Logger.log('countReservations: 希望日 または 希望時間 の列が見つかりません');
    return 0;
  }

  // 比較対象も正規化しておく
  var normTarget  = normalizeDate(targetDate);
  var normTgtTime = normalizeTime(targetTime);

  var count = 0;
  for (var i = 1; i < data.length; i++) {
    var row = data[i];

    // 空行スキップ
    if (row[dateCol] === '' || row[dateCol] === null || row[dateCol] === undefined) continue;

    // ★ステータスが「予約済み」の行だけカウント
    if (statusCol !== -1) {
      var status = String(row[statusCol]).trim();
      if (status !== '予約済み') continue;
    }
    // statusCol === -1 のとき（ステータス列なし）は全件カウント（旧データ互換）

    var rowDate = normalizeDate(row[dateCol]);
    var rowTime = normalizeTime(row[timeCol]);

    if (rowDate === normTarget && rowTime === normTgtTime) {
      count++;
    }
  }

  return count;
}

// ============================================================
// ヘッダー名から列インデックスを取得（-1 = 見つからない）
// ============================================================
function findColumnIndex(headers, name) {
  for (var i = 0; i < headers.length; i++) {
    if (String(headers[i]).trim() === name) return i;
  }
  return -1;
}

// ============================================================
// スプレッドシートへ予約を書き込む
// ★ヘッダーを読んで列名で位置を決めるため、旧フォーマット（電話・メール列あり）でも動作
// ============================================================
function appendReservation(sheet, data) {
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var now       = new Date();
  var timestamp = Utilities.formatDate(now, TIMEZONE, 'yyyy/MM/dd HH:mm:ss');

  // 列名と書き込む値の対応表
  var valueMap = {
    '受付日時':       timestamp,
    '学生氏名':       data.studentName.trim(),
    '学校名':         data.schoolName.trim(),
    '電話番号':       '',   // 旧フォーマット対応（空欄）
    'メールアドレス':  '',   // 旧フォーマット対応（空欄）
    '希望日':         data.date,
    '希望時間':       data.time,
    '担当者名':       data.staffName.trim(),
    'メモ':           (data.memo || '').trim(),
    'ステータス':     '予約済み',
  };

  var row = [];
  for (var i = 0; i < headers.length; i++) {
    var h = String(headers[i]).trim();
    row.push(valueMap.hasOwnProperty(h) ? valueMap[h] : '');
  }

  sheet.appendRow(row);
  formatLastRow(sheet);
}

// ============================================================
// シート取得 or 作成
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

// 新フォーマット（電話・メールなし）でシートを初期化
function initSheet(sheet) {
  var headers = ['受付日時', '学生氏名', '学校名', '希望日', '希望時間', '担当者名', 'メモ', 'ステータス'];
  sheet.appendRow(headers);
  sheet.setFrozenRows(1);

  var hr = sheet.getRange(1, 1, 1, headers.length);
  hr.setBackground('#2e7d32');
  hr.setFontColor('#ffffff');
  hr.setFontWeight('bold');
  hr.setHorizontalAlignment('center');

  var widths = [160, 110, 160, 100, 90, 110, 220, 90];
  for (var i = 0; i < widths.length; i++) {
    sheet.setColumnWidth(i + 1, widths[i]);
  }

  // 希望日(D), 希望時間(E) をテキスト形式に（自動変換防止）
  setTextFormat(sheet, headers);
}

// 希望日・希望時間列をテキスト形式に設定
function setTextFormat(sheet, headers) {
  var headersArr = headers || sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
