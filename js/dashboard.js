/**
 * =========================================================================
 * DailyPay - Metrics & Dashboard Analytics Engine
 * =========================================================================
 * Calculates Monthly & Bi-Weekly (every 2 weeks) pay breakdowns,
 * tax deductions for Columbus, OH, and renders responsive Chart.js visual charts.
 * =========================================================================
 */

class DashboardManager {
  constructor() {
    this.earningsChart = null;
    this.taxDoughnutChart = null;
    this.hoursChart = null;
    this.currentViewMode = "overview"; // "overview" | "monthly" | "biweekly"
    this.selectedMonth = null;
  }

  /**
   * Main render method to refresh all dashboard components
   */
  render() {
    const records = window.dataStore.records;
    this.renderTopMetrics(records);
    this.renderMonthlySection(records);
    this.renderBiWeeklySection(records);
    this.renderCharts(records);
    this.renderRecentShiftsTable(records);
  }

  /**
   * Calculate and update top KPI metric cards
   */
  renderTopMetrics(records) {
    let totalHours = 0;
    let totalGross = 0;
    let totalTax = 0;
    let totalNet = 0;
    let columbusCityTaxTotal = 0;

    records.forEach(r => {
      const calc = window.taxEngine.calculate(r.totalHours, r.hourlyRate);
      totalHours += r.totalHours || 0;
      totalGross += calc.grossPay;
      totalTax += calc.taxes.totalTax;
      totalNet += calc.netPay;
      columbusCityTaxTotal += calc.taxes.columbusCity;
    });

    const shiftCount = records.length;
    const avgHoursPerShift = shiftCount > 0 ? (totalHours / shiftCount) : 0;
    const effectiveNetRate = totalHours > 0 ? (totalNet / totalHours) : 0;

    // Update DOM elements
    this.setText("metricTotalGross", window.taxEngine.formatCurrency(totalGross));
    this.setText("metricTotalNet", window.taxEngine.formatCurrency(totalNet));
    this.setText("metricTotalTax", window.taxEngine.formatCurrency(totalTax));
    this.setText("metricTotalHours", window.taxEngine.formatHours(totalHours));
    this.setText("metricShiftCount", `${shiftCount} logged shifts`);
    this.setText("metricAvgShift", `${avgHoursPerShift.toFixed(1)} hrs / shift`);
    this.setText("metricNetRate", `${window.taxEngine.formatCurrency(effectiveNetRate)}/hr net`);
    this.setText("metricColumbusTaxSub", `Incl. ${window.taxEngine.formatCurrency(columbusCityTaxTotal)} Columbus 2.5% tax`);
  }

  /**
   * Group records by calendar month (Monthly breakdown)
   */
  getMonthlyGroups(records) {
    const groups = {};

    records.forEach(r => {
      if (!r.date) return;
      const [year, month] = r.date.split("-");
      const key = `${year}-${month}`; // e.g. "2026-11"

      if (!groups[key]) {
        const dateObj = new Date(parseInt(year), parseInt(month) - 1, 1);
        const monthName = dateObj.toLocaleDateString("en-US", { month: "long", year: "numeric" });
        groups[key] = {
          key: key,
          label: monthName,
          year: parseInt(year),
          month: parseInt(month),
          totalHours: 0,
          grossPay: 0,
          taxAmount: 0,
          netPay: 0,
          taxes: {
            columbusCity: 0,
            ficaTotal: 0,
            ohioState: 0,
            federal: 0
          },
          records: []
        };
      }

      const calc = window.taxEngine.calculate(r.totalHours, r.hourlyRate);
      groups[key].totalHours += r.totalHours || 0;
      groups[key].grossPay += calc.grossPay;
      groups[key].taxAmount += calc.taxes.totalTax;
      groups[key].netPay += calc.netPay;
      groups[key].taxes.columbusCity += calc.taxes.columbusCity;
      groups[key].taxes.ficaTotal += calc.taxes.ficaTotal;
      groups[key].taxes.ohioState += calc.taxes.ohioState;
      groups[key].taxes.federal += calc.taxes.federal;
      groups[key].records.push(r);
    });

    // Sort descending by month key
    return Object.values(groups).sort((a, b) => b.key.localeCompare(a.key));
  }

