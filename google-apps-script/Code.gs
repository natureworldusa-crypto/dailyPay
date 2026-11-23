/**
 * =========================================================================
 * DailyPay - Google Sheets Backend Script
 * =========================================================================
 * This Google Apps Script acts as the backend API for your DailyPay app.
 * It provides automatic upserting (inserts new dates, updates existing dates),
 * fetches data, and manages your work hours sheet.
 *
 * HOW TO INSTALL IN GOOGLE SHEETS:
 * 1. Open Google Sheets (create a new blank spreadsheet, e.g. "DailyPay Tracker").
 * 2. In the top menu, click: Extensions > Apps Script.
 * 3. Delete any code in the editor and PASTE this entire file.
 * 4. Click the "Save" icon (or Ctrl+S).
 * 5. Click "Deploy" (top right) > "New deployment".
 * 6. Click the gear icon next to "Select type" and choose "Web app".
 * 7. Set:
 *    - Description: "DailyPay API"
 *    - Execute as: "Me" (your Google account)
 *    - Who has access: "Anyone" (crucial so your GitHub webpage can connect)
 * 8. Click "Deploy", authorize permissions when prompted, and COPY the Web App URL!
 * 9. Paste this URL into the Settings modal in your DailyPay web app.
 * =========================================================================
 */

const SHEET_NAME = "WorkHours";
const HEADERS = [
  "Date",
  "Start Time",
  "End Time",
  "Break (Mins)",
  "Total Hours",
  "Hourly Rate ($)",
  "Gross Pay ($)",
  "Columbus Tax ($)",
  "Net Pay ($)",
  "Notes",
  "Last Updated"
];

/**
 * Handle HTTP GET Requests (Fetch all records)
 */
function doGet(e) {
  try {
    if (e && e.parameter && e.parameter.action === "test") {
      return createJsonResponse({
        status: "success",
        message: "Google Apps Script connection is working successfully!",
        timestamp: new Date().toISOString()
      });
    }

    const sheet = getOrCreateSheet();
    const rows = sheet.getDataRange().getValues();
    
    if (rows.length <= 1) {
      return createJsonResponse({
        status: "success",
        count: 0,
        records: []
      });
    }

    const headers = rows[0];
    const records = [];

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row || !row[0]) continue; // Skip empty rows

      // Format date safely as YYYY-MM-DD
      let dateStr = row[0];
      if (dateStr instanceof Date) {
        dateStr = Utilities.formatDate(dateStr, Session.getScriptTimeZone() || "America/New_York", "yyyy-MM-dd");
      } else {
        dateStr = String(dateStr).trim();
      }

      if (!dateStr || dateStr === "") continue;

      const totalHours = Number(row[4]) || 0;
      // Skip blank phantom rows where hours is 0 and times are not set
      if (totalHours <= 0 && !row[1] && !row[2]) continue;

      records.push({
        date: dateStr,
        startTime: String(row[1] || ""),
        endTime: String(row[2] || ""),
        breakMinutes: Number(row[3]) || 0,
        totalHours: totalHours,
        hourlyRate: Number(row[5]) || 12,
        grossPay: Number(row[6]) || 0,
        taxAmount: Number(row[7]) || 0,
        netPay: Number(row[8]) || 0,
        notes: String(row[9] || ""),
        lastUpdated: String(row[10] || "")
      });
    }

    return createJsonResponse({
      status: "success",
      count: records.length,
      records: records
    });
  } catch (error) {
    return createJsonResponse({
      status: "error",
      message: error.toString()
    });
  }
}

/**
 * Handle HTTP POST Requests (Upsert, Sync, Delete, or ClearAll)
 */
function doPost(e) {
  try {
    const contents = e.postData && e.postData.contents ? JSON.parse(e.postData.contents) : null;
    if (!contents) {
      return createJsonResponse({ status: "error", message: "No payload received" });
    }

    const action = contents.action || "upsert";

    if (action === "test") {
      return createJsonResponse({
        status: "success",
        message: "Google Apps Script connection is working successfully!",
        timestamp: new Date().toISOString()
      });
    }

    if (action === "clearAll") {
      return handleClearAll();
    }

    if (action === "delete") {
      return handleDelete(contents.date);
    }

    if (action === "upsert") {
      return handleUpsert(contents.data || contents);
    }

    if (action === "bulkSync") {
      return handleBulkSync(contents.records || []);
    }

    return createJsonResponse({ status: "error", message: "Unknown action: " + action });
  } catch (error) {
    return createJsonResponse({
      status: "error",
      message: error.toString()
    });
  }
}

