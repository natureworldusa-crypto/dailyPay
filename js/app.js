/**
 * =========================================================================
 * DailyPay - Core Application Controller
 * =========================================================================
 * Form management, real-time calculation, upsert detection,
 * UI navigation tabs, modals, and event listeners.
 * =========================================================================
 */

class DailyPayApp {
  constructor() {
    this.activeTab = "tracker";
    this.isManualHoursOverride = false;
  }

  init() {
    this.setupDateDefaults();
    this.bindFormEvents();
    this.bindNavigation();
    this.bindModals();
    this.loadSettingsIntoUI();
    this.renderAllViews();
    this.checkUpsertStatus();

    // Initialize Google Sheet live connection & start real-time sync
    if (window.sheetsClient.isConnected()) {
      window.sheetsClient.updateStatusBadge("synced");
      this.syncRealtime();
    } else {
      window.sheetsClient.updateStatusBadge("local");
    }

    this.startRealtimeSync();
  }

  /**
   * Set default date to today in local timezone
   */
  setupDateDefaults() {
    const dateInput = document.getElementById("shiftDate");
    if (!dateInput) return;

    const today = new Date();
    const localDateStr = this.formatDateToLocalYMD(today);
    dateInput.value = localDateStr;

    // Leave start and end times blank so user enters when to when they worked
    const startInput = document.getElementById("shiftStartTime");
    const endInput = document.getElementById("shiftEndTime");
    const breakInput = document.getElementById("shiftBreakMinutes");
    const rateInput = document.getElementById("shiftHourlyRate");
    const hoursInput = document.getElementById("shiftTotalHours");

    if (startInput) startInput.value = "";
    if (endInput) endInput.value = "";
    if (breakInput) breakInput.value = "0";
    if (hoursInput) hoursInput.value = "";
    if (rateInput && !rateInput.value) rateInput.value = (window.taxEngine.config.hourlyRate || 12).toFixed(2);

    this.calculateShiftHours();
  }

