/**
 * =========================================================================
 * DailyPay - Google Sheets Integration Client
 * =========================================================================
 * Communicates with the Google Apps Script Web App to sync work hours.
 * Supports Upserting, Bulk Sync, Fetching, and Health Checks.
 * =========================================================================
 */

class GoogleSheetsClient {
  constructor() {
    this.isSyncing = false;
    this.lastSyncTime = null;
  }

  getUrl() {
    const settings = window.dataStore.settings;
    return (settings && settings.googleSheetUrl) ? settings.googleSheetUrl.trim() : "";
  }

  isConnected() {
    const url = this.getUrl();
    return Boolean(url && url.startsWith("https://script.google.com/macros/s/"));
  }

  /**
   * Test connection to Google Apps Script Web App
   */
  async testConnection(customUrl = null) {
    let url = (customUrl || this.getUrl()).trim();
    if (!url) {
      return { success: false, message: "Please provide a valid Google Apps Script Web App URL." };
    }

    // Help users who mistakenly copy the Apps Script editor URL (/edit) instead of Web App (/exec)
    if (url.includes("/edit")) {
      return {
        success: false,
        message: "This is the Apps Script editor URL. Please use the Web App URL ending with /exec (from Deploy > New deployment > Web app)."
      };
    }

    try {
      // Test using GET request
      const testEndpoint = `${url}${url.includes("?") ? "&" : "?"}action=test&_t=${Date.now()}`;
      const response = await fetch(testEndpoint, {
        method: "GET",
        headers: { "Accept": "application/json" }
      });

      if (!response.ok) {
        return { success: false, message: `Server returned HTTP ${response.status}: ${response.statusText}` };
      }

      const data = await response.json();
      if (data.status === "success") {
        return { success: true, message: data.message || "Connection successful!" };
      } else {
        return { success: false, message: data.message || "Unexpected response from script." };
      }
    } catch (err) {
      console.error("Test connection error:", err);
      return {
        success: false,
        message: "Failed to connect. Make sure the Web App is deployed with 'Who has access: Anyone' and permissions were authorized."
      };
    }
  }