  /**
   * Render the Monthly breakdown section
   */
  renderMonthlySection(records) {
    const container = document.getElementById("monthlyCardsContainer");
    if (!container) return;

    const monthlyGroups = this.getMonthlyGroups(records);

    if (monthlyGroups.length === 0) {
      container.innerHTML = `
        <div class="col-span-full p-8 text-center bg-slate-900/40 rounded-2xl border border-slate-800 text-slate-400">
          <p>No monthly records logged yet. Enter your first shift above!</p>
        </div>`;
      return;
    }

    container.innerHTML = monthlyGroups.map(group => `
      <div class="bg-slate-900/80 backdrop-blur-sm border border-slate-800/80 rounded-2xl p-6 transition-all hover:border-slate-700 hover:shadow-xl hover:shadow-blue-950/20">
        <div class="flex items-center justify-between mb-4 pb-3 border-b border-slate-800">
          <div>
            <span class="text-xs font-semibold tracking-wider uppercase text-blue-400">Monthly Period</span>
            <h3 class="text-xl font-bold text-white flex items-center gap-2">
              ${group.label}
            </h3>
          </div>
          <span class="px-3 py-1 rounded-full text-xs font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/20">
            ${group.records.length} shifts
          </span>
        </div>

        <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
          <div class="bg-slate-800/50 rounded-xl p-3">
            <span class="text-xs text-slate-400 block mb-1">Total Hours</span>
            <span class="text-lg font-bold text-white">${group.totalHours.toFixed(2)} hrs</span>
          </div>
          <div class="bg-slate-800/50 rounded-xl p-3">
            <span class="text-xs text-slate-400 block mb-1">Gross Earnings</span>
            <span class="text-lg font-bold text-slate-200">${window.taxEngine.formatCurrency(group.grossPay)}</span>
          </div>
          <div class="bg-rose-950/20 border border-rose-900/30 rounded-xl p-3">
            <span class="text-xs text-rose-400 block mb-1">Columbus & Taxes</span>
            <span class="text-lg font-bold text-rose-400">-${window.taxEngine.formatCurrency(group.taxAmount)}</span>
          </div>
          <div class="bg-emerald-950/20 border border-emerald-900/30 rounded-xl p-3">
            <span class="text-xs text-emerald-400 block mb-1">Net Take-Home</span>
            <span class="text-xl font-black text-emerald-400">${window.taxEngine.formatCurrency(group.netPay)}</span>
          </div>
        </div>

        <!-- Columbus, OH Tax Breakdown Drawer -->
        <div class="bg-slate-950/60 rounded-xl p-3.5 border border-slate-800/80 mb-4 text-xs">
          <div class="flex justify-between items-center mb-2 font-medium text-slate-400">
            <span>Columbus, OH Tax Breakdown:</span>
            <span class="text-slate-300 font-semibold">${((group.taxAmount / (group.grossPay || 1)) * 100).toFixed(1)}% total</span>
          </div>
          <div class="grid grid-cols-2 gap-2 text-slate-300">
            <div class="flex justify-between">
              <span class="text-slate-400">Columbus City (2.5%):</span>
              <span class="font-mono text-rose-300">-${window.taxEngine.formatCurrency(group.taxes.columbusCity)}</span>
            </div>
            <div class="flex justify-between">
              <span class="text-slate-400">FICA (SS & Med 7.65%):</span>
              <span class="font-mono text-rose-300">-${window.taxEngine.formatCurrency(group.taxes.ficaTotal)}</span>
            </div>
            <div class="flex justify-between">
              <span class="text-slate-400">Ohio State Tax:</span>
              <span class="font-mono text-rose-300">-${window.taxEngine.formatCurrency(group.taxes.ohioState)}</span>
            </div>
            <div class="flex justify-between">
              <span class="text-slate-400">Federal Tax:</span>
              <span class="font-mono text-rose-300">-${window.taxEngine.formatCurrency(group.taxes.federal)}</span>
            </div>
          </div>
        </div>

        <div class="flex items-center justify-between text-xs text-slate-400 pt-1">
          <span>Effective rate: ${(group.netPay / (group.totalHours || 1)).toFixed(2)}/hr net</span>
          <button onclick="window.dashboardManager.viewMonthDetails('${group.key}')" 
                  class="text-blue-400 hover:text-blue-300 font-medium inline-flex items-center gap-1 transition-colors">
            <span>View Month Shifts</span> &rarr;
          </button>
        </div>
      </div>
    `).join("");
  }

