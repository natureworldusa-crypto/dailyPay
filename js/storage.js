/**
 * =========================================================================
 * DailyPay - Local Storage & Data Store
 * =========================================================================
 * Handles local persistence, upsert operations, sorting, and export/import.
 * Ensures the app works offline and fast, with full sync capability.
 * =========================================================================
 */

const STORAGE_KEY = "dailyPay_records";
const SETTINGS_KEY = "dailyPay_settings";

class DataStore {
  constructor() {
    this.records = this.loadRecords();
    this.settings = this.loadSettings();
  }

  loadRecords() {
    try {
      // Clear dummy sample data if previously loaded on older version
      if (!localStorage.getItem("dailyPay_cleaned_v2")) {
        localStorage.removeItem(STORAGE_KEY);
        localStorage.setItem("dailyPay_cleaned_v2", "true");
        return [];
      }
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          return parsed.sort((a, b) => b.date.localeCompare(a.date));
        }
      }
    } catch (e) {
      console.error("Failed to load records from localStorage", e);
    }
    return [];
  }

  saveRecords() {
    try {
      this.records.sort((a, b) => b.date.localeCompare(a.date));
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.records));
    } catch (e) {
      console.error("Failed to save records", e);
    }
  }

  loadSettings() {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      if (raw) {
        return JSON.parse(raw);
      }
    } catch (e) {
      console.error("Failed to load settings", e);
    }
    return {
      googleSheetUrl: "",
      payPeriodAnchorDate: "2026-11-09", // Anchor date for 2-week bi-weekly cycles
      darkMode: false,
      autoSync: true
    };
  }

  saveSettings(newSettings) {
    this.settings = { ...this.settings, ...newSettings };
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.settings));
    } catch (e) {
      console.error("Failed to save settings", e);
    }
  }

  /**
   * Find record by date (YYYY-MM-DD)
   */
  findByDate(dateStr) {
    if (!dateStr) return null;
    return this.records.find(r => r.date === dateStr) || null;
  }

  /**
   * Upsert a record:
   * If record with date exists, replaces it.
   * If not, adds it.
   * @param {object} record 
   * @returns {{ isNew: boolean, record: object }}
   */
  upsertRecord(record) {
    if (!record || !record.date) {
      throw new Error("Date is required to upsert a record.");
    }

    const index = this.records.findIndex(r => r.date === record.date);
    let isNew = false;

    // Recalculate tax breakdown to guarantee consistency
    const calc = window.taxEngine.calculate(record.totalHours, record.hourlyRate);

    const fullRecord = {
      ...record,
      grossPay: calc.grossPay,
      taxAmount: calc.taxes.totalTax,
      netPay: calc.netPay,
      taxes: calc.taxes,
      lastUpdated: new Date().toISOString()
    };

    if (index >= 0) {
      // Update existing record
      this.records[index] = fullRecord;
      isNew = false;
    } else {
      // Insert new record
      this.records.push(fullRecord);
      isNew = true;
    }

    this.saveRecords();
    return { isNew, record: fullRecord };
  }

  /**
   * Delete record by date
   */
  deleteRecord(dateStr) {
    const initialLength = this.records.length;
    this.records = this.records.filter(r => r.date !== dateStr);
    this.saveRecords();
    return this.records.length < initialLength;
  }

  /**
   * Replace all records (e.g. after sync from Google Sheet)
   */
  setAllRecords(newRecords) {
    if (!Array.isArray(newRecords)) return;
    this.records = newRecords.map(r => {
      const calc = window.taxEngine.calculate(r.totalHours, r.hourlyRate);
      return {
        ...r,
        grossPay: calc.grossPay,
        taxAmount: calc.taxes.totalTax,
        netPay: calc.netPay,
        taxes: calc.taxes
      };
    });
    this.saveRecords();
  }

  /**
   * Clear all records
   */
  clearAll() {
    this.records = [];
    this.saveRecords();
  }

  /**
   * Seed realistic sample shifts for previewing monthly and bi-weekly views
   */
  loadSampleData() {
    const today = new Date();
    const sampleDates = [];

    // Generate recent shifts over the past 3 weeks
    for (let i = 21; i >= 1; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      const dayOfWeek = d.getDay(); // 0 is Sunday, 6 is Saturday
      // Work Monday through Friday, plus occasional Saturday
      if (dayOfWeek >= 1 && dayOfWeek <= 5) {
        sampleDates.push(d.toISOString().split("T")[0]);
      } else if (dayOfWeek === 6 && i % 2 === 0) {
        sampleDates.push(d.toISOString().split("T")[0]);
      }
    }

    const sampleRecords = sampleDates.map((dateStr, idx) => {
      const hours = (idx % 3 === 0) ? 8.0 : (idx % 2 === 0 ? 7.5 : 6.0);
      const startHour = 9;
      const startFormatted = "09:00";
      const endHour = startHour + Math.floor(hours) + (hours % 1 > 0 ? 1 : 0);
      const endFormatted = `${String(endHour).padStart(2, "0")}:${hours % 1 > 0 ? "30" : "00"}`;
      const breakMins = hours >= 7 ? 30 : 0;
      const hourlyRate = 12.00;
      const calc = window.taxEngine.calculate(hours, hourlyRate);

      return {
        date: dateStr,
        startTime: startFormatted,
        endTime: endFormatted,
        breakMinutes: breakMins,
        totalHours: hours,
        hourlyRate: hourlyRate,
        grossPay: calc.grossPay,
        taxAmount: calc.taxes.totalTax,
        netPay: calc.netPay,
        taxes: calc.taxes,
        notes: (idx % 4 === 0) ? "Regular shift" : (idx % 3 === 0 ? "Customer service shift" : "Afternoon floor coverage"),
        lastUpdated: new Date().toISOString()
      };
    });

    this.records = sampleRecords;
    this.saveRecords();
  }

  /**
   * Export to CSV
   */
  exportToCsv() {
    if (this.records.length === 0) return "";
    const headers = ["Date", "Start Time", "End Time", "Break (min)", "Hours", "Hourly Rate ($)", "Gross ($)", "Columbus Tax ($)", "Net Pay ($)", "Notes"];
    const rows = this.records.map(r => [
      `"${r.date}"`,
      `"${r.startTime || ''}"`,
      `"${r.endTime || ''}"`,
      r.breakMinutes || 0,
      r.totalHours || 0,
      r.hourlyRate || 12,
      r.grossPay || 0,
      r.taxAmount || 0,
      r.netPay || 0,
      `"${(r.notes || '').replace(/"/g, '""')}"`
    ]);

    return [headers.join(","), ...rows.map(row => row.join(","))].join("\r\n");
  }

  /**
   * Export to JSON
   */
  exportToJson() {
    return JSON.stringify(this.records, null, 2);
  }
}

// Global instance
window.dataStore = new DataStore();