  formatDateToLocalYMD(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  /**
   * Check if selected date already exists in database (Upsert Detection)
   */
  checkUpsertStatus() {
    const dateInput = document.getElementById("shiftDate");
    const banner = document.getElementById("upsertNoticeBanner");
    const submitBtn = document.getElementById("submitShiftBtn");
    const submitBtnText = document.getElementById("submitBtnText");
    if (!dateInput) return;

    const selectedDate = dateInput.value;
    const existing = window.dataStore.findByDate(selectedDate);

    if (existing) {
      if (banner) {
        banner.classList.remove("hidden");
        document.getElementById("upsertDateSpan").textContent = existing.date;
        document.getElementById("upsertHoursSpan").textContent = `${existing.totalHours.toFixed(2)} hrs ($${existing.grossPay.toFixed(2)})`;
      }
      if (submitBtn) {
        submitBtn.classList.remove("from-blue-600", "to-indigo-600", "hover:from-blue-500", "hover:to-indigo-500");
        submitBtn.classList.add("from-amber-600", "to-orange-600", "hover:from-amber-500", "hover:to-orange-500");
      }
      if (submitBtnText) {
        submitBtnText.textContent = "Update Existing Shift (Upsert)";
      }
    } else {
      if (banner) {
        banner.classList.add("hidden");
      }
      if (submitBtn) {
        submitBtn.classList.remove("from-amber-600", "to-orange-600", "hover:from-amber-500", "hover:to-orange-500");
        submitBtn.classList.add("from-blue-600", "to-indigo-600", "hover:from-blue-500", "hover:to-indigo-500");
      }
      if (submitBtnText) {
        submitBtnText.textContent = "Save Shift & Sync to Sheet";
      }
    }
  }

  /**
   * Pre-fill form from existing record when date is chosen
   */
  loadExistingRecordIntoForm(record) {
    if (!record) return;
    document.getElementById("shiftStartTime").value = record.startTime || "";
    document.getElementById("shiftEndTime").value = record.endTime || "";
    document.getElementById("shiftBreakMinutes").value = record.breakMinutes || 0;
    document.getElementById("shiftTotalHours").value = (record.totalHours || 0).toFixed(2);
    document.getElementById("shiftHourlyRate").value = (record.hourlyRate || 12).toFixed(2);
    document.getElementById("shiftNotes").value = record.notes || "";
    this.isManualHoursOverride = true;
    this.updateLiveCalculations();
  }

  /**
   * Bind event listeners for input changes
   */
  bindFormEvents() {
    const form = document.getElementById("workHoursForm");
    const dateInput = document.getElementById("shiftDate");
    const startInput = document.getElementById("shiftStartTime");
    const endInput = document.getElementById("shiftEndTime");
    const breakInput = document.getElementById("shiftBreakMinutes");
    const hoursInput = document.getElementById("shiftTotalHours");
    const rateInput = document.getElementById("shiftHourlyRate");

    // Date change -> check upsert & prompt user
    if (dateInput) {
      dateInput.addEventListener("change", () => {
        const existing = window.dataStore.findByDate(dateInput.value);
        if (existing) {
          this.loadExistingRecordIntoForm(existing);
        } else {
          this.isManualHoursOverride = false;
          this.calculateShiftHours();
        }
        this.checkUpsertStatus();
      });
    }

    // Time changes -> auto-calculate hours
    [startInput, endInput, breakInput].forEach(el => {
      if (el) {
        el.addEventListener("input", () => {
          this.isManualHoursOverride = false;
          this.calculateShiftHours();
        });
      }
    });

    // Manual hours override
    if (hoursInput) {
      hoursInput.addEventListener("input", () => {
        this.isManualHoursOverride = true;
        this.updateLiveCalculations();
      });
    }

    // Hourly rate change
    if (rateInput) {
      rateInput.addEventListener("input", () => {
        this.updateLiveCalculations();
      });
    }

    // Quick Date Buttons: "Today" and "Yesterday"
    const btnToday = document.getElementById("quickBtnToday");
    const btnYesterday = document.getElementById("quickBtnYesterday");

    if (btnToday) {
      btnToday.addEventListener("click", () => {
        const today = new Date();
        dateInput.value = this.formatDateToLocalYMD(today);
        dateInput.dispatchEvent(new Event("change"));
      });
    }

    if (btnYesterday) {
      btnYesterday.addEventListener("click", () => {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        dateInput.value = this.formatDateToLocalYMD(yesterday);
        dateInput.dispatchEvent(new Event("change"));
      });
    }

    // Form submission
    if (form) {
      form.addEventListener("submit", (e) => {
        e.preventDefault();
        this.handleShiftSubmit();
      });
    }
  }

  /**
   * Calculate shift hours between startTime and endTime minus break
   */
  calculateShiftHours() {
    if (this.isManualHoursOverride) {
      this.updateLiveCalculations();
      return;
    }

    const startVal = document.getElementById("shiftStartTime").value;
    const endVal = document.getElementById("shiftEndTime").value;
    const breakMins = Number(document.getElementById("shiftBreakMinutes").value) || 0;
    const hoursInput = document.getElementById("shiftTotalHours");

    if (!startVal || !endVal) {
      if (hoursInput) hoursInput.value = "";
      this.updateLiveCalculations();
      return;
    }

    const [startH, startM] = startVal.split(":").map(Number);
    const [endH, endM] = endVal.split(":").map(Number);

    let startTotalMins = (startH * 60) + startM;
    let endTotalMins = (endH * 60) + endM;

    // Overnight shift support
    if (endTotalMins < startTotalMins) {
      endTotalMins += (24 * 60);
    }

    const workedMins = Math.max(0, (endTotalMins - startTotalMins) - breakMins);
    const hours = (workedMins / 60);

    if (hoursInput) {
      hoursInput.value = hours.toFixed(2);
    }

    this.updateLiveCalculations();
  }

  /**
   * Live preview card calculations
   */
  updateLiveCalculations() {
    const hours = Number(document.getElementById("shiftTotalHours").value) || 0;
    const rate = Number(document.getElementById("shiftHourlyRate").value) || 12;

    const calc = window.taxEngine.calculate(hours, rate);

    // Update Live Preview values
    this.setText("previewHours", `${hours.toFixed(2)} hrs`);
    this.setText("previewRate", `$${rate.toFixed(2)}/hr`);
    this.setText("previewGross", window.taxEngine.formatCurrency(calc.grossPay));
    this.setText("previewColumbusTax", `-${window.taxEngine.formatCurrency(calc.taxes.columbusCity)}`);
    this.setText("previewFicaTax", `-${window.taxEngine.formatCurrency(calc.taxes.ficaTotal)}`);
    this.setText("previewOhioTax", `-${window.taxEngine.formatCurrency(calc.taxes.ohioState)}`);
    this.setText("previewFederalTax", `-${window.taxEngine.formatCurrency(calc.taxes.federal)}`);
    this.setText("previewTotalTax", `-${window.taxEngine.formatCurrency(calc.taxes.totalTax)}`);
    this.setText("previewNet", window.taxEngine.formatCurrency(calc.netPay));
    this.setText("previewEffectiveRate", hours > 0 ? `${calc.effectiveTaxRate}% effective tax` : "0.0% tax");
    this.setText("previewNetPerHour", hours > 0 ? `${window.taxEngine.formatCurrency(calc.effectiveHourlyTakeHome)}/hr net` : "$0.00/hr net");
  }

  /**
   * Handle form save (upsert)
   */
  async handleShiftSubmit() {
    const date = document.getElementById("shiftDate").value;
    const startTime = document.getElementById("shiftStartTime").value;
    const endTime = document.getElementById("shiftEndTime").value;
    const breakMinutes = Number(document.getElementById("shiftBreakMinutes").value) || 0;
    const totalHours = Number(document.getElementById("shiftTotalHours").value) || 0;
    const hourlyRate = Number(document.getElementById("shiftHourlyRate").value) || 12;
    const notes = document.getElementById("shiftNotes").value.trim();

    const errorBanner = document.getElementById("shiftErrorBanner");
    const errorText = document.getElementById("shiftErrorText");
    if (errorBanner) errorBanner.classList.add("hidden");

    if (!date) {
      this.showToast("Please select a date.", "error");
      return;
    }

    if (totalHours <= 0) {
      this.showToast("Total hours must be greater than 0.", "error");
      return;
    }

    const submitBtn = document.getElementById("submitShiftBtn");
    const submitBtnText = document.getElementById("submitBtnText");
    const originalBtnText = submitBtnText ? submitBtnText.textContent : "Save Shift & Sync to Sheet";

    if (submitBtn) {
      submitBtn.disabled = true;
      if (submitBtnText) submitBtnText.textContent = "⏳ Saving to Google Sheet...";
    }

    const record = {
      date,
      startTime,
      endTime,
      breakMinutes,
      totalHours,
      hourlyRate,
      notes
    };

    try {
      // If Google Sheet is connected, verify Google Sheet write first!
      if (window.sheetsClient.isConnected()) {
        const sheetRes = await window.sheetsClient.upsertToSheet(record);

        if (!sheetRes.success) {
          // Explicitly fail and show the exact error message
          console.error("Google Sheet write failed:", sheetRes);
          this.showToast(`❌ Google Sheet Error: ${sheetRes.message}`, "error");

          if (errorBanner && errorText) {
            errorText.innerHTML = `<strong>Data was NOT saved to Google Sheet!</strong><br><span class="text-rose-200">${sheetRes.message}</span><br><span class="text-slate-400 mt-1 block">Your entered hours remain in the form. Please check your internet connection or verify Apps Script deployment permissions (Who has access: Anyone).</span>`;
            errorBanner.classList.remove("hidden");
            errorBanner.scrollIntoView({ behavior: "smooth", block: "center" });
          }
          return;
        }

        // Google Sheet insertion succeeded!
        const { isNew } = window.dataStore.upsertRecord(record);

        if (typeof confetti === "function") {
          confetti({ particleCount: 40, spread: 60, origin: { y: 0.8 } });
        }

        const actionText = sheetRes.action === "updated" ? "Updated existing row" : "Inserted new row";
        this.showToast(`✅ Google Sheet Synced! ${actionText} (${date})`, "success");

        if (errorBanner) errorBanner.classList.add("hidden");

        this.renderAllViews();
        this.checkUpsertStatus();
      } else {
        // Not connected to Google Sheet
        const { isNew } = window.dataStore.upsertRecord(record);
        this.showToast(`⚠️ Google Sheet not connected. Shift saved locally in browser only.`, "warning");
        this.renderAllViews();
        this.checkUpsertStatus();
      }
    } catch (err) {
      console.error("Unexpected error submitting shift:", err);
      this.showToast(`❌ Error saving shift: ${err.message}`, "error");
      if (errorBanner && errorText) {
        errorText.textContent = `Error: ${err.message}`;
        errorBanner.classList.remove("hidden");
      }
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        if (submitBtnText) submitBtnText.textContent = originalBtnText;
      }
    }
  }