  /**
   * Group records into 2-week bi-weekly pay periods
   * Standard 14-day pay cycle anchored to anchor date
   */
  getBiWeeklyGroups(records) {
    if (records.length === 0) return [];

    const anchorStr = (window.dataStore.settings && window.dataStore.settings.payPeriodAnchorDate) || "2026-11-09";
    const anchor = new Date(anchorStr + "T00:00:00");
    const msInDay = 24 * 60 * 60 * 1000;
    const msInPeriod = 14 * msInDay;

    const periods = {};

    records.forEach(r => {
      if (!r.date) return;
      const recordDate = new Date(r.date + "T00:00:00");
      const diffMs = recordDate.getTime() - anchor.getTime();
      const periodIndex = Math.floor(diffMs / msInPeriod);

      const periodStartMs = anchor.getTime() + (periodIndex * msInPeriod);
      const periodEndMs = periodStartMs + (13 * msInDay);

      const periodStart = new Date(periodStartMs);
      const periodEnd = new Date(periodEndMs);

      const startFormatted = periodStart.toISOString().split("T")[0];
      const endFormatted = periodEnd.toISOString().split("T")[0];
      const periodKey = `${startFormatted}_${endFormatted}`;

      if (!periods[periodKey]) {
        const startLabel = periodStart.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
        const endLabel = periodEnd.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

        const now = new Date();
        const isCurrent = recordDate <= now && now <= new Date(periodEndMs + msInDay);

        periods[periodKey] = {
          key: periodKey,
          startDate: startFormatted,
          endDate: endFormatted,
          label: `${startLabel} – ${endLabel}`,
          isCurrent: isCurrent,
          totalHours: 0,
          grossPay: 0,
          taxAmount: 0,
          netPay: 0,
          taxes: {
            columbusCity: 0,
            ficaTotal: 0,
            ohioState: 0,
            federal: 0
          },
          records: []
        };
      }

      const calc = window.taxEngine.calculate(r.totalHours, r.hourlyRate);
      periods[periodKey].totalHours += r.totalHours || 0;
      periods[periodKey].grossPay += calc.grossPay;
      periods[periodKey].taxAmount += calc.taxes.totalTax;
      periods[periodKey].netPay += calc.netPay;
      periods[periodKey].taxes.columbusCity += calc.taxes.columbusCity;
      periods[periodKey].taxes.ficaTotal += calc.taxes.ficaTotal;
      periods[periodKey].taxes.ohioState += calc.taxes.ohioState;
      periods[periodKey].taxes.federal += calc.taxes.federal;
      periods[periodKey].records.push(r);
    });

    // Sort descending by period start date
    return Object.values(periods).sort((a, b) => b.startDate.localeCompare(a.startDate));
  }

