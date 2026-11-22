# 💵 DailyPay - Work Hours & Columbus, OH Earnings Tracker

A modern, responsive web application hosted directly on **GitHub Pages** to log daily work hours, calculate real-time **Columbus, Ohio** tax withholdings, compute gross and net take-home earnings on both a **monthly** and **bi-weekly (every 2 weeks)** basis, and automatically **upsert** data into a **Google Sheet**.

---

## 🌟 Key Features

1. **⏱️ Flexible Work Hours Logging**:
   - **Default Date**: Automatically selects the current date in your local timezone upon opening, with one-click **"Today"** and **"Yesterday"** shortcut buttons.
   - **When-to-When Tracking**: Enter start time (From) and end time (To).
   - **Break Duration**: Unpaid break dropdown (0, 15, 30, 45, 60 minutes).
   - **Auto-Calculated & Editable**: Hours worked are calculated dynamically in real-time, with full ability to manually edit/override if desired.
   - **Hourly Rate**: Preset to **$12.00 USD** (editable per shift or in global settings).
   - **All Fields Editable**: Date, start time, end time, break, total hours, rate, and notes can be edited at any time.

2. **🔄 Smart Upsert Logic (No Duplicate Dates)**:
   - Selecting a date that has already been recorded alerts you immediately and pre-fills the form with that day's shift.
   - Submitting will **upsert (update)** that specific date's row in both local storage and Google Sheets rather than inserting duplicates.

3. **🏛️ Columbus, OH Tax Deduction Engine ($12.00/hr)**:
   - **Columbus Municipal Income Tax**: **2.50%** flat on all earned gross compensation.
   - **Federal FICA (Payroll Taxes)**: **7.65%** (Social Security: 6.20% + Medicare: 1.45%). *(Toggleable in settings for F-1 visa student exemption)*.
   - **Ohio State Income Tax (SIT)**: Estimated **1.10%** effective rate for $12/hr wage bracket.
   - **Federal Income Tax (FIT)**: Estimated **4.25%** effective withholding (accounting for standard deduction).
   - **Total Estimated Tax Deduction**: **15.50%** ($1.86/hr).
   - **Net Take-Home Pay**: **$10.14/hr** (84.50% of gross pay).

4. **📊 Dual Payroll Analytics (Monthly & Every 2 Weeks)**:
   - **Every 2 Weeks (Bi-Weekly) Pay Periods**: Grouped into standard 14-day payroll cycles with gross, taxes, and net take-home estimates.
   - **Printable Bi-Weekly Paystub**: Generates a clean, printable earnings statement complete with itemized Columbus, OH tax deductions.
   - **Monthly Summaries**: Calendar month view aggregating total hours, gross income, tax withholdings, and net pay.
   - **Visual Charts (Chart.js)**: Daily Gross vs. Net trend, Columbus tax breakdown doughnut chart, and hours worked timeline.

5. **☁️ Google Sheets Auto-Sync & Local Persistence**:
   - Works immediately offline via browser storage (`localStorage`).
   - Syncs automatically to Google Sheets using a lightweight Google Apps Script Web App.
   - Provides connection testing, manual pull, and bulk push tools.

---

## 🚀 How to Load from GitHub (GitHub Pages Setup)

This web application is built as a zero-dependency, static Single Page Application (HTML5, Tailwind CSS, Chart.js) ready for instant GitHub Pages hosting.

### Step 1: Push Code to GitHub
```bash
git add .
git commit -m "feat: complete DailyPay tracker with Google Sheets upsert and Columbus OH tax engine"
git push -u origin main
```