  /**
   * Pull records from Google Sheet and refresh dashboard
   * @param {boolean} silent If true, suppresses modal alerts and toasts unless error
   */
  async pullFromSheet(silent = false) {
    if (!window.sheetsClient.isConnected()) {
      if (!silent) {
        this.showToast("Google Sheet URL not configured. Click ⚙️ Settings first.", "warning");
        const modal = document.getElementById("settingsModal");
        if (modal) modal.classList.remove("hidden");
      }
      return;
    }

    if (window.sheetsClient.isSyncing) return; // Prevent concurrent requests

    const btns = document.querySelectorAll(".btn-sheet-pull");
    if (!silent) {
      btns.forEach(b => {
        b.disabled = true;
        b.dataset.prevHtml = b.innerHTML;
        b.innerHTML = "<span>⏳ Pulling...</span>";
      });
    }

    try {
      const res = await window.sheetsClient.fetchFromSheet();
      if (!silent) {
        this.showToast(res.message, res.success ? "success" : "error");
      }
      if (res.success) {
        this.renderAllViews();
        this.checkUpsertStatus();
      }
    } catch (err) {
      if (!silent) {
        this.showToast("Pull failed: " + err.message, "error");
      }
    } finally {
      if (!silent) {
        btns.forEach(b => {
          b.disabled = false;
          b.innerHTML = b.dataset.prevHtml || "<span>⬇️ Pull from Sheet</span>";
        });
      }
    }
  }