  /**
   * Render the Bi-Weekly (Every 2 Weeks) section
   */
  renderBiWeeklySection(records) {
    const container = document.getElementById("biweeklyCardsContainer");
    if (!container) return;

    const periods = this.getBiWeeklyGroups(records);

    if (periods.length === 0) {
      container.innerHTML = `
        <div class="col-span-full p-8 text-center bg-slate-900/40 rounded-2xl border border-slate-800 text-slate-400">
          <p>No bi-weekly pay periods found. Log shifts to see your 2-week paycheck estimates!</p>
        </div>`;
      return;
    }

    container.innerHTML = periods.map(period => `
      <div class="relative bg-gradient-to-br from-slate-900/90 to-slate-900/60 backdrop-blur-md border border-slate-800/80 rounded-2xl p-6 transition-all hover:border-emerald-500/40 hover:shadow-xl hover:shadow-emerald-950/20">
        ${period.isCurrent ? `
          <div class="absolute -top-3 right-6 bg-emerald-500 text-slate-950 text-xs font-black px-3 py-0.5 rounded-full uppercase tracking-wider shadow-lg">
            Current Pay Cycle
          </div>
        ` : ''}

        <div class="flex items-center justify-between mb-4 pb-3 border-b border-slate-800">
          <div>
            <span class="text-xs font-semibold tracking-wider uppercase text-emerald-400 flex items-center gap-1.5">
              <span class="w-2 h-2 rounded-full bg-emerald-400"></span>
              Every 2 Weeks Pay Period
            </span>
            <h3 class="text-lg font-bold text-white mt-1">
              ${period.label}
            </h3>
          </div>
          <span class="px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-800 text-slate-300">
            ${period.records.length} shifts
          </span>
        </div>

        <!-- Paycheck Highlights -->
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
          <div class="bg-slate-800/50 rounded-xl p-3">
            <span class="text-xs text-slate-400 block mb-1">Pay Period Hours</span>
            <span class="text-lg font-bold text-white">${period.totalHours.toFixed(2)} hrs</span>
          </div>
          <div class="bg-slate-800/50 rounded-xl p-3">
            <span class="text-xs text-slate-400 block mb-1">Gross Earnings</span>
            <span class="text-lg font-bold text-slate-200">${window.taxEngine.formatCurrency(period.grossPay)}</span>
          </div>
          <div class="bg-rose-950/20 border border-rose-900/30 rounded-xl p-3">
            <span class="text-xs text-rose-400 block mb-1">Tax Deductions</span>
            <span class="text-lg font-bold text-rose-400">-${window.taxEngine.formatCurrency(period.taxAmount)}</span>
          </div>
          <div class="bg-emerald-950/30 border border-emerald-800/40 rounded-xl p-3">
            <span class="text-xs text-emerald-400 block mb-1">Estimated Paycheck (Net)</span>
            <span class="text-2xl font-black text-emerald-400">${window.taxEngine.formatCurrency(period.netPay)}</span>
          </div>
        </div>

        <!-- Columbus, OH Tax Breakdown Drawer for this pay period -->
        <div class="bg-slate-950/70 rounded-xl p-3 border border-slate-800 mb-4 text-xs">
          <div class="flex justify-between items-center mb-1.5 text-slate-400">
            <span class="font-medium">Columbus, OH Withholding Details:</span>
            <span class="text-slate-300 font-bold">${((period.taxAmount / (period.grossPay || 1)) * 100).toFixed(1)}%</span>
          </div>
          <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 text-slate-300">
            <div class="bg-slate-900/50 p-2 rounded-lg">
              <span class="text-slate-500 block text-[10px]">Columbus City 2.5%</span>
              <span class="font-mono text-rose-300">-${window.taxEngine.formatCurrency(period.taxes.columbusCity)}</span>
            </div>
            <div class="bg-slate-900/50 p-2 rounded-lg">
              <span class="text-slate-500 block text-[10px]">FICA (SS & Med 7.65%)</span>
              <span class="font-mono text-rose-300">-${window.taxEngine.formatCurrency(period.taxes.ficaTotal)}</span>
            </div>
            <div class="bg-slate-900/50 p-2 rounded-lg">
              <span class="text-slate-500 block text-[10px]">Ohio State Tax</span>
              <span class="font-mono text-rose-300">-${window.taxEngine.formatCurrency(period.taxes.ohioState)}</span>
            </div>
            <div class="bg-slate-900/50 p-2 rounded-lg">
              <span class="text-slate-500 block text-[10px]">Federal Tax</span>
              <span class="font-mono text-rose-300">-${window.taxEngine.formatCurrency(period.taxes.federal)}</span>
            </div>
          </div>
        </div>

        <div class="flex items-center justify-between pt-1">
          <span class="text-xs text-slate-400">
            Hourly Net: ${window.taxEngine.formatCurrency(period.totalHours > 0 ? (period.netPay / period.totalHours) : 0)}/hr
          </span>
          <button onclick="window.dashboardManager.generatePaystub('${period.key}')" 
                  class="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition-colors border border-slate-700">
            <svg class="w-3.5 h-3.5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"></path></svg>
            Print Paystub Statement
          </button>
        </div>
      </div>
    `).join("");
  }

  /**
   * Render Chart.js visual charts
   */
  renderCharts(records) {
    if (typeof Chart === "undefined") return;

    // 1. Earnings Trend Chart (Daily/Weekly Gross vs Net)
    this.renderEarningsTrendChart(records);

    // 2. Columbus OH Tax Breakdown Doughnut Chart
    this.renderTaxDoughnutChart(records);

    // 3. Hours Worked Chart
    this.renderHoursChart(records);
  }