  /**
   * Upsert a single record to Google Sheet
   * @param {object} record 
   */
  async upsertToSheet(record) {
    const url = this.getUrl();
    if (!this.isConnected()) {
      return { success: false, offline: true, message: "Google Sheet URL not configured. Stored locally." };
    }

    this.isSyncing = true;
    this.updateStatusBadge("syncing");

    try {
      const payload = {
        action: "upsert",
        data: {
          date: record.date,
          startTime: record.startTime || "",
          endTime: record.endTime || "",
          breakMinutes: record.breakMinutes || 0,
          totalHours: record.totalHours || 0,
          hourlyRate: record.hourlyRate || 12,
          grossPay: record.grossPay || 0,
          taxAmount: record.taxAmount || 0,
          netPay: record.netPay || 0,
          notes: record.notes || ""
        }
      };

      // Use text/plain to avoid CORS preflight options block with Google Apps Script
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error(`Server returned HTTP ${response.status}: ${response.statusText}`);
      }

      const result = await response.json();
      if (!result || result.status !== "success") {
        const errorDetail = (result && result.message) || "Script returned failure status without message";
        throw new Error(errorDetail);
      }

      this.lastSyncTime = new Date();
      this.updateStatusBadge("synced");

      return {
        success: true,
        action: result.action,
        rowIndex: result.rowIndex,
        message: result.message || `Successfully ${result.action || 'saved'} in Google Sheet!`
      };
    } catch (err) {
      console.error("Error upserting to Google Sheet:", err);
      this.updateStatusBadge("error");
      return {
        success: false,
        error: err.message,
        message: err.message || "Failed to save to Google Sheet. Check permissions or network."
      };
    } finally {
      this.isSyncing = false;
    }
  }

  /**
   * Fetch all records from Google Sheet and merge/replace locally
   */
  async fetchFromSheet() {
    const url = this.getUrl();
    if (!this.isConnected()) {
      return { success: false, message: "Google Sheet URL not configured." };
    }

    this.isSyncing = true;
    this.updateStatusBadge("syncing");

    try {
      const fetchUrl = `${url}${url.includes("?") ? "&" : "?"}_t=${Date.now()}`;
      const response = await fetch(fetchUrl, {
        method: "GET",
        headers: { "Accept": "application/json" }
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      if (data.status === "success" && Array.isArray(data.records)) {
        // ALWAYS synchronize local storage with the exact state of the Google Sheet (even if 0 records!)
        window.dataStore.setAllRecords(data.records);
        this.lastSyncTime = new Date();
        this.updateStatusBadge("synced");
        return {
          success: true,
          count: data.records.length,
          message: data.records.length > 0 
            ? `Successfully loaded ${data.records.length} records from Google Sheet.`
            : "Google Sheet is empty (0 shifts). Local app data cleared to match your sheet."
        };
      } else {
        throw new Error(data.message || "Failed to parse records.");
      }
    } catch (err) {
      console.error("Error fetching from Google Sheet:", err);
      this.updateStatusBadge("error");
      return {
        success: false,
        message: "Failed to fetch from Google Sheet: " + err.message
      };
    } finally {
      this.isSyncing = false;
    }
  }

  /**
   * Delete a record from Google Sheet by date
   */
  async deleteFromSheet(dateStr) {
    const url = this.getUrl();
    if (!this.isConnected()) return;

    try {
      await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({ action: "delete", date: dateStr })
      });
    } catch (err) {
      console.warn("Failed to delete from sheet:", err);
    }
  }

  /**
   * Clear all records in Google Sheet (rows 2+)
   */
  async clearAllInSheet() {
    const url = this.getUrl();
    if (!this.isConnected()) return { success: false, message: "Not connected" };

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({ action: "clearAll" })
      });
      const data = await response.json();
      return { success: data && data.status === "success", message: data && data.message };
    } catch (err) {
      console.warn("Failed to clear Google Sheet:", err);
      return { success: false, error: err.message };
    }
  }

  /**
   * Sync all local records to Google Sheet in bulk
   */
  async bulkSyncToSheet() {
    const url = this.getUrl();
    if (!this.isConnected()) {
      return { success: false, message: "Google Sheet URL not configured." };
    }

    const records = window.dataStore.records;
    if (records.length === 0) {
      return { success: true, message: "No local records to sync." };
    }

    this.isSyncing = true;
    this.updateStatusBadge("syncing");

    try {
      const payload = {
        action: "bulkSync",
        records: records.map(r => ({
          date: r.date,
          startTime: r.startTime || "",
          endTime: r.endTime || "",
          breakMinutes: r.breakMinutes || 0,
          totalHours: r.totalHours || 0,
          hourlyRate: r.hourlyRate || 12,
          grossPay: r.grossPay || 0,
          taxAmount: r.taxAmount || 0,
          netPay: r.netPay || 0,
          notes: r.notes || ""
        }))
      };

      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify(payload)
      });

      const result = await response.json();
      this.lastSyncTime = new Date();
      this.updateStatusBadge("synced");
      return { success: true, message: result.message || "Bulk sync completed!" };
    } catch (err) {
      console.error("Bulk sync error:", err);
      this.updateStatusBadge("error");
      return { success: false, message: "Bulk sync failed: " + err.message };
    } finally {
      this.isSyncing = false;
    }
  }

  /**
   * Update UI status badge for sync state
   */
  updateStatusBadge(status) {
    const badge = document.getElementById("syncStatusBadge");
    const text = document.getElementById("syncStatusText");
    const icon = document.getElementById("syncStatusIcon");
    const mainTag = document.getElementById("mainSyncStatusTag");
    const mainSub = document.getElementById("mainSyncSubtext");

    if (!this.isConnected()) {
      if (badge) badge.className = "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-500/10 text-amber-500 border border-amber-500/20";
      if (text) text.textContent = "Google Sheet: Not Connected";
      if (icon) icon.className = "w-2 h-2 rounded-full bg-amber-500";
      if (mainTag) {
        mainTag.className = "text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20";
        mainTag.textContent = "Not Connected";
      }
      if (mainSub) mainSub.textContent = "Click Settings (⚙️) to paste your Google Apps Script URL to enable live sheet sync.";
      return;
    }

    const timeStr = this.lastSyncTime ? `Synced (${this.lastSyncTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})` : "Synced with Google Sheet";

    switch (status) {
      case "syncing":
        if (badge) badge.className = "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-blue-500/10 text-blue-500 border border-blue-500/20 animate-pulse";
        if (text) text.textContent = "Syncing with Google Sheet...";
        if (mainTag) {
          mainTag.className = "text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20 animate-pulse";
          mainTag.textContent = "Syncing...";
        }
        if (mainSub) mainSub.textContent = "Communicating with your Google Sheet...";
        break;
      case "synced":
        if (badge) badge.className = "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-500 border border-emerald-500/20";
        if (text) text.textContent = timeStr;
        if (icon) icon.className = "w-2 h-2 rounded-full bg-emerald-500";
        if (mainTag) {
          mainTag.className = "text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20";
          mainTag.textContent = "Connected ✓";
        }
        if (mainSub) mainSub.textContent = `All shifts automatically upsert by date into your Google Sheet. Last synced: ${this.lastSyncTime ? this.lastSyncTime.toLocaleTimeString() : 'Just now'}`;
        break;
      case "error":
        if (badge) badge.className = "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-rose-500/10 text-rose-500 border border-rose-500/20";
        if (text) text.textContent = "Sync error (saved locally)";
        if (icon) icon.className = "w-2 h-2 rounded-full bg-rose-500";
        if (mainTag) {
          mainTag.className = "text-[10px] font-semibold px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/20";
          mainTag.textContent = "Sync Error";
        }
        if (mainSub) mainSub.textContent = "Unable to reach Google Sheet. Data saved in browser memory.";
        break;
      default:
        if (badge) badge.className = "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-500 border border-emerald-500/20";
        if (text) text.textContent = "Google Sheet Connected";
        if (icon) icon.className = "w-2 h-2 rounded-full bg-emerald-500";
        if (mainTag) {
          mainTag.className = "text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20";
          mainTag.textContent = "Connected ✓";
        }
        if (mainSub) mainSub.textContent = "All shifts automatically upsert by date into your Google Sheet.";
    }
  }
}

// Global instance
window.sheetsClient = new GoogleSheetsClient();