  /**
   * Push all local records to Google Sheet in bulk
   */
  async pushToSheet() {
    if (!window.sheetsClient.isConnected()) {
      this.showToast("Google Sheet URL not configured. Click ⚙️ Settings first.", "warning");
      const modal = document.getElementById("settingsModal");
      if (modal) modal.classList.remove("hidden");
      return;
    }

    const btns = document.querySelectorAll(".btn-sheet-push");
    btns.forEach(b => {
      b.disabled = true;
      b.dataset.prevHtml = b.innerHTML;
      b.innerHTML = "<span>⏳ Pushing...</span>";
    });

    try {
      const res = await window.sheetsClient.bulkSyncToSheet();
      this.showToast(res.message, res.success ? "success" : "error");
    } catch (err) {
      this.showToast("Push failed: " + err.message, "error");
    } finally {
      btns.forEach(b => {
        b.disabled = false;
        b.innerHTML = b.dataset.prevHtml || "<span>⬆️ Push to Sheet</span>";
      });
    }
  }

  /**
   * Continuous Real-Time Synchronization with Google Sheet Database
   */
  startRealtimeSync() {
    // 1. Instant sync when returning to tab (e.g. after editing/deleting in Google Sheets)
    window.addEventListener("focus", () => {
      this.syncRealtime();
    });

    // 2. Instant sync on visibility change
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") {
        this.syncRealtime();
      }
    });

    // 3. Continuous 5-second polling interval for live real-time metrics
    if (this.realtimeTimer) clearInterval(this.realtimeTimer);
    this.realtimeTimer = setInterval(() => {
      if (document.visibilityState === "visible") {
        this.syncRealtime();
      }
    }, 5000);
  }

  async syncRealtime() {
    if (!window.sheetsClient || !window.sheetsClient.isConnected()) return;
    if (window.sheetsClient.isSyncing) return;

    try {
      const res = await window.sheetsClient.fetchFromSheet(true);
      if (res && res.success && res.hasChanged) {
        // Sheet data was modified or deleted directly in Google Sheets by admin!
        this.renderAllViews();
        this.checkUpsertStatus();
      }
    } catch (e) {
      // Background silent sync
    }
  }

  /**
   * Edit existing shift
   */
  editShift(dateStr) {
    const record = window.dataStore.findByDate(dateStr);
    if (!record) return;

    // Switch to tracker tab
    this.switchTab("tracker");

    // Populate form
    document.getElementById("shiftDate").value = record.date;
    document.getElementById("shiftStartTime").value = record.startTime || "";
    document.getElementById("shiftEndTime").value = record.endTime || "";
    document.getElementById("shiftBreakMinutes").value = record.breakMinutes || 0;
    document.getElementById("shiftTotalHours").value = (record.totalHours || 0).toFixed(2);
    document.getElementById("shiftHourlyRate").value = (record.hourlyRate || 12).toFixed(2);
    document.getElementById("shiftNotes").value = record.notes || "";

    this.isManualHoursOverride = true;
    this.updateLiveCalculations();
    this.checkUpsertStatus();

    // Scroll to form smoothly
    document.getElementById("workHoursForm").scrollIntoView({ behavior: "smooth", block: "center" });
    this.showToast(`Loaded shift for ${dateStr} into form for editing.`, "info");
  }

  /**
   * Bind navigation tabs
   */
  bindNavigation() {
    const navButtons = document.querySelectorAll(".nav-tab-btn");
    navButtons.forEach(btn => {
      btn.addEventListener("click", (e) => {
        const tab = btn.getAttribute("data-tab");
        if (tab) {
          this.switchTab(tab);
        }
      });
    });
  }

  switchTab(tabName) {
    this.activeTab = tabName;

    // Hide all tab panes
    document.querySelectorAll(".tab-pane").forEach(pane => {
      pane.classList.add("hidden");
    });

    // Show target tab pane
    const targetPane = document.getElementById(`tab-${tabName}`);
    if (targetPane) {
      targetPane.classList.remove("hidden");
    }

    // Update nav active styles
    document.querySelectorAll(".nav-tab-btn").forEach(btn => {
      const isTarget = btn.getAttribute("data-tab") === tabName;
      if (isTarget) {
        btn.classList.add("bg-blue-600", "text-white", "shadow-lg", "shadow-blue-500/20");
        btn.classList.remove("text-slate-400", "hover:text-white", "hover:bg-slate-800");
      } else {
        btn.classList.remove("bg-blue-600", "text-white", "shadow-lg", "shadow-blue-500/20");
        btn.classList.add("text-slate-400", "hover:text-white", "hover:bg-slate-800");
      }
    });

    // Refresh all views on every tab switch
    this.renderAllViews();
    this.checkUpsertStatus();

    // Re-render charts with slight delay if entering dashboard tab to recalculate canvas size
    if (tabName === "dashboard") {
      setTimeout(() => {
        window.dashboardManager.renderCharts(window.dataStore.records);
      }, 60);
    }

    // Silently check Google Sheet for updates or deletions whenever user switches tabs
    this.syncRealtime();
  }

  /**
   * Render history table with search and filtering
   */
  renderFullHistoryTable(filterMonth = null) {
    const tbody = document.getElementById("fullHistoryTableBody");
    const countBadge = document.getElementById("historyCountBadge");
    const monthSelect = document.getElementById("historyMonthFilter");
    if (!tbody) return;

    const records = window.dataStore.records;

    // Dynamically rebuild month filter options to match current records
    if (monthSelect) {
      const months = window.dashboardManager.getMonthlyGroups(records);
      const currentVal = filterMonth || monthSelect.value || "";
      monthSelect.innerHTML = `<option value="">All Months (${records.length} shifts)</option>` +
        months.map(m => `<option value="${m.key}">${m.label} (${m.records.length} shifts)</option>`).join("");
      if (currentVal && months.some(m => m.key === currentVal)) {
        monthSelect.value = currentVal;
      }
    }

    const searchTerm = (document.getElementById("historySearchInput")?.value || "").toLowerCase();
    const selectedMonth = filterMonth || document.getElementById("historyMonthFilter")?.value || "";

    const filtered = records.filter(r => {
      const matchesSearch = !searchTerm || r.date.includes(searchTerm) || (r.notes && r.notes.toLowerCase().includes(searchTerm));
      const matchesMonth = !selectedMonth || r.date.startsWith(selectedMonth);
      return matchesSearch && matchesMonth;
    });

    if (countBadge) {
      countBadge.textContent = `${filtered.length} of ${records.length} shifts`;
    }

    if (filtered.length === 0) {
      tbody.innerHTML = `<tr><td colspan="9" class="py-8 text-center text-slate-500">No shifts logged yet. Enter your first shift on the Log Shift tab!</td></tr>`;
      return;
    }

    tbody.innerHTML = filtered.map(r => {
      const calc = window.taxEngine.calculate(r.totalHours, r.hourlyRate);
      return `
        <tr class="border-b border-slate-800 hover:bg-slate-800/40 transition-colors">
          <td class="py-3 px-4 font-semibold text-slate-200">
            ${r.date}
          </td>
          <td class="py-3 px-4 text-slate-300">
            ${r.startTime || '--'} &ndash; ${r.endTime || '--'}
            ${r.breakMinutes > 0 ? `<span class="text-xs text-slate-500 block">${r.breakMinutes} min break</span>` : ''}
          </td>
          <td class="py-3 px-4 font-bold text-white">
            ${(r.totalHours || 0).toFixed(2)}h
          </td>
          <td class="py-3 px-4 text-slate-400">
            $${(r.hourlyRate || 12).toFixed(2)}
          </td>
          <td class="py-3 px-4 text-slate-300 font-semibold">
            ${window.taxEngine.formatCurrency(calc.grossPay)}
          </td>
          <td class="py-3 px-4 text-rose-400 font-mono text-xs">
            -${window.taxEngine.formatCurrency(calc.taxes.totalTax)}
            <span class="block text-[10px] text-slate-500">Col: -${window.taxEngine.formatCurrency(calc.taxes.columbusCity)}</span>
          </td>
          <td class="py-3 px-4 text-emerald-400 font-black">
            ${window.taxEngine.formatCurrency(calc.netPay)}
          </td>
          <td class="py-3 px-4 text-slate-400 text-xs max-w-xs truncate">
            ${r.notes || '<span class="text-slate-600">--</span>'}
          </td>
          <td class="py-3 px-4 text-right whitespace-nowrap">
            <button onclick="window.app.editShift('${r.date}')" class="px-2.5 py-1 text-xs font-semibold bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 rounded-md transition-colors">Edit</button>
          </td>
        </tr>
      `;
    }).join("");
  }

  filterHistoryByMonth(monthKey) {
    const monthSelect = document.getElementById("historyMonthFilter");
    if (monthSelect) {
      monthSelect.value = monthKey;
    }
    this.renderFullHistoryTable(monthKey);
  }

  /**
   * Bind Modals (Settings, Google Sheet setup, Paystub)
   */
  bindModals() {
    // Settings modal open/close
    const openSettingsBtn = document.getElementById("openSettingsBtn");
    const closeSettingsBtn = document.getElementById("closeSettingsBtn");
    const settingsModal = document.getElementById("settingsModal");
    const saveSettingsBtn = document.getElementById("saveSettingsBtn");
    const testSheetBtn = document.getElementById("testSheetConnectionBtn");
    const syncNowBtn = document.getElementById("syncNowBtn");
    const bulkPushBtn = document.getElementById("bulkPushBtn");

    if (openSettingsBtn && settingsModal) {
      openSettingsBtn.addEventListener("click", () => {
        this.loadSettingsIntoUI();
        settingsModal.classList.remove("hidden");
      });
    }

    if (closeSettingsBtn && settingsModal) {
      closeSettingsBtn.addEventListener("click", () => {
        settingsModal.classList.add("hidden");
      });
    }

    // Paystub modal close
    const closePaystubBtn = document.getElementById("closePaystubBtn");
    const paystubModal = document.getElementById("paystubModal");
    if (closePaystubBtn && paystubModal) {
      closePaystubBtn.addEventListener("click", () => {
        paystubModal.classList.add("hidden");
      });
    }

    // Print paystub button
    const printPaystubBtn = document.getElementById("printPaystubBtn");
    if (printPaystubBtn) {
      printPaystubBtn.addEventListener("click", () => {
        window.print();
      });
    }

    // Test Google Sheet connection
    if (testSheetBtn) {
      testSheetBtn.addEventListener("click", async () => {
        const urlInput = document.getElementById("settingsGoogleSheetUrl");
        const url = urlInput ? urlInput.value.trim() : "";
        testSheetBtn.disabled = true;
        testSheetBtn.textContent = "Testing...";

        const result = await window.sheetsClient.testConnection(url);
        testSheetBtn.disabled = false;
        testSheetBtn.textContent = "Test Connection";

        const feedback = document.getElementById("sheetTestFeedback");
        if (feedback) {
          feedback.classList.remove("hidden", "text-emerald-400", "text-rose-400");
          feedback.classList.add(result.success ? "text-emerald-400" : "text-rose-400");
          feedback.textContent = result.message;
        }

        // Auto-save on successful test so user doesn't lose connection!
        if (result.success && url) {
          window.dataStore.saveSettings({ googleSheetUrl: url });
          window.sheetsClient.updateStatusBadge("synced");
          this.showToast("Google Sheet connected & saved!", "success");
          this.pullFromSheet();
        }
      });
    }

    // Save Settings
    if (saveSettingsBtn) {
      saveSettingsBtn.addEventListener("click", () => {
        const url = document.getElementById("settingsGoogleSheetUrl")?.value.trim() || "";
        const anchorDate = document.getElementById("settingsAnchorDate")?.value || "2026-11-09";
        const autoSync = document.getElementById("settingsAutoSync")?.checked ?? true;
        const columbusTaxRate = Number(document.getElementById("settingsColumbusTaxRate")?.value) / 100 || 0.025;
        const hourlyRate = Number(document.getElementById("settingsHourlyRate")?.value) || 12;
        const isFicaExempt = document.getElementById("settingsFicaExempt")?.checked || false;

        window.dataStore.saveSettings({
          googleSheetUrl: url,
          payPeriodAnchorDate: anchorDate,
          autoSync: autoSync
        });

        window.taxEngine.saveConfig({
          hourlyRate: hourlyRate,
          columbusCityTaxRate: columbusTaxRate,
          isFicaExempt: isFicaExempt
        });

        this.showToast("Settings saved successfully!", "success");
        if (settingsModal) settingsModal.classList.add("hidden");

        this.renderAllViews();
        this.checkUpsertStatus();
      });
    }

    // Sync Now (Pull from Sheet)
    if (syncNowBtn) {
      syncNowBtn.addEventListener("click", () => this.pullFromSheet());
    }

    // Bulk Push to Sheet
    if (bulkPushBtn) {
      bulkPushBtn.addEventListener("click", () => this.pushToSheet());
    }

    // Export CSV & JSON
    const exportCsvBtn = document.getElementById("exportCsvBtn");
    if (exportCsvBtn) {
      exportCsvBtn.addEventListener("click", () => {
        const csv = window.dataStore.exportToCsv();
        if (!csv) {
          this.showToast("No records to export.", "warning");
          return;
        }
        this.downloadFile(csv, `dailyPay_records_${this.formatDateToLocalYMD(new Date())}.csv`, "text/csv");
      });
    }

    const exportJsonBtn = document.getElementById("exportJsonBtn");
    if (exportJsonBtn) {
      exportJsonBtn.addEventListener("click", () => {
        const json = window.dataStore.exportToJson();
        this.downloadFile(json, `dailyPay_records_${this.formatDateToLocalYMD(new Date())}.json`, "application/json");
      });
    }

    // Search and filter in history tab
    const searchInput = document.getElementById("historySearchInput");
    if (searchInput) {
      searchInput.addEventListener("input", () => this.renderFullHistoryTable());
    }

    const monthFilter = document.getElementById("historyMonthFilter");
    if (monthFilter) {
      monthFilter.addEventListener("change", () => this.renderFullHistoryTable());
    }
  }

  loadSettingsIntoUI() {
    const settings = window.dataStore.settings;
    const taxConfig = window.taxEngine.config;

    const urlInput = document.getElementById("settingsGoogleSheetUrl");
    const anchorInput = document.getElementById("settingsAnchorDate");
    const autoSyncInput = document.getElementById("settingsAutoSync");
    const columbusRateInput = document.getElementById("settingsColumbusTaxRate");
    const hourlyRateInput = document.getElementById("settingsHourlyRate");
    const ficaExemptInput = document.getElementById("settingsFicaExempt");

    if (urlInput) urlInput.value = settings.googleSheetUrl || "";
    if (anchorInput) anchorInput.value = settings.payPeriodAnchorDate || "2026-11-09";
    if (autoSyncInput) autoSyncInput.checked = settings.autoSync ?? true;
    if (columbusRateInput) columbusRateInput.value = (taxConfig.columbusCityTaxRate * 100).toFixed(2);
    if (hourlyRateInput) hourlyRateInput.value = (taxConfig.hourlyRate || 12).toFixed(2);
    if (ficaExemptInput) ficaExemptInput.checked = taxConfig.isFicaExempt || false;
  }

  renderAllViews() {
    window.dashboardManager.render();
    this.renderFullHistoryTable();
  }

  downloadFile(content, fileName, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  showToast(message, type = "info") {
    const container = document.getElementById("toastContainer");
    if (!container) return;

    const toast = document.createElement("div");
    const colorClasses = {
      success: "bg-emerald-600 text-white border-emerald-400",
      error: "bg-rose-700 text-white border-rose-500 shadow-rose-950/50",
      warning: "bg-amber-600 text-white border-amber-400",
      info: "bg-blue-600 text-white border-blue-400"
    }[type] || "bg-slate-800 text-white border-slate-700";

    const duration = type === "error" ? 6500 : 3500;

    toast.className = `flex items-center justify-between gap-3 px-4 py-3 rounded-xl shadow-2xl border text-sm font-medium transition-all transform translate-y-2 opacity-0 duration-300 ${colorClasses}`;
    toast.innerHTML = `
      <span class="flex-1">${message}</span>
      <button type="button" onclick="this.parentElement.remove()" class="text-white/80 hover:text-white text-xs font-bold px-1">✕</button>
    `;

    container.appendChild(toast);

    setTimeout(() => {
      toast.classList.remove("translate-y-2", "opacity-0");
    }, 10);

    setTimeout(() => {
      toast.classList.add("opacity-0", "translate-y-2");
      setTimeout(() => toast.remove(), 300);
    }, duration);
  }

  setText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  }
}

// Instantiate and initialize on DOM ready
document.addEventListener("DOMContentLoaded", () => {
  window.app = new DailyPayApp();
  window.app.init();
});
