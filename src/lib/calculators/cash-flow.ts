/**
 * Pure cash flow calculation functions.
 * No API calls — all client-side math.
 */

export interface CashFlowInputs {
  // Property
  purchasePrice: number
  monthlyRent: number
  repairCosts: number

  // Operating Expenses (as % of rent)
  vacancyRate: number // e.g. 8
  managementFee: number // e.g. 10
  maintenanceReserve: number // e.g. 5
  capexReserve: number // e.g. 5
  insuranceAnnual: number // e.g. 1800
  taxesAnnual: number // e.g. 2400

  // Financing
  downPaymentPercent: number // e.g. 20
  interestRate: number // e.g. 7.5
  loanTermYears: number // e.g. 30
  closingCostsPercent: number // e.g. 3
}

export interface CashFlowResults {
  // Income
  grossMonthlyIncome: number
  grossAnnualIncome: number
  effectiveMonthlyIncome: number
  effectiveAnnualIncome: number

  // Expenses
  vacancyLossMonthly: number
  managementFeeMonthly: number
  maintenanceMonthly: number
  capexMonthly: number
  insuranceMonthly: number
  taxesMonthly: number
  totalOperatingExpensesMonthly: number
  totalOperatingExpensesAnnual: number

  // Financing
  loanAmount: number
  downPayment: number
  closingCosts: number
  totalCashInvested: number
  monthlyMortgagePayment: number

  // Returns
  noi: number // Net Operating Income (annual)
  monthlyPreDebtCashFlow: number
  annualPreDebtCashFlow: number
  monthlyCashFlow: number
  annualCashFlow: number
  capRate: number // NOI / Purchase Price
  cashOnCash: number // Annual Cash Flow / Total Cash Invested
  dscr: number // NOI / Annual Debt Service
  grm: number // Purchase Price / Annual Gross Rent
  totalROIYear1: number // (Cash Flow + Equity Buildup + Appreciation) / Investment

  // Equity
  year1PrincipalPaydown: number
  equityAfterRepairs: number
}

/**
 * Calculate monthly mortgage payment (P&I).
 */
export function calculateMortgage(
  loanAmount: number,
  annualRate: number,
  termYears: number
): number {
  if (loanAmount <= 0 || annualRate <= 0 || termYears <= 0) return 0

  const monthlyRate = annualRate / 100 / 12
  const numPayments = termYears * 12

  const payment =
    (loanAmount * (monthlyRate * Math.pow(1 + monthlyRate, numPayments))) /
    (Math.pow(1 + monthlyRate, numPayments) - 1)

  return Math.round(payment * 100) / 100
}

/**
 * Calculate first year principal paydown.
 */
export function calculateYear1PrincipalPaydown(
  loanAmount: number,
  annualRate: number,
  termYears: number
): number {
  if (loanAmount <= 0 || annualRate <= 0 || termYears <= 0) return 0

  const monthlyRate = annualRate / 100 / 12
  const monthlyPayment = calculateMortgage(loanAmount, annualRate, termYears)

  let balance = loanAmount
  let totalPrincipal = 0

  for (let month = 0; month < 12; month++) {
    const interestPayment = balance * monthlyRate
    const principalPayment = monthlyPayment - interestPayment
    totalPrincipal += principalPayment
    balance -= principalPayment
  }

  return Math.round(totalPrincipal)
}

/**
 * Calculate Net Operating Income.
 */
export function calculateNOI(
  grossAnnualIncome: number,
  totalOperatingExpensesAnnual: number
): number {
  return grossAnnualIncome - totalOperatingExpensesAnnual
}

/**
 * Calculate Cap Rate (%).
 */
export function calculateCapRate(noi: number, purchasePrice: number): number {
  if (purchasePrice <= 0) return 0
  return (noi / purchasePrice) * 100
}

/**
 * Calculate Cash-on-Cash Return (%).
 */
export function calculateCashOnCash(
  annualCashFlow: number,
  totalCashInvested: number
): number {
  if (totalCashInvested <= 0) return 0
  return (annualCashFlow / totalCashInvested) * 100
}

/**
 * Calculate Debt Service Coverage Ratio.
 */
export function calculateDSCR(noi: number, annualDebtService: number): number {
  if (annualDebtService <= 0) return 0
  return noi / annualDebtService
}

/**
 * Calculate Gross Rent Multiplier.
 */
export function calculateGRM(
  purchasePrice: number,
  grossAnnualRent: number
): number {
  if (grossAnnualRent <= 0) return 0
  return purchasePrice / grossAnnualRent
}

/**
 * Full cash flow calculation from inputs.
 */
