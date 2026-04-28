// ============================================================
//  見学予約システム - Google Apps Script
//  株式会社リーフ採用向け
// ============================================================

// ---- 設定 ------------------------------------------------
const SHEET_NAME    = '予約一覧';
const MAX_PER_SLOT  = 2;      // 同時間帯の最大予約数
const TIMEZONE      = 'Asia/Tokyo';

// 列インデックス（0始まり）
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

// ---- GET ハンドラ -----------------------------------------
// 空き枠確認: ?action=getAvailability&date=YYYY-MM-DD
function doGet(e) {
  const params = e.parameter;

  if (params.action === 'getAvailability' && params.date) {
    return handleGetAvailability(params.date);
  }

  // 動作確認用
  return jsonResponse({ success: true, message: 'GAS is running.' });
}

// ---- POST ハンドラ ----------------------------------------
// 予約登録
function doPost(e) {
  // 同時送信によるレース条件を防ぐためロックを取得
  const lock = LockService.getScriptLock();

  try {
    lock.waitLock(15000); // 最大15秒待機

    const data = JSON.parse(e.postData.contents);

    // ---- 入力バリデーション ----
    const required = ['studentName', 'schoolName', 'phone', 'email', 'date', 'time', 'staffName'];
    for (const key of required) {
      if (!data[key] || String(data[key]).trim() === '') {
        return jsonResponse({ success: false, message: '必須項目が入力されていません。' });
      }
    }

    // 日付形式チェック (YYYY-MM-DD)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data.date)) {
      return jsonResponse({ success: false, message: '日付の形式が正しくありません。' });
    }

    // 時間形式チェック (HH:mm)
    if (!/^\d{2}:\d{2}$/.test(data.time)) {
      return jsonResponse({ success: false, message: '時間の形式が正しくありません。' });
    }

    const sheet = getOrCreateSheet();

    // ---- 空き枠チェック ----
    const currentCount = countReservations(sheet, data.date, data.time);
    if (currentCount >= MAX_PER_SLOT) {
      return jsonResponse({
        success: false,
        message: 'この時間帯はすでに予約が埋まっています。\n別の時間帯を選択してください。',
      });
    }

    // ---- スプレッドシートに書き込み ----
    const now = new Date();
    const timestamp = Utilities.formatDate(now, TIMEZONE, 'yyyy/MM/dd HH:mm:ss');

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
      '予約済み', // ステータス（将来のキャンセル機能用に確保）
    ]);

    // 書き込んだ行を固定フォーマットに整える
    formatLastRow(sheet);

    return jsonResponse({
      success: true,
      message: '予約が完了しました',
      data: {
        studentName: data.studentName.trim(),
        date:        data.date,
        time:        data.time,
        staffName:   data.staffName.trim(),
      },
    });

  } catch (err) {
    Logger.log('doPost error: ' + err.toString());
    return jsonResponse({ success: false, message: 'サーバーエラーが発生しました。しばらく後に再度お試しください。' });
  } finally {
    lock.releaseLock();
  }
}

// ============================================================
// 空き枠取得（指定日の全スロット）
// ============================================================
function handleGetAvailability(date) {
  try {
    const sheet  = getOrCreateSheet();
    const slots  = ['09:00','10:00','11:00','12:00','13:00','14:00','15:00','16:00','17:00'];
    const result = {};

    slots.forEach(function(t) {
      result[t] = countReservations(sheet, date, t);
    });

    return jsonResponse({ success: true, availability: result });
  } catch (err) {
    Logger.log('handleGetAvailability error: ' + err.toString());
    return jsonResponse({ success: false, message: err.message });
  }
}

// ============================================================
// 予約件数カウント（指定日・時間）
// ============================================================
function countReservations(sheet, targetDate, targetTime) {
  const data = sheet.getDataRange().getValues();
  var count = 0;

  // 1行目はヘッダーなのでスキップ
  for (var i = 1; i < data.length; i++) {
    var status = String(data[i][COL.STATUS]).trim();

    // キャンセル済みはカウントしない（将来の拡張用）
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

// シートの初期設定（ヘッダー・書式）
function initSheet(sheet) {
  var headers = [
    '受付日時', '学生氏名', '学校名', '電話番号', 'メールアドレス',
    '希望日', '希望時間', '担当者名', 'メモ', 'ステータス',
  ];

  sheet.appendRow(headers);
  sheet.setFrozenRows(1);

  // ヘッダー行の書式
  var headerRange = sheet.getRange(1, 1, 1, headers.length);
  headerRange.setBackground('#2e7d32');
  headerRange.setFontColor('#ffffff');
  headerRange.setFontWeight('bold');
  headerRange.setHorizontalAlignment('center');

  // 列幅
  sheet.setColumnWidth(1, 160); // 受付日時
  sheet.setColumnWidth(2, 110); // 学生氏名
  sheet.setColumnWidth(3, 160); // 学校名
  sheet.setColumnWidth(4, 130); // 電話番号
  sheet.setColumnWidth(5, 190); // メールアドレス
  sheet.setColumnWidth(6, 100); // 希望日
  sheet.setColumnWidth(7, 90);  // 希望時間
  sheet.setColumnWidth(8, 110); // 担当者名
  sheet.setColumnWidth(9, 220); // メモ
  sheet.setColumnWidth(10, 90); // ステータス

  // 希望日・希望時間列をテキスト形式にする（日付・時刻として誤変換を防ぐ）
  sheet.getRange('F:F').setNumberFormat('@');
  sheet.getRange('G:G').setNumberFormat('@');
}

// 最終行の書式を整える
function formatLastRow(sheet) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return;
  var range = sheet.getRange(lastRow, 1, 1, 10);
  range.setVerticalAlignment('middle');
  // 偶数行に薄い色を付けると見やすい
  if (lastRow % 2 === 0) {
    range.setBackground('#f9fbe7');
  }
}

// ============================================================
// 型正規化ユーティリティ
// ============================================================

// Googleスプレッドシートが日付セルをDateオブジェクトとして返す場合の対応
function normalizeDate(value) {
  if (value instanceof Date) {
    return Utilities.formatDate(value, TIMEZONE, 'yyyy-MM-dd');
  }
  return String(value).trim();
}

// 時間セルが数値（小数=時刻の割合）として返ってくる場合の対応
function normalizeTime(value) {
  if (value instanceof Date) {
    return Utilities.formatDate(value, TIMEZONE, 'HH:mm');
  }
  // 数値の場合（例: 0.375 = 9時間/24 = 9:00）
  if (typeof value === 'number') {
    var totalMinutes = Math.round(value * 24 * 60);
    var h = Math.floor(totalMinutes / 60);
    var m = totalMinutes % 60;
    return (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m;
  }
  return String(value).trim().substring(0, 5);
}

// ============================================================
// JSONレスポンス生成
// ============================================================
function jsonResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

// ============================================================
// 【テスト用】スクリプトエディタから手動実行できます
// ============================================================
function testSetup() {
  var sheet = getOrCreateSheet();
  Logger.log('シート名: ' + sheet.getName());
  Logger.log('最終行: ' + sheet.getLastRow());
  Logger.log('セットアップ完了!');
}
