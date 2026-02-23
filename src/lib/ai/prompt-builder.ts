/**
 * Builds the comprehensive AI analysis prompt from all available data sources.
 * This is the core of the enhanced deal analysis system.
 */

import type { Property, RentalComp, SoldComp, AnalysisSettings } from '@/types/schema'
import type { NormalizedPropertyData } from '@/lib/property/data-utils'
import { summarizeConversation, summarizeTranscripts, summarizeNotes } from './token-utils'

export interface AnalysisPromptData {
  property: Property
  normalizedData: NormalizedPropertyData | null
  soldComps: SoldComp[]
  rentalComps: RentalComp[]
  callTranscripts: Array<{ transcript: string; created_at: string; duration?: number | null }>
  smsMessages: Array<{ body: string; direction: string; created_at: string }>
  notes: Array<{ content: string; created_at: string }>
  settings: AnalysisSettings
  visionAssessments?: Array<{
    type: 'subject' | 'comp'
    address?: string
    summary: string
  }>
}

export function buildAnalysisPrompt(data: AnalysisPromptData): string {
  const { property, normalizedData, soldComps, rentalComps, callTranscripts, smsMessages, notes, settings, visionAssessments } = data

  const sections: string[] = []
  const dataSources: string[] = ['property_data']

  // ─── SUBJECT PROPERTY ───
  sections.push(`== SUBJECT PROPERTY ==
Address: ${property.address}, ${property.city || ''}, ${property.state || ''} ${property.zip || ''}
Listed/Assessed Price: ${property.list_price ? `$${property.list_price.toLocaleString()}` : 'Unknown'}
Bedrooms: ${property.bedrooms || 'Unknown'}
Bathrooms: ${property.bathrooms || 'Unknown'}
Square Feet: ${property.sqft || 'Unknown'}
Year Built: ${property.year_built || 'Unknown'}
Lot Size: ${property.lot_size ? `${property.lot_size.toLocaleString()} sqft` : 'Unknown'}
Property Type: ${property.property_type || 'Unknown'}`)

  // ─── DEEP PROPERTY DATA ───
  if (normalizedData) {
    dataSources.push('realestate_api_data')
    const deepData: string[] = []

    // Financial
    if (normalizedData.estimatedValue) deepData.push(`Estimated Value: $${Number(normalizedData.estimatedValue).toLocaleString()}`)
    if (normalizedData.estimatedEquity) deepData.push(`Estimated Equity: $${Number(normalizedData.estimatedEquity).toLocaleString()}`)
    if (normalizedData.equityPercent) deepData.push(`Equity Percent: ${normalizedData.equityPercent}%`)
    if (normalizedData.mortgageAmount) deepData.push(`Mortgage Balance: $${Number(normalizedData.mortgageAmount).toLocaleString()}`)
    if (normalizedData.mortgageRate) deepData.push(`Mortgage Rate: ${normalizedData.mortgageRate}%`)
    if (normalizedData.mortgageLoanType) deepData.push(`Loan Type: ${normalizedData.mortgageLoanType}`)
    if (normalizedData.mortgageTerm) deepData.push(`Loan Term: ${normalizedData.mortgageTerm} months`)
    if (normalizedData.mortgageAssumable) deepData.push(`Assumable Mortgage: YES`)
    if (normalizedData.openMortgageBalance) deepData.push(`Open Mortgage Balance: $${Number(normalizedData.openMortgageBalance).toLocaleString()}`)

    // Tax
    if (normalizedData.taxAmount) deepData.push(`Annual Taxes: $${Number(normalizedData.taxAmount).toLocaleString()}`)
    if (normalizedData.assessedTotal) deepData.push(`Assessed Value: $${Number(normalizedData.assessedTotal).toLocaleString()}`)
    if (normalizedData.marketTotal) deepData.push(`Market Value (Tax): $${Number(normalizedData.marketTotal).toLocaleString()}`)
    if (normalizedData.delinquentYear) deepData.push(`Tax Delinquent Year: ${normalizedData.delinquentYear}`)

    // Last Sale
    if (normalizedData.lastSalePrice) deepData.push(`Last Sale Price: $${Number(normalizedData.lastSalePrice).toLocaleString()}`)
    if (normalizedData.lastSaleDate) deepData.push(`Last Sale Date: ${normalizedData.lastSaleDate}`)

    // Building condition
    if (normalizedData.condition) deepData.push(`Building Condition: ${normalizedData.condition}`)
    if (normalizedData.constructionType) deepData.push(`Construction: ${normalizedData.constructionType}`)
    if (normalizedData.heatingType) deepData.push(`Heating: ${normalizedData.heatingType}`)
    if (normalizedData.coolingType) deepData.push(`Cooling: ${normalizedData.coolingType}`)
    if (normalizedData.garageType) deepData.push(`Garage: ${normalizedData.garageType}`)
    if (normalizedData.basementType) deepData.push(`Basement: ${normalizedData.basementType}`)
    if (normalizedData.pool) deepData.push(`Pool: Yes`)
    if (normalizedData.fireplace) deepData.push(`Fireplace: Yes (${normalizedData.fireplaces || 1})`)

    // Flags
    const flags: string[] = []
    if (normalizedData.vacant) flags.push('VACANT')
    if (normalizedData.preForeclosure) flags.push('PRE-FORECLOSURE')
    if (normalizedData.taxLien) flags.push('TAX LIEN')
    if (normalizedData.bankOwned) flags.push('BANK OWNED (REO)')
    if (normalizedData.freeClear) flags.push('FREE & CLEAR')
    if (normalizedData.highEquity) flags.push('HIGH EQUITY')
    if (normalizedData.absenteeOwner) flags.push('ABSENTEE OWNER')
    if (normalizedData.corporateOwned) flags.push('CORPORATE OWNED')
    if (normalizedData.inherited) flags.push('INHERITED')
    if (normalizedData.cashSale) flags.push('LAST SALE WAS CASH')
    if (normalizedData.adjustableRate) flags.push('ADJUSTABLE RATE MORTGAGE')
    if (normalizedData.floodZone) flags.push(`FLOOD ZONE: ${normalizedData.floodZoneType || 'Yes'}`)
    if (normalizedData.deedInLieu) flags.push('DEED IN LIEU')
    if (flags.length) deepData.push(`Investment Flags: ${flags.join(', ')}`)

    // Demographics
    if (normalizedData.medianIncome) deepData.push(`Area Median Income: $${Number(normalizedData.medianIncome).toLocaleString()}`)
    if (normalizedData.suggestedRent) deepData.push(`HUD Suggested Rent: $${Number(normalizedData.suggestedRent).toLocaleString()}/mo`)
    if (normalizedData.neighborhood) deepData.push(`Neighborhood: ${normalizedData.neighborhood}`)

    // Sale History
    if (normalizedData.saleHistory && Array.isArray(normalizedData.saleHistory) && normalizedData.saleHistory.length > 0) {
      const saleLines = normalizedData.saleHistory.slice(0, 5).map((s: any) =>
        `  ${s.saleDate || s.recordingDate || 'Unknown date'}: $${Number(s.saleAmount || 0).toLocaleString()} (${s.transactionType || s.documentType || 'Sale'})`
      )
      deepData.push(`Sale History:\n${saleLines.join('\n')}`)
    }

    // Foreclosure info
    if (normalizedData.foreclosureInfo && Array.isArray(normalizedData.foreclosureInfo) && normalizedData.foreclosureInfo.length > 0) {
      const fcLines = normalizedData.foreclosureInfo.map((f: any) =>
        `  ${f.recordingDate || 'Unknown'}: ${f.documentType || 'Filing'} - $${Number(f.judgmentAmount || f.originalLoanAmount || 0).toLocaleString()}`
      )
      deepData.push(`Foreclosure History:\n${fcLines.join('\n')}`)
    }

    if (deepData.length) {
      sections.push(`== PROPERTY DEEP DATA ==\n${deepData.join('\n')}`)
    }
  }

  // ─── SOLD COMPARABLES ───
  if (soldComps.length > 0) {
    dataSources.push('sold_comps')
    const compLines = soldComps.map((c, i) => {
      const ppsf = c.sqft ? `$${Math.round(c.price / c.sqft)}/sqft` : ''
      return `${i + 1}. ${c.address} — $${c.price.toLocaleString()} | ${c.bedrooms}bd/${c.bathrooms}ba | ${c.sqft?.toLocaleString() || '?'} sqft | ${ppsf} | ${c.distance?.toFixed(1) || '?'} mi | Sold ${c.soldDate || 'Unknown'}`
    })
    const avgPrice = Math.round(soldComps.reduce((s, c) => s + c.price, 0) / soldComps.length)
    const avgPpsf = soldComps.filter(c => c.sqft).length > 0
      ? Math.round(soldComps.filter(c => c.sqft).reduce((s, c) => s + c.price / c.sqft, 0) / soldComps.filter(c => c.sqft).length)
      : null

    sections.push(`== SOLD COMPARABLES (${soldComps.length} comps) ==
${compLines.join('\n')}
Average Sold Price: $${avgPrice.toLocaleString()}${avgPpsf ? ` | Average $/sqft: $${avgPpsf}` : ''}`)
  }

  // ─── RENTAL COMPARABLES ───
  if (rentalComps.length > 0) {
    dataSources.push('rental_comps')
    const compLines = rentalComps.map((c, i) =>
      `${i + 1}. ${c.address} — $${c.rent.toLocaleString()}/mo | ${c.bedrooms}bd/${c.bathrooms}ba | ${c.sqft?.toLocaleString() || '?'} sqft | ${c.distance?.toFixed(1) || '?'} mi`
    )
    const avgRent = Math.round(rentalComps.reduce((s, c) => s + c.rent, 0) / rentalComps.length)

    // Add rental estimate if available
    let rentalEstLine = ''
    if (property.rental_data) {
      rentalEstLine = `\nRental Estimate: $${property.rental_data.rent}/mo (range: $${property.rental_data.rentRangeLow}-$${property.rental_data.rentRangeHigh})`
    }

    sections.push(`== RENTAL COMPARABLES (${rentalComps.length} comps) ==
${compLines.join('\n')}
Average Rent: $${avgRent.toLocaleString()}/mo${rentalEstLine}`)
  } else if (property.rental_data) {
    dataSources.push('rental_estimate')
    sections.push(`== RENTAL DATA ==
Estimated Rent: $${property.rental_data.rent}/mo (range: $${property.rental_data.rentRangeLow}-$${property.rental_data.rentRangeHigh})`)
  }

  // ─── VISION ASSESSMENTS (from Gemini) ───
  if (visionAssessments && visionAssessments.length > 0) {
    const subjectVision = visionAssessments.filter(v => v.type === 'subject')
    const compVision = visionAssessments.filter(v => v.type === 'comp')

    if (subjectVision.length > 0) {
      dataSources.push('property_photos')
      sections.push(`== PROPERTY PHOTO ANALYSIS (AI Vision) ==\n${subjectVision.map(v => v.summary).join('\n')}`)
    }

    if (compVision.length > 0) {
      dataSources.push('comp_images')
      sections.push(`== COMP CONDITION ANALYSIS (AI Vision) ==\n${compVision.map(v => `${v.address}: ${v.summary}`).join('\n')}`)
    }
  }

  // ─── CALL TRANSCRIPTS ───
  if (callTranscripts.length > 0) {
    dataSources.push('call_transcripts')
    const condensed = summarizeTranscripts(callTranscripts, 1500)
    sections.push(`== CALL TRANSCRIPTS (${callTranscripts.length} calls) ==\n${condensed}`)
  }

  // ─── SMS MESSAGES ───
  if (smsMessages.length > 0) {
    dataSources.push('sms_messages')
    const condensed = summarizeConversation(smsMessages, 800)
    sections.push(`== SMS CONVERSATION (${smsMessages.length} messages) ==\n${condensed}`)
  }

  // ─── USER NOTES ───
  if (notes.length > 0) {
    dataSources.push('user_notes')
    const condensed = summarizeNotes(notes, 500)
    sections.push(`== USER NOTES (${notes.length} notes) ==\n${condensed}`)
  }

  // ─── USER ASSUMPTIONS ───
  sections.push(`== USER ASSUMPTIONS ==
MAO Rule: ${settings.mao_percentage}% of ARV minus repairs
Repair Buffer: ${settings.repair_buffer_percentage}%
Holding Period: ${settings.holding_months} months at $${settings.holding_cost_monthly}/month
Assignment Fee Target: $${settings.assignment_fee_target.toLocaleString()}
Vacancy Rate: ${settings.vacancy_rate}%
Property Management: ${settings.management_fee}%
Maintenance Reserve: ${settings.maintenance_reserve}%
CapEx Reserve: ${settings.capex_reserve}%
Insurance (Annual): $${settings.insurance_annual.toLocaleString()}
Down Payment: ${settings.down_payment_percentage}%
Interest Rate: ${settings.interest_rate}%
Loan Term: ${settings.loan_term_years} years
Closing Costs: ${settings.closing_costs_percentage}%
Target Cap Rate: ${settings.target_cap_rate}%
Target Cash-on-Cash: ${settings.target_cash_on_cash}%`)

  // ─── INSTRUCTIONS ───
  const instructions = `== INSTRUCTIONS ==
You are an expert real estate wholesale deal analyst. Analyze this property using ALL the data provided above.

CRITICAL RULES:
- Use the user's MAO percentage (${settings.mao_percentage}%) NOT a hardcoded 70%
- Factor in the repair buffer of ${settings.repair_buffer_percentage}% on top of repair estimates
- Calculate holding costs: ${settings.holding_months} months * $${settings.holding_cost_monthly}/month
- For rental metrics, use the user's vacancy_rate (${settings.vacancy_rate}%), management_fee (${settings.management_fee}%), etc.
- Cite SPECIFIC comp addresses in your ARV reasoning (e.g., "Based on 123 Oak St selling for $285K...")
- Extract seller motivation signals from call transcripts, SMS conversations, and notes
- Provide negotiation insights based on property data (equity position, mortgage status, distress signals, motivation)
- If property photos were analyzed, incorporate the vision-based repair assessment
- If comp images were analyzed, reference their condition when justifying ARV
- Be CONSERVATIVE on repair estimates — better to overestimate than underestimate
- Only flag repairs you can reasonably infer from the data — mark "needs inspection" for unknowns

Respond with ONLY valid JSON (no markdown) using this exact structure:
{
  "arv": <number>,
  "arv_reasoning": "<string citing specific comps>",
  "rental_arv": <number or null>,
  "rental_arv_reasoning": "<string or null>",
  "repair_estimate": <number - total including buffer>,
  "repair_breakdown": { "<category>": <cost> },
  "max_allowable_offer": <number - ARV * ${settings.mao_percentage / 100} - repairs>,
  "holding_costs": <number - ${settings.holding_months} * ${settings.holding_cost_monthly}>,
  "assignment_fee": <number - recommended based on deal quality>,
  "total_investment": <number - purchase + repairs + holding + closing>,
  "estimated_profit": <number - ARV - total_investment>,
  "deal_grade": "<A|B|C|D|F>",
  "risk_factors": ["<string>"],
  "recommendation": "<string - 2-3 sentence recommendation>",
  "confidence": "<low|medium|high>",
  "data_sources_used": ${JSON.stringify(dataSources)},
  "seller_motivation_signals": ["<string from transcripts/sms/notes>"],
  "negotiation_insights": ["<string based on equity, mortgage, distress>"],
  "noi": <number or null - if rental data available>,
  "cap_rate": <number or null - NOI / purchase price * 100>,
  "cash_on_cash": <number or null>,
  "monthly_cash_flow": <number or null>,
  "annual_cash_flow": <number or null>,
  "grm": <number or null - price / annual rent>,
  "dscr": <number or null - NOI / annual debt service>,
  "assumptions_used": {
    "mao_percentage": ${settings.mao_percentage},
    "repair_buffer_percentage": ${settings.repair_buffer_percentage},
    "holding_months": ${settings.holding_months},
    "holding_cost_monthly": ${settings.holding_cost_monthly},
    "vacancy_rate": ${settings.vacancy_rate},
    "management_fee": ${settings.management_fee},
    "maintenance_reserve": ${settings.maintenance_reserve},
    "capex_reserve": ${settings.capex_reserve},
    "insurance_annual": ${settings.insurance_annual},
    "down_payment_percentage": ${settings.down_payment_percentage},
    "interest_rate": ${settings.interest_rate},
    "loan_term_years": ${settings.loan_term_years},
    "closing_costs_percentage": ${settings.closing_costs_percentage}
  }
}`

  return `${sections.join('\n\n')}\n\n${instructions}`
}