export function calculateFullCashFlow(inputs: CashFlowInputs): CashFlowResults {
  const {
    purchasePrice,
    monthlyRent,
    repairCosts,
    vacancyRate,
    managementFee,
    maintenanceReserve,
    capexReserve,
    insuranceAnnual,
    taxesAnnual,
    downPaymentPercent,
    interestRate,
    loanTermYears,
    closingCostsPercent,
  } = inputs

  // Income
  const grossMonthlyIncome = monthlyRent
  const grossAnnualIncome = monthlyRent * 12
  const vacancyLossMonthly = monthlyRent * (vacancyRate / 100)
  const effectiveMonthlyIncome = monthlyRent - vacancyLossMonthly
  const effectiveAnnualIncome = effectiveMonthlyIncome * 12

  // Operating Expenses
  const managementFeeMonthly = effectiveMonthlyIncome * (managementFee / 100)
  const maintenanceMonthly = effectiveMonthlyIncome * (maintenanceReserve / 100)
  const capexMonthly = effectiveMonthlyIncome * (capexReserve / 100)
  const insuranceMonthly = insuranceAnnual / 12
  const taxesMonthly = taxesAnnual / 12

  const totalOperatingExpensesMonthly =
    vacancyLossMonthly +
    managementFeeMonthly +
    maintenanceMonthly +
    capexMonthly +
    insuranceMonthly +
    taxesMonthly

  const totalOperatingExpensesAnnual = totalOperatingExpensesMonthly * 12

  // NOI
  const noi = calculateNOI(grossAnnualIncome, totalOperatingExpensesAnnual)

  // Financing
  const downPayment = purchasePrice * (downPaymentPercent / 100)
  const loanAmount = purchasePrice - downPayment
  const closingCosts = purchasePrice * (closingCostsPercent / 100)
  const totalCashInvested = downPayment + closingCosts + repairCosts

  const monthlyMortgagePayment = calculateMortgage(loanAmount, interestRate, loanTermYears)
  const annualDebtService = monthlyMortgagePayment * 12

  // Cash Flow
  const monthlyPreDebtCashFlow = effectiveMonthlyIncome - totalOperatingExpensesMonthly + vacancyLossMonthly
  const annualPreDebtCashFlow = monthlyPreDebtCashFlow * 12
  const monthlyCashFlow = effectiveMonthlyIncome - totalOperatingExpensesMonthly + vacancyLossMonthly - monthlyMortgagePayment
  const annualCashFlow = monthlyCashFlow * 12

  // Correct: NOI - debt service = cash flow
  const actualMonthlyCashFlow = noi / 12 - monthlyMortgagePayment
  const actualAnnualCashFlow = noi - annualDebtService

  // Return metrics
  const capRate = calculateCapRate(noi, purchasePrice)
  const cashOnCash = calculateCashOnCash(actualAnnualCashFlow, totalCashInvested)
  const dscr = calculateDSCR(noi, annualDebtService)
  const grm = calculateGRM(purchasePrice, grossAnnualIncome)

  // Equity
  const year1PrincipalPaydown = calculateYear1PrincipalPaydown(loanAmount, interestRate, loanTermYears)
  const equityAfterRepairs = repairCosts > 0 ? repairCosts * 0.5 : 0 // Assume 50% of repairs add equity

  // Total ROI Year 1
  const totalROIYear1 =
    totalCashInvested > 0
      ? ((actualAnnualCashFlow + year1PrincipalPaydown + equityAfterRepairs) / totalCashInvested) * 100
      : 0

  return {
    grossMonthlyIncome,
    grossAnnualIncome,
    effectiveMonthlyIncome,
    effectiveAnnualIncome,
    vacancyLossMonthly,
    managementFeeMonthly,
    maintenanceMonthly,
    capexMonthly,
    insuranceMonthly,
    taxesMonthly,
    totalOperatingExpensesMonthly,
    totalOperatingExpensesAnnual,
    loanAmount,
    downPayment,
    closingCosts,
    totalCashInvested,
    monthlyMortgagePayment,
    noi,
    monthlyPreDebtCashFlow: Math.round(noi / 12),
    annualPreDebtCashFlow: noi,
    monthlyCashFlow: Math.round(actualMonthlyCashFlow),
    annualCashFlow: Math.round(actualAnnualCashFlow),
    capRate: Math.round(capRate * 100) / 100,
    cashOnCash: Math.round(cashOnCash * 100) / 100,
    dscr: Math.round(dscr * 100) / 100,
    grm: Math.round(grm * 10) / 10,
    totalROIYear1: Math.round(totalROIYear1 * 100) / 100,
    year1PrincipalPaydown,
    equityAfterRepairs,
  }
}

/**
 * Default inputs from analysis data.
 */
export function getDefaultInputs(
  purchasePrice: number,
  monthlyRent: number,
  repairEstimate: number,
  settings?: {
    vacancyRate?: number
    managementFee?: number
    maintenanceReserve?: number
    capexReserve?: number
    insuranceAnnual?: number
    downPaymentPercent?: number
    interestRate?: number
    loanTermYears?: number
    closingCostsPercent?: number
  }
): CashFlowInputs {
  return {
    purchasePrice,
    monthlyRent,
    repairCosts: repairEstimate,
    vacancyRate: settings?.vacancyRate ?? 8,
    managementFee: settings?.managementFee ?? 10,
    maintenanceReserve: settings?.maintenanceReserve ?? 5,
    capexReserve: settings?.capexReserve ?? 5,
    insuranceAnnual: settings?.insuranceAnnual ?? 1800,
    taxesAnnual: Math.round(purchasePrice * 0.012), // Default 1.2% of purchase price
    downPaymentPercent: settings?.downPaymentPercent ?? 20,
    interestRate: settings?.interestRate ?? 7.5,
    loanTermYears: settings?.loanTermYears ?? 30,
    closingCostsPercent: settings?.closingCostsPercent ?? 3,
  }
}