  renderEarningsTrendChart(records) {
    const ctx = document.getElementById("earningsTrendChart");
    if (!ctx) return;

    // Take last 14 logged shifts in chronological order
    const sorted = [...records].sort((a, b) => a.date.localeCompare(b.date)).slice(-14);
    const labels = sorted.map(r => r.date.slice(5)); // "MM-DD"
    const grossData = sorted.map(r => r.grossPay);
    const netData = sorted.map(r => r.netPay);

    if (this.earningsChart) {
      this.earningsChart.destroy();
    }

    this.earningsChart = new Chart(ctx, {
      type: "bar",
      data: {
        labels: labels,
        datasets: [
          {
            label: "Gross Earnings ($)",
            data: grossData,
            backgroundColor: "rgba(59, 130, 246, 0.65)",
            borderColor: "rgba(59, 130, 246, 1)",
            borderWidth: 1.5,
            borderRadius: 6
          },
          {
            label: "Net Take-Home ($)",
            data: netData,
            backgroundColor: "rgba(16, 185, 129, 0.8)",
            borderColor: "rgba(16, 185, 129, 1)",
            borderWidth: 1.5,
            borderRadius: 6
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: "top",
            labels: { color: "#94a3b8", font: { family: "Inter, sans-serif", size: 12 } }
          },
          tooltip: {
            callbacks: {
              label: (context) => `${context.dataset.label}: $${Number(context.raw).toFixed(2)}`
            }
          }
        },
        scales: {
          x: {
            grid: { color: "rgba(255, 255, 255, 0.05)" },
            ticks: { color: "#94a3b8" }
          },
          y: {
            grid: { color: "rgba(255, 255, 255, 0.05)" },
            ticks: {
              color: "#94a3b8",
              callback: (val) => `$${val}`
            }
          }
        }
      }
    });
  }

  renderTaxDoughnutChart(records) {
    const ctx = document.getElementById("taxDoughnutChart");
    if (!ctx) return;

    let columbusCity = 0;
    let ficaTotal = 0;
    let ohioState = 0;
    let federal = 0;
    let netTotal = 0;

    records.forEach(r => {
      const calc = window.taxEngine.calculate(r.totalHours, r.hourlyRate);
      columbusCity += calc.taxes.columbusCity;
      ficaTotal += calc.taxes.ficaTotal;
      ohioState += calc.taxes.ohioState;
      federal += calc.taxes.federal;
      netTotal += calc.netPay;
    });

    if (this.taxDoughnutChart) {
      this.taxDoughnutChart.destroy();
    }

    this.taxDoughnutChart = new Chart(ctx, {
      type: "doughnut",
      data: {
        labels: [
          "Net Take-Home (84.5%)",
          "Columbus City Tax (2.5%)",
          "FICA SS & Med (7.65%)",
          "Federal Tax (4.25%)",
          "Ohio State Tax (1.1%)"
        ],
        datasets: [{
          data: [netTotal, columbusCity, ficaTotal, federal, ohioState],
          backgroundColor: [
            "#10b981", // Emerald Net
            "#f43f5e", // Rose Columbus
            "#fbbf24", // Amber FICA
            "#818cf8", // Indigo Federal
            "#38bdf8"  // Sky Ohio
          ],
          borderColor: "#0f172a",
          borderWidth: 2
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: "right",
            labels: { color: "#94a3b8", font: { family: "Inter, sans-serif", size: 11 }, boxWidth: 14 }
          },
          tooltip: {
            callbacks: {
              label: (context) => ` ${context.label}: $${Number(context.raw).toFixed(2)}`
            }
          }
        },
        cutout: "70%"
      }
    });
  }

  renderHoursChart(records) {
    const ctx = document.getElementById("hoursChart");
    if (!ctx) return;

    const sorted = [...records].sort((a, b) => a.date.localeCompare(b.date)).slice(-14);
    const labels = sorted.map(r => r.date.slice(5));
    const hoursData = sorted.map(r => r.totalHours);

    if (this.hoursChart) {
      this.hoursChart.destroy();
    }

    this.hoursChart = new Chart(ctx, {
      type: "line",
      data: {
        labels: labels,
        datasets: [{
          label: "Hours Worked",
          data: hoursData,
          fill: true,
          backgroundColor: "rgba(56, 189, 248, 0.15)",
          borderColor: "#38bdf8",
          tension: 0.35,
          pointBackgroundColor: "#38bdf8",
          pointRadius: 4,
          pointHoverRadius: 6
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false }
        },
        scales: {
          x: {
            grid: { color: "rgba(255, 255, 255, 0.05)" },
            ticks: { color: "#94a3b8" }
          },
          y: {
            min: 0,
            grid: { color: "rgba(255, 255, 255, 0.05)" },
            ticks: {
              color: "#94a3b8",
              callback: (val) => `${val}h`
            }
          }
        }
      }
    });
  }

