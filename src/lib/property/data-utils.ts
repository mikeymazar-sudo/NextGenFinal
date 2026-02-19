import { format } from 'date-fns'

// Normalize raw data from either ATTOM or RealEstateAPI v2 format
export function normalizePropertyData(raw: Record<string, any>) {
  const isAttom = !!raw?.property
  const isReApi = !!raw?.data

  if (isAttom) {
    const prop = raw.property?.[0] || {}
    const assessment = prop.assessment || {}
    const tax = assessment.tax || {}
    const owner = assessment.owner || {}
    const market = assessment.market || {}
    const assessed = assessment.assessed || {}
    const mortgage = assessment.mortgage || {}
    const sale = prop.sale || {}
    const saleData = sale.saleAmountData || {}
    const building = prop.building || {}
    const bldgSize = building.size || {}
    const rooms = building.rooms || {}
    const parking = building.parking || {}
    const bldgSummary = building.summary || {}
    const interior = building.interior || {}
    const construction = building.construction || {}
    const lot = prop.lot || {}
    const area = prop.area || {}
    const summary = prop.summary || {}
    const location = prop.location || {}
    const utilities = prop.utilities || {}
    const identifier = prop.identifier || {}

    return {
      ownerName: owner.owner1?.fullName || null,
      owner2Name: owner.owner2?.fullName || null,
      corporateOwned: owner.corporateIndicator === 'Y',
      absenteeOwner: summary.absenteeInd?.includes('ABSENTEE') || owner.absenteeOwnerStatus === 'A',
      ownerOccupied: summary.absenteeInd?.includes('OWNER OCCUPIED') || owner.absenteeOwnerStatus === 'O',
      mailingAddress: owner.mailingAddressOneLine || null,

      taxAmount: tax.taxAmt,
      taxYear: tax.taxYear,
      taxPerSqft: tax.taxPerSizeUnit,
      assessedTotal: assessed.assdTtlValue,
      assessedLand: assessed.assdLandValue,
      assessedImprovement: assessed.assdImprValue,
      marketTotal: market.mktTtlValue,
      marketLand: market.mktLandValue,
      marketImprovement: market.mktImprValue,
      delinquentYear: assessment.delinquentyear,
      improvementPercent: assessment.improvementPercent,

      salePrice: saleData.saleAmt,
      saleDate: saleData.saleRecDate || sale.saleSearchDate,
      saleType: saleData.saleTransType,
      saleDocType: saleData.saleDocType,
      saleDocNum: saleData.saleDocNum,

      mortgageAmount: mortgage.FirstConcurrent?.amount,
      mortgageLender: mortgage.FirstConcurrent?.lenderLastName,
      mortgageDocNum: mortgage.FirstConcurrent?.trustDeedDocumentNumber,
      mortgageRate: null,
      mortgageDate: null,
      mortgageLoanType: null,
      mortgageTerm: null,
      mortgageAssumable: false,
      mortgage2Amount: mortgage.SecondConcurrent?.amount,
      mortgage2Lender: mortgage.SecondConcurrent?.lenderLastName,

      estimatedEquity: market.mktTtlValue && mortgage.FirstConcurrent?.amount
        ? market.mktTtlValue - (mortgage.FirstConcurrent?.amount || 0)
        : null,
      equityPercent: market.mktTtlValue && mortgage.FirstConcurrent?.amount
        ? Math.round(((market.mktTtlValue - (mortgage.FirstConcurrent?.amount || 0)) / market.mktTtlValue) * 100)
        : null,
      estimatedValue: market.mktTtlValue || null,
      estimatedMortgageBalance: mortgage.FirstConcurrent?.amount ? String(mortgage.FirstConcurrent.amount) : null,
      estimatedMortgagePayment: null,
      openMortgageBalance: mortgage.FirstConcurrent?.amount || null,

      livingSqft: bldgSize.livingSize,
      grossSqft: bldgSize.grossSize,
      groundFloorSqft: bldgSize.groundFloorSize,
      stories: bldgSummary.levels,
      unitsCount: bldgSummary.unitsCount,
      view: bldgSummary.view !== 'VIEW - NONE' ? bldgSummary.view : null,
      beds: rooms.beds,
      bathsFull: rooms.bathsFull,
      bathsTotal: rooms.bathsTotal,
      parkingSize: parking.prkgSize,
      parkingSpaces: null,
      floorType: interior.floors,
      condition: construction.condition,
      frameType: construction.frameType,
      foundationType: construction.foundationType,
      constructionType: construction.constructionType,
      wallType: utilities.wallType,
      coolingType: utilities.coolingType,
      heatingType: null,
      heatingFuelType: null,
      garageType: null,
      garageSqft: null,
      basementType: null,
      basementSqft: null,
      fireplace: null,
      fireplaces: null,
      pool: null,
      poolArea: null,
      airConditioning: null,
      yearBuilt: summary.yearBuilt || prop.summary?.yearBuilt,

      lotSqft: lot.lotSize2,
      lotAcres: lot.lotSize1,
      lotNum: lot.lotNum,
      lotFrontage: lot.frontage,
      lotDepthFeet: null,
      lotWidthFeet: null,
      zoningType: lot.zoningType,
      subdivision: area.subdName,
      county: area.countrySecSubd,
      censusTract: area.censusTractIdent,

      legalDescription: summary.legal1,
      apn: identifier.apn,
      fips: identifier.fips,
      attomId: identifier.attomId,
      propertyType: summary.propertyType || summary.propType,
      propertyClass: lot?.propertyClass || null,
      landUse: summary.propLandUse,
      propertyUse: null,

      latitude: location.latitude,
      longitude: location.longitude,

      // Flags
      vacant: null,
      preForeclosure: null,
      taxLien: null,
      bankOwned: null,
      deedInLieu: null,
      cashBuyer: null,
      cashSale: null,
      inherited: null,
      quitClaim: null,
      adjustableRate: null,
      mobileHome: null,
      investorBuyer: null,
      freeClear: null,
      highEquity: null,
      floodZone: null,
      floodZoneType: null,
      assumable: null,

      saleHistory: null,
      mortgageHistory: null,
      foreclosureInfo: null,

      demographics: null,
      fmrEfficiency: null,
      fmrOneBedroom: null,
      fmrTwoBedroom: null,
      fmrThreeBedroom: null,
      fmrFourBedroom: null,
      medianIncome: null,
      suggestedRent: null,
      hudAreaName: null,

      lastSaleDate: saleData.saleRecDate || sale.saleSearchDate || null,
      lastSalePrice: saleData.saleAmt || null,
      lastSaleBuyer: null,
      lastSaleSeller: null,
      lastSaleDocType: saleData.saleDocType || null,
      lastSaleMethod: null,

      neighborhood: null,
    }
  }

  if (isReApi) {
    const prop = raw.data?.[0] || raw.data || {}
    const ownerInfo = prop.ownerInfo || {}
    const propertyInfo = prop.propertyInfo || {}
    const lotInfo = prop.lotInfo || {}
    const taxInfo = prop.taxInfo || {}
    const demographics = prop.demographics || {}
    const lastSale = prop.lastSale || {}

    return {
      ownerName: ownerInfo.owner1FullName || null,
      owner2Name: ownerInfo.owner2FullName || null,
      corporateOwned: ownerInfo.corporateOwned || false,
      absenteeOwner: ownerInfo.absenteeOwner || false,
      ownerOccupied: ownerInfo.ownerOccupied || false,
      mailingAddress: ownerInfo.mailAddress?.label || ownerInfo.mailAddress?.address || null,

      taxAmount: taxInfo.taxAmount,
      taxYear: taxInfo.year || taxInfo.assessmentYear,
      taxPerSqft: null,
      assessedTotal: taxInfo.assessedValue,
      assessedLand: taxInfo.assessedLandValue,
      assessedImprovement: taxInfo.assessedImprovementValue,
      marketTotal: taxInfo.marketValue,
      marketLand: taxInfo.marketLandValue,
      marketImprovement: taxInfo.marketImprovementValue,
      delinquentYear: taxInfo.taxDelinquentYear,
      improvementPercent: null,

      salePrice: prop.lastSalePrice || lastSale.saleAmount,
      saleDate: prop.lastSaleDate || lastSale.saleDate || lastSale.recordingDate,
      saleType: lastSale.transactionType,
      saleDocType: lastSale.documentType,
      saleDocNum: lastSale.documentNumber,

      mortgageAmount: prop.currentMortgages?.[0]?.amount || prop.openMortgageBalance,
      mortgageLender: prop.currentMortgages?.[0]?.lenderName,
      mortgageDocNum: prop.currentMortgages?.[0]?.documentNumber,
      mortgageRate: prop.currentMortgages?.[0]?.interestRate,
      mortgageDate: prop.currentMortgages?.[0]?.recordingDate,
      mortgageLoanType: prop.currentMortgages?.[0]?.loanType,
      mortgageTerm: prop.currentMortgages?.[0]?.term,
      mortgageAssumable: prop.currentMortgages?.[0]?.assumable || false,
      mortgage2Amount: prop.currentMortgages?.[1]?.amount,
      mortgage2Lender: prop.currentMortgages?.[1]?.lenderName,

      estimatedEquity: prop.estimatedEquity || ownerInfo.equity,
      equityPercent: prop.equityPercent,
      estimatedValue: prop.estimatedValue || null,
      estimatedMortgageBalance: prop.estimatedMortgageBalance || null,
      estimatedMortgagePayment: prop.estimatedMortgagePayment || null,
      openMortgageBalance: prop.openMortgageBalance || null,

      livingSqft: propertyInfo.livingSquareFeet,
      grossSqft: propertyInfo.buildingSquareFeet,
      groundFloorSqft: null,
      stories: propertyInfo.stories,
      unitsCount: propertyInfo.unitsCount,
      view: null,
      beds: propertyInfo.bedrooms,
      bathsFull: propertyInfo.bathrooms,
      bathsTotal: (propertyInfo.bathrooms || 0) + (propertyInfo.partialBathrooms || 0),
      parkingSize: null,
      parkingSpaces: propertyInfo.parkingSpaces,
      floorType: null,
      condition: prop.buildingCondition || propertyInfo.buildingCondition,
      frameType: null,
      foundationType: null,
      constructionType: propertyInfo.construction,
      wallType: propertyInfo.interiorStructure,
      coolingType: propertyInfo.airConditioningType,
      heatingType: propertyInfo.heatingType,
      heatingFuelType: propertyInfo.heatingFuelType,
      garageType: propertyInfo.garageType,
      garageSqft: propertyInfo.garageSquareFeet,
      basementType: propertyInfo.basementType,
      basementSqft: propertyInfo.basementSquareFeet,
      fireplace: propertyInfo.fireplace,
      fireplaces: propertyInfo.fireplaces,
      pool: propertyInfo.pool,
      poolArea: propertyInfo.poolArea,
      airConditioning: propertyInfo.airConditioningType,
      yearBuilt: propertyInfo.yearBuilt,

      lotSqft: propertyInfo.lotSquareFeet || lotInfo.lotSquareFeet,
      lotAcres: lotInfo.lotAcres,
      lotNum: lotInfo.lotNumber,
      lotFrontage: null,
      lotDepthFeet: lotInfo.lotDepthFeet,
      lotWidthFeet: lotInfo.lotWidthFeet,
      zoningType: lotInfo.zoning,
      subdivision: lotInfo.subdivision,
      county: propertyInfo.address?.county || null,
      censusTract: lotInfo.censusTract,

      legalDescription: lotInfo.legalDescription,
      apn: lotInfo.apn,
      fips: propertyInfo.address?.fips || null,
      attomId: null,
      propertyType: prop.propertyType || propertyInfo.propertyType || lotInfo.propertyType,
      propertyClass: lotInfo.propertyClass,
      landUse: lotInfo.landUse,
      propertyUse: lotInfo.propertyUse || propertyInfo.propertyUse,

      latitude: propertyInfo.latitude,
      longitude: propertyInfo.longitude,

      // Flags
      vacant: prop.vacant || false,
      preForeclosure: prop.preForeclosure || false,
      taxLien: prop.taxLien || false,
      bankOwned: prop.bankOwned || false,
      deedInLieu: prop.deedInLieu || false,
      cashBuyer: prop.cashBuyer || false,
      cashSale: prop.cashSale || false,
      inherited: prop.inherited || false,
      quitClaim: prop.quitClaim || false,
      adjustableRate: prop.adjustableRate || false,
      mobileHome: prop.mobileHome || false,
      investorBuyer: prop.investorBuyer || false,
      freeClear: prop.freeClear || false,
      highEquity: prop.highEquity || false,
      floodZone: prop.floodZone || false,
      floodZoneType: prop.floodZoneType || null,
      assumable: prop.assumable || prop.currentMortgages?.[0]?.assumable || false,

      saleHistory: prop.saleHistory || null,
      mortgageHistory: prop.mortgageHistory || null,
      foreclosureInfo: prop.foreclosureInfo?.length > 0 ? prop.foreclosureInfo : null,

      // Demographics / FMR
      demographics: demographics || null,
      fmrEfficiency: demographics.fmrEfficiency || null,
      fmrOneBedroom: demographics.fmrOneBedroom || null,
      fmrTwoBedroom: demographics.fmrTwoBedroom || null,
      fmrThreeBedroom: demographics.fmrThreeBedroom || null,
      fmrFourBedroom: demographics.fmrFourBedroom || null,
      medianIncome: demographics.medianIncome || null,
      suggestedRent: demographics.suggestedRent || null,
      hudAreaName: demographics.hudAreaName || null,

      // Last sale details
      lastSaleDate: prop.lastSaleDate || lastSale.recordingDate || null,
      lastSalePrice: prop.lastSalePrice || lastSale.saleAmount || null,
      lastSaleBuyer: lastSale.buyerNames || null,
      lastSaleSeller: lastSale.sellerNames || null,
      lastSaleDocType: lastSale.documentType || null,
      lastSaleMethod: lastSale.purchaseMethod || null,

      neighborhood: prop.neighborhood?.name || null,
    }
  }

  return null
}

export type NormalizedPropertyData = NonNullable<ReturnType<typeof normalizePropertyData>>

// Formatting helpers
export function fmtCurrency(val: number | string | null | undefined): string {
  if (val === null || val === undefined || val === '' || val === 0 || val === '0') return '-'
  const num = typeof val === 'string' ? parseFloat(val) : val
  if (isNaN(num)) return '-'
  return `$${num.toLocaleString()}`
}

export function fmtDate(val: string | null | undefined): string {
  if (!val) return '-'
  try {
    return format(new Date(val), 'MM/dd/yyyy')
  } catch {
    return val
  }
}

export function display(val: any): string {
  if (val === null || val === undefined || val === '' || val === 0) return '-'
  if (typeof val === 'number') return val.toLocaleString()
  return String(val)
}