### Step 2: Enable GitHub Pages
1. Open your repository on GitHub: [https://github.com/natureworldusa-crypto/dailyPay](https://github.com/natureworldusa-crypto/dailyPay)
2. Go to **Settings** > **Pages** (in the left sidebar).
3. Under **Build and deployment**:
   - **Source**: Select **Deploy from a branch**
   - **Branch**: Select `main` and folder `/ (root)`
   - Click **Save**
4. Within 1 minute, your webpage will be live at:
   👉 **`https://natureworldusa-crypto.github.io/dailyPay/`**

*(A GitHub Actions workflow `.github/workflows/deploy.yml` is also included if you prefer GitHub Actions deployment).*

---

## 📑 How to Connect Google Sheets (Step-by-Step)

The repository includes a ready-to-use Google Apps Script backend (`google-apps-script/Code.gs`) that handles upserting (inserting new dates or updating existing rows).

### 1. Create a Google Sheet
- Open [Google Sheets](https://sheets.new) and create a new blank spreadsheet (e.g. name it `DailyPay Tracker`).

### 2. Open Google Apps Script
- In the top menu of your Google Sheet, click **Extensions** > **Apps Script**.

### 3. Paste the Script Code
- Delete any template code in the editor (`function myFunction() {}`).
- Open [google-apps-script/Code.gs](file:///D:/projects/antigravity/dailyPay/dailyPay/google-apps-script/Code.gs) in this repository, copy the entire file contents, and paste it into the Apps Script editor.
- Click the **Save** icon (diskette) or press `Ctrl + S`.

### 4. Deploy as a Web App
1. Click the blue **Deploy** button (top right) > **New deployment**.
2. Click the gear icon next to "Select type" and choose **Web app**.
3. Configure the fields:
   - **Description**: `DailyPay API`
   - **Execute as**: `Me (your_email@gmail.com)`
   - **Who has access**: `Anyone` *(Crucial: allows your GitHub webpage to send data to your sheet)*
4. Click **Deploy**.
5. Google will ask you to authorize access:
   - Click **Authorize access**
   - Select your Google account
   - If you see "Google hasn't verified this app", click **Advanced** > **Go to Untitled project (unsafe)**
   - Click **Allow**
6. Copy the generated **Web App URL** (it looks like: `https://script.google.com/macros/s/.../exec`).

### 5. Connect the Web App
1. Open your DailyPay webpage (or GitHub Pages link).
2. Click the **⚙️ Settings** icon in the top right.
3. Paste the URL into **Google Apps Script Web App URL**.
4. Click **Test Connection** (you should see a green success message).
5. Click **Save Settings**.
6. You're done! Whenever you save a shift, it will automatically upsert directly into your Google Sheet.

---

## 🗂️ Google Sheet Columns Created Automatically

When the script runs, it creates a formatted sheet called `WorkHours` with the following columns:

| Column | Header | Description |
|---|---|---|
| A | **Date** | Shift date (`YYYY-MM-DD`) - unique key used for upserting |
| B | **Start Time** | Shift start time (e.g., `09:00`) |
| C | **End Time** | Shift end time (e.g., `17:00`) |
| D | **Break (Mins)** | Unpaid break duration in minutes |
| E | **Total Hours** | Net hours worked (formatted to 2 decimal places) |
| F | **Hourly Rate ($)** | Hourly rating (default: `$12.00`) |
| G | **Gross Pay ($)** | Total Hours &times; Hourly Rate |
| H | **Columbus Tax ($)** | Total tax deductions (City 2.5%, FICA, State, Fed) |
| I | **Net Pay ($)** | Actual take-home earnings |
| J | **Notes** | Tasks, shift description, or notes |
| K | **Last Updated** | Timestamp of when the row was created or last upserted |

---

## 🏛️ Columbus, OH Tax Breakdown Details

For an hourly wage of **$12.00 USD/hr**:

| Tax Category | Jurisdiction | Rate % | Deduction per $12.00/hr | Notes |
|---|---|---|---|---|
| **Columbus Municipal Income Tax** | Columbus, OH | **2.50%** | **$0.30** | Mandatory flat city tax on all earnings within Columbus city limits |
| **Social Security (OASDI)** | Federal (FICA) | **6.20%** | **$0.74** | Standard federal retirement contribution |
| **Medicare Hospital Insurance** | Federal (FICA) | **1.45%** | **$0.17** | Standard federal health program contribution |
| **Ohio State Income Tax (SIT)** | Ohio | **~1.10%** | **$0.13** | Estimated effective Ohio state withholding |
| **Federal Income Tax (FIT)** | Federal | **~4.25%** | **$0.51** | Estimated effective single-filer rate after standard deduction |
| **TOTAL TAX DEDUCTIONS** | — | **15.50%** | **$1.86** | Total tax withheld per hour |
| **NET TAKE-HOME EARNINGS** | — | **84.50%** | **$10.14** | Actual earnings in pocket per hour |

> **Tip for International Students / F-1 Visa Workers**: If you are working on-campus on an F-1 visa, you may be exempt from FICA taxes. You can check the **"FICA Tax Exempt"** box in the Settings modal to automatically exclude the 7.65% FICA deduction.

---

## 💻 Tech Stack
- **Frontend**: HTML5, Modern Vanilla JavaScript (ES6+), CSS3.
- **Styling**: Tailwind CSS, Plus Jakarta Sans, JetBrains Mono.
- **Data Visualization**: Chart.js.
- **Hosting**: GitHub Pages.
- **Backend / Database**: Google Sheets via Google Apps Script (Web App REST API).
- **Storage**: Browser LocalStorage with automatic Google Sheet synchronization.
