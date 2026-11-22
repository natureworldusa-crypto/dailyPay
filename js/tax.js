/**
 * =========================================================================
 * DailyPay - Columbus, OH Tax Engine
 * =========================================================================
 * Calculates Gross Earnings, Columbus City Tax, Ohio State Tax,
 * Federal Income Tax, FICA (Social Security & Medicare), and Net Earnings.
 * =========================================================================
 */

const DEFAULT_TAX_CONFIG = {
  hourlyRate: 12.00,
  columbusCityTaxRate: 0.025,   // Columbus, OH Municipal Tax: 2.50% flat
  socialSecurityRate: 0.062,    // Social Security: 6.20%
  medicareRate: 0.0145,         // Medicare: 1.45%
  ohioStateTaxRate: 0.0110,     // Ohio State Income Tax est.: 1.10%
  federalTaxRate: 0.0425,       // Federal Income Tax est. for $12/hr wage: 4.25%
  isFicaExempt: false           // Toggle for F-1 student/exempt status
};

class TaxEngine {
  constructor() {
    this.config = this.loadConfig();
  }

  loadConfig() {
    try {
      const saved = localStorage.getItem("dailyPay_taxConfig");
      if (saved) {
        return { ...DEFAULT_TAX_CONFIG, ...JSON.parse(saved) };
      }
    } catch (e) {
      console.warn("Failed to load tax config from localStorage", e);
    }
    return { ...DEFAULT_TAX_CONFIG };
  }

  saveConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };
    try {
      localStorage.setItem("dailyPay_taxConfig", JSON.stringify(this.config));
    } catch (e) {
      console.error("Failed to save tax config", e);
    }
    return this.config;
  }

  resetConfig() {
    this.config = { ...DEFAULT_TAX_CONFIG };
    localStorage.removeItem("dailyPay_taxConfig");
    return this.config;
  }

  /**
   * Calculate full breakdown for given hours and hourly rate
   * @param {number} hours 
   * @param {number|null} customRate 
   * @returns {object} Breakdown of gross, taxes, and net
   */
  calculate(hours, customRate = null) {
    const rate = customRate !== null && !isNaN(customRate) ? Number(customRate) : this.config.hourlyRate;
    const validHours = Math.max(0, Number(hours) || 0);

    const grossPay = validHours * rate;

    // Columbus City Tax: 2.5%
    const columbusTax = grossPay * this.config.columbusCityTaxRate;

    // FICA: Social Security (6.2%) + Medicare (1.45%) = 7.65%
    const ficaRate = this.config.isFicaExempt ? 0 : (this.config.socialSecurityRate + this.config.medicareRate);
    const socialSecurityTax = this.config.isFicaExempt ? 0 : (grossPay * this.config.socialSecurityRate);
    const medicareTax = this.config.isFicaExempt ? 0 : (grossPay * this.config.medicareRate);
    const ficaTax = socialSecurityTax + medicareTax;

    // Ohio State Tax
    const ohioTax = grossPay * this.config.ohioStateTaxRate;

    // Federal Income Tax
    const federalTax = grossPay * this.config.federalTaxRate;

    // Total tax deductions
    const totalTax = columbusTax + ficaTax + ohioTax + federalTax;
    const netPay = Math.max(0, grossPay - totalTax);

    const effectiveTaxRate = grossPay > 0 ? (totalTax / grossPay) * 100 : 0;
    const effectiveHourlyTakeHome = validHours > 0 ? (netPay / validHours) : 0;

    return {
      hours: validHours,
      hourlyRate: rate,
      grossPay: this.round(grossPay),
      taxes: {
        columbusCity: this.round(columbusTax),
        columbusRatePercent: this.config.columbusCityTaxRate * 100,
        socialSecurity: this.round(socialSecurityTax),
        medicare: this.round(medicareTax),
        ficaTotal: this.round(ficaTax),
        ficaRatePercent: ficaRate * 100,
        ohioState: this.round(ohioTax),
        ohioRatePercent: this.config.ohioStateTaxRate * 100,
        federal: this.round(federalTax),
        federalRatePercent: this.config.federalTaxRate * 100,
        totalTax: this.round(totalTax)
      },
      netPay: this.round(netPay),
      effectiveTaxRate: this.round(effectiveTaxRate, 1),
      effectiveHourlyTakeHome: this.round(effectiveHourlyTakeHome, 2)
    };
  }

  round(num, decimals = 2) {
    const factor = Math.pow(10, decimals);
    return Math.round((num + Number.EPSILON) * factor) / factor;
  }

  formatCurrency(num) {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(num || 0);
  }

  formatHours(num) {
    return (Number(num) || 0).toFixed(2) + " hrs";
  }
}

// Global instance
window.taxEngine = new TaxEngine();