  /**
   * Render Recent Shifts Table in the overview
   */
  renderRecentShiftsTable(records) {
    const tbody = document.getElementById("recentShiftsTableBody");
    if (!tbody) return;

    if (records.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" class="py-6 text-center text-slate-500">No shifts logged yet.</td></tr>`;
      return;
    }

    // Top 8 records
    const recent = records.slice(0, 8);

    tbody.innerHTML = recent.map(r => {
      const calc = window.taxEngine.calculate(r.totalHours, r.hourlyRate);
      return `
        <tr class="border-b border-slate-800 hover:bg-slate-800/40 transition-colors">
          <td class="py-3 px-4 font-medium text-slate-200">
            ${r.date}
          </td>
          <td class="py-3 px-4 text-slate-400">
            ${r.startTime || '--'} &ndash; ${r.endTime || '--'}
            ${r.breakMinutes > 0 ? `<span class="text-xs text-slate-500">(${r.breakMinutes}m brk)</span>` : ''}
          </td>
          <td class="py-3 px-4 font-semibold text-slate-300">
            ${(r.totalHours || 0).toFixed(2)}h
          </td>
          <td class="py-3 px-4 font-medium text-slate-400">
            ${window.taxEngine.formatCurrency(calc.grossPay)}
          </td>
          <td class="py-3 px-4 text-rose-400 font-mono text-xs">
            -${window.taxEngine.formatCurrency(calc.taxes.totalTax)}
          </td>
          <td class="py-3 px-4 font-bold text-emerald-400">
            ${window.taxEngine.formatCurrency(calc.netPay)}
          </td>
          <td class="py-3 px-4 text-right">
            <button onclick="window.app.editShift('${r.date}')" class="text-xs font-semibold text-blue-400 hover:text-blue-300 mr-2">Edit</button>
            <button onclick="window.app.deleteShift('${r.date}')" class="text-xs font-semibold text-rose-400 hover:text-rose-300">Delete</button>
          </td>
        </tr>
      `;
    }).join("");
  }