/**
 * Upsert a single day's record: updates if date exists, appends if new
 */
function handleUpsert(data) {
  if (!data || !data.date) {
    return createJsonResponse({ status: "error", message: "Date is required for upsert." });
  }

  const sheet = getOrCreateSheet();
  const rows = sheet.getDataRange().getValues();
  const dateTarget = String(data.date).trim();
  const nowTimestamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone() || "America/New_York", "yyyy-MM-dd HH:mm:ss");

  const rowData = [
    dateTarget,
    data.startTime || "",
    data.endTime || "",
    Number(data.breakMinutes) || 0,
    Number(data.totalHours) || 0,
    Number(data.hourlyRate) || 12,
    Number(data.grossPay) || 0,
    Number(data.taxAmount) || 0,
    Number(data.netPay) || 0,
    data.notes || "",
    nowTimestamp
  ];

  let rowIndex = -1;

  // Search for existing date in Column A (1-based index)
  for (let i = 1; i < rows.length; i++) {
    let rowDate = rows[i][0];
    if (rowDate instanceof Date) {
      rowDate = Utilities.formatDate(rowDate, Session.getScriptTimeZone() || "America/New_York", "yyyy-MM-dd");
    }
    if (String(rowDate).trim() === dateTarget) {
      rowIndex = i + 1; // 1-based sheet row index
      break;
    }
  }

  if (rowIndex > 0) {
    // Upsert: Update existing row
    sheet.getRange(rowIndex, 1, 1, rowData.length).setValues([rowData]);
    return createJsonResponse({
      status: "success",
      action: "updated",
      rowIndex: rowIndex,
      data: data,
      message: "Record for " + dateTarget + " updated successfully."
    });
  } else {
    // Insert: Append new row
    sheet.appendRow(rowData);
    return createJsonResponse({
      status: "success",
      action: "inserted",
      rowIndex: sheet.getLastRow(),
      data: data,
      message: "New record for " + dateTarget + " added successfully."
    });
  }
}

/**
 * Clear all records from sheet (leaves headers intact)
 */
function handleClearAll() {
  const sheet = getOrCreateSheet();
  const lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    sheet.deleteRows(2, lastRow - 1);
  }
  return createJsonResponse({
    status: "success",
    message: "All shift records cleared from Google Sheet."
  });
}

/**
 * Delete a record by date
 */
function handleDelete(date) {
  if (!date) {
    return createJsonResponse({ status: "error", message: "Date is required to delete." });
  }

  const sheet = getOrCreateSheet();
  const rows = sheet.getDataRange().getValues();
  const dateTarget = String(date).trim();

  for (let i = 1; i < rows.length; i++) {
    let rowDate = rows[i][0];
    if (rowDate instanceof Date) {
      rowDate = Utilities.formatDate(rowDate, Session.getScriptTimeZone() || "America/New_York", "yyyy-MM-dd");
    }
    if (String(rowDate).trim() === dateTarget) {
      sheet.deleteRow(i + 1);
      return createJsonResponse({
        status: "success",
        action: "deleted",
        message: "Record for " + dateTarget + " deleted."
      });
    }
  }

  return createJsonResponse({
    status: "error",
    message: "Record for date " + dateTarget + " not found."
  });
}

/**
 * Bulk sync records from the frontend
 */
function handleBulkSync(records) {
  let updatedCount = 0;
  let insertedCount = 0;

  for (let i = 0; i < records.length; i++) {
    const res = handleUpsert(records[i]);
    if (res) {
      insertedCount++;
    }
  }

  return createJsonResponse({
    status: "success",
    message: "Synced " + records.length + " records successfully."
  });
}

/**
 * Helper to get or create sheet with formatted headers
 */
function getOrCreateSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
  }

  // Ensure headers exist
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(HEADERS);
    const headerRange = sheet.getRange(1, 1, 1, HEADERS.length);
    headerRange.setFontWeight("bold");
    headerRange.setBackground("#2563eb");
    headerRange.setFontColor("#ffffff");
    sheet.setFrozenRows(1);

    // Format columns: numbers for currency and hours
    sheet.getRange("E:E").setNumberFormat("0.00"); // Total Hours
    sheet.getRange("F:I").setNumberFormat("$#,##0.00"); // Rates & Pay
  }

  return sheet;
}

/**
 * Standardized JSON response with CORS headers
 */
function createJsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