  /**
   * Paystub generator modal for 2-week pay period
   */
  generatePaystub(periodKey) {
    const periods = this.getBiWeeklyGroups(window.dataStore.records);
    const period = periods.find(p => p.key === periodKey);
    if (!period) return;

    const modal = document.getElementById("paystubModal");
    const content = document.getElementById("paystubContent");
    if (!modal || !content) return;

    content.innerHTML = `
      <div id="printablePaystub" class="p-6 bg-slate-900 rounded-2xl text-slate-200 border border-slate-800">
        <!-- Header -->
        <div class="flex justify-between items-start pb-4 border-b border-slate-700 mb-6">
          <div>
            <h2 class="text-2xl font-black text-white">EARNINGS STATEMENT</h2>
            <p class="text-xs text-slate-400">DailyPay Bi-Weekly Pay Period Summary</p>
            <p class="text-sm font-semibold text-emerald-400 mt-1">Location: Columbus, OH</p>
          </div>
          <div class="text-right">
            <p class="text-xs text-slate-400">Pay Period</p>
            <p class="text-sm font-bold text-white">${period.label}</p>
            <p class="text-xs text-slate-500 mt-1">Rate: $12.00 / hr</p>
          </div>
        </div>

        <!-- Summary Grid -->
        <div class="grid grid-cols-3 gap-4 mb-6">
          <div class="bg-slate-800/80 p-4 rounded-xl">
            <span class="text-xs text-slate-400 block mb-1">Total Hours</span>
            <span class="text-2xl font-bold text-white">${period.totalHours.toFixed(2)}</span>
          </div>
          <div class="bg-slate-800/80 p-4 rounded-xl">
            <span class="text-xs text-slate-400 block mb-1">Total Gross Earnings</span>
            <span class="text-2xl font-bold text-slate-200">${window.taxEngine.formatCurrency(period.grossPay)}</span>
          </div>
          <div class="bg-emerald-950/40 border border-emerald-500/30 p-4 rounded-xl">
            <span class="text-xs text-emerald-400 block mb-1">Net Paycheck (Take-Home)</span>
            <span class="text-2xl font-black text-emerald-400">${window.taxEngine.formatCurrency(period.netPay)}</span>
          </div>
        </div>

        <!-- Tax Deductions Itemization -->
        <div class="mb-6">
          <h4 class="text-sm font-bold text-slate-300 uppercase tracking-wider mb-3">Itemized Tax Deductions (Columbus, OH)</h4>
          <table class="w-full text-sm">
            <thead>
              <tr class="border-b border-slate-700 text-xs text-slate-400 text-left">
                <th class="py-2">Deduction Description</th>
                <th class="py-2">Jurisdiction</th>
                <th class="py-2">Rate %</th>
                <th class="py-2 text-right">Amount Deducted</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-800">
              <tr>
                <td class="py-2 font-medium">Columbus Municipal Income Tax</td>
                <td class="py-2 text-slate-400">Columbus, OH</td>
                <td class="py-2 text-slate-400">2.50%</td>
                <td class="py-2 text-right font-mono text-rose-300">-${window.taxEngine.formatCurrency(period.taxes.columbusCity)}</td>
              </tr>
              <tr>
                <td class="py-2 font-medium">Social Security (OASDI)</td>
                <td class="py-2 text-slate-400">Federal (FICA)</td>
                <td class="py-2 text-slate-400">6.20%</td>
                <td class="py-2 text-right font-mono text-rose-300">-${window.taxEngine.formatCurrency(period.grossPay * 0.062)}</td>
              </tr>
              <tr>
                <td class="py-2 font-medium">Medicare Hospital Insurance</td>
                <td class="py-2 text-slate-400">Federal (FICA)</td>
                <td class="py-2 text-slate-400">1.45%</td>
                <td class="py-2 text-right font-mono text-rose-300">-${window.taxEngine.formatCurrency(period.grossPay * 0.0145)}</td>
              </tr>
              <tr>
                <td class="py-2 font-medium">Ohio State Income Tax (est.)</td>
                <td class="py-2 text-slate-400">Ohio (SIT)</td>
                <td class="py-2 text-slate-400">1.10%</td>
                <td class="py-2 text-right font-mono text-rose-300">-${window.taxEngine.formatCurrency(period.taxes.ohioState)}</td>
              </tr>
              <tr>
                <td class="py-2 font-medium">Federal Income Tax Withholding (est.)</td>
                <td class="py-2 text-slate-400">Federal (FIT)</td>
                <td class="py-2 text-slate-400">4.25%</td>
                <td class="py-2 text-right font-mono text-rose-300">-${window.taxEngine.formatCurrency(period.taxes.federal)}</td>
              </tr>
              <tr class="font-bold border-t border-slate-600">
                <td class="py-2.5" colspan="3">Total Deductions</td>
                <td class="py-2.5 text-right font-mono text-rose-400">-${window.taxEngine.formatCurrency(period.taxAmount)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Shift details for this period -->
        <div class="mb-6">
          <h4 class="text-sm font-bold text-slate-300 uppercase tracking-wider mb-2">Shifts in this 2-Week Period (${period.records.length})</h4>
          <div class="max-h-48 overflow-y-auto rounded-lg border border-slate-800">
            <table class="w-full text-xs">
              <thead class="bg-slate-800 text-slate-400 text-left sticky top-0">
                <tr>
                  <th class="p-2">Date</th>
                  <th class="p-2">Time</th>
                  <th class="p-2">Hours</th>
                  <th class="p-2">Gross</th>
                  <th class="p-2 text-right">Net</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-800">
                ${period.records.map(r => `
                  <tr>
                    <td class="p-2">${r.date}</td>
                    <td class="p-2">${r.startTime || '--'} - ${r.endTime || '--'}</td>
                    <td class="p-2">${r.totalHours.toFixed(2)}h</td>
                    <td class="p-2">${window.taxEngine.formatCurrency(r.grossPay)}</td>
                    <td class="p-2 text-right text-emerald-400 font-semibold">${window.taxEngine.formatCurrency(r.netPay)}</td>
                  </tr>
                `).join("")}
              </tbody>
            </table>
          </div>
        </div>

        <div class="text-center text-xs text-slate-500 pt-4 border-t border-slate-800">
          Generated by DailyPay Work Hours & Pay Tracker &bull; Columbus, Ohio
        </div>
      </div>
    `;

    modal.classList.remove("hidden");
  }

  viewMonthDetails(monthKey) {
    // Switch to history tab and filter by month
    window.app.filterHistoryByMonth(monthKey);
    window.app.switchTab("history");
  }

  setText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  }
}

// Global instance
window.dashboardManager = new DashboardManager();
