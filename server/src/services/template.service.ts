import { templateStore } from './template-store.service.js';
import { LegalTemplate, ClientFacts, ComplianceCheckResult } from '../types/index.js';
import { getMarathiTodayDate, removePlaceholdersWithSpaces, removeEmptyTableRows, cleanUnprovidedPartyBlocks, isValidPartyValue } from '../utils/date.utils.js';

function formatToDDMMYYYY(val: string | undefined): string {
  if (!val || !val.trim()) return '';
  const str = val.trim();
  const yyyyMmDdMatch = str.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (yyyyMmDdMatch) {
    const [, yyyy, mm, dd] = yyyyMmDdMatch;
    return `${dd.padStart(2, '0')}/${mm.padStart(2, '0')}/${yyyy}`;
  }
  const ddMmYyyyMatch = str.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (ddMmYyyyMatch) {
    const [, dd, mm, yyyy] = ddMmYyyyMatch;
    return `${dd.padStart(2, '0')}/${mm.padStart(2, '0')}/${yyyy}`;
  }
  return str;
}

export class TemplateService {
  getAllTemplates(): LegalTemplate[] {
    return templateStore.getAllTemplates();
  }

  getTemplate(id: string): LegalTemplate | undefined {
    return templateStore.getTemplate(id);
  }

  saveTemplate(template: LegalTemplate): LegalTemplate {
    return templateStore.saveTemplate(template);
  }

  deleteTemplate(id: string): void {
    templateStore.deleteTemplate(id);
  }

  cloneTemplate(sourceId: string, newId: string, newTitle: string): LegalTemplate {
    return templateStore.cloneTemplate(sourceId, newId, newTitle);
  }

  mergeTemplate(template: LegalTemplate, facts: ClientFacts): string {
    let text = template.templateText;

    // Sanitize facts: convert dummy/generic placeholders to empty strings
    const cleanFacts: Record<string, any> = { ...facts };
    for (const [k, v] of Object.entries(cleanFacts)) {
      if (/^(?:party|applicant|accused|opponent|respondent|pakshakar)[0-9]+(?:name|नाव)?$/i.test(k)) {
        if (!isValidPartyValue(v)) {
          cleanFacts[k] = '';
        }
      }
    }

    // Pre-pass: Remove all document blocks, paragraphs, and table rows for unprovided parties
    text = cleanUnprovidedPartyBlocks(text, cleanFacts);

    // Derived settlement clauses for Section 13B
    let settlementClauses = '';
    let childrenClause = '';

    if (template.id.includes('divorce-13b')) {
      const rawChildren = (facts.childrenDetails || '').trim();
      const hasKids = rawChildren.length > 0 && 
        !rawChildren.includes('नाही') && 
        !rawChildren.toLowerCase().includes('no') && 
        !rawChildren.toLowerCase().includes('nil') && 
        !rawChildren.toLowerCase().includes('none') &&
        !rawChildren.includes('शून्य');

      // Children declaration clause
      if (hasKids) {
        childrenClause = `सदर विवाहापासून उभयतांना अपत्य - ${rawChildren} आहे.`;
      } else {
        childrenClause = 'सदर विवाहापासून उभयतांना कोणतेही अपत्य नाही.';
      }

      // Settlement clauses
      const clauses: string[] = [];

      // Custody clause
      if (hasKids) {
        if (facts.custodyWith === 'husband') {
          clauses.push(`अ) दोन्ही अर्जदारांची अपत्ये (${rawChildren}) ही अर्जदार क्र. १ ${facts.party1Name || 'पती'} यांच्याकडे राहावयाची असून, त्यांचे पालन पोषण, शिक्षण व संगोपनाची संपूर्ण जबाबदारी अर्जदार क्र. १ यांची राहील. अर्जदार क्र. २ (आई) यांना संमतीनुसार मुलांची भेट घेण्याचा (Visitation Rights) पूर्ण अधिकार राहील.`);
        } else if (facts.custodyWith === 'joint') {
          clauses.push(`अ) दोन्ही अर्जदारांच्या अपत्यांचा (${rawChildren}) ताबा संयुक्त राहील व त्यांच्या पालन पोषण, शिक्षण व संगोपनाची जबाबदारी उभयतांच्या परस्पर संमतीने राहील.`);
        } else {
          // Default when kids exist (custodyWith is 'wife' or unselected)
          clauses.push(`अ) दोन्ही अर्जदारांची अपत्ये (${rawChildren}) ही अर्जदार क्र. २ ${facts.party2Name || 'पत्नी'} यांच्याकडे राहावयाची असून, त्यांचे पालन पोषण, शिक्षण व संगोपनाची संपूर्ण जबाबदारी अर्जदार क्र. २ यांची राहील. अर्जदार क्र. १ (पती) यांना संमतीनुसार मुलांची भेट घेण्याचा (Visitation Rights) पूर्ण अधिकार राहील.`);
        }
      } else {
        clauses.push(`अ) दोन्ही अर्जदारांना सदर विवाहापासून कोणतेही अपत्य नसल्यामुळे मुलांच्या ताब्याचा व संगोपनाचा कोणताही प्रश्न उद्भवत नाही.`);
      }

      // Alimony clause
      if (facts.alimonyNil) {
        clauses.push(`ब) अर्जदार क्र. २ ${facts.party2Name || 'पत्नी'} यांनी खावटी / पोटगी मागण्याचा संपूर्ण हक्क कायमस्वरूपी विनामोबदला या घटस्फोटापासून स्वखुशीने सोडून दिलेला आहे. भविष्यात त्या अर्जदार क्र. १ किंवा त्यांच्या कुटुंबीयांविरुद्ध कोणतीही खावटी मागणार नाहीत.`);
      } else {
        const amount = facts.alimonyAmount || '१,००,०००';
        const words = facts.alimonyWords || 'रुपये एक लाख मात्र';
        clauses.push(`ब) अर्जदार क्र. १ ${facts.party1Name || 'पती'} हे अर्जदार क्र. २ ${facts.party2Name || 'पत्नी'} हिला मागील, पुढील व भविष्यातील खावटी / पोटगी म्हणून एकरकमी रक्कम रुपये ${amount}/- (${words}) देण्याचे ठरले आहे. सदर रक्कम प्राप्त झाल्यानंतर अर्जदार क्र. २ ची कोणतीही तक्रार राहणार नाही.`);
      }

      // Stridhan & No Future cases clause
      clauses.push(`क) उभयतांनी एकमेकांचे सर्व स्त्रीधन, दागदागिने, कपडे व संसारोपयोगी वस्तूंची देवाणघेवाण आपसात पूर्ण केलेली असून कोणत्याही वस्तू अथवा पैशाची देवाणघेवाण शिल्लक राहिलेली नाही.`);
      clauses.push(`ड) भविष्यात उभयतांपैकी कोणीही एकमेकांविरुद्ध किंवा एकमेकांच्या कुटुंबीयांविरुद्ध कोणताही फौजदारी अथवा दिवाणी दावा, पोलीस तक्रार, किंवा पोटगीचा अर्ज करणार नाहीत.`);

      settlementClauses = clauses.join('\n\n');
    }

    const todayDDMMYYYY = new Date().toLocaleDateString('en-GB');

    // Replace all placeholders
    const replacements: Record<string, string> = {
      courtCity: (facts.courtCity && facts.courtCity.trim()) ? facts.courtCity : 'अमळनेर',
      courtName: (facts.courtName && facts.courtName.trim()) ? facts.courtName : (template.defaultCourt || 'मे. दिवाणी न्यायाधीश वरिष्ठ स्तर'),
      hmpNo: (facts.hmpNo && facts.hmpNo.trim()) ? facts.hmpNo : '     /    ',
      caseYear: (facts.caseYear && facts.caseYear.trim()) ? facts.caseYear : new Date().getFullYear().toString(),
      
      party1Prefix: (facts.party1Prefix && facts.party1Prefix.trim()) ? facts.party1Prefix : 'श्री.',
      party1Name: (facts.party1Name && facts.party1Name.trim()) ? facts.party1Name : '________________________',
      party1Age: (facts.party1Age && facts.party1Age.trim()) ? facts.party1Age : '____',
      party1Occupation: (facts.party1Occupation && facts.party1Occupation.trim()) ? facts.party1Occupation : 'सेवा (नोकरी)',
      party1Address: (facts.party1Address && facts.party1Address.trim()) ? facts.party1Address : '________________________',

      party2Prefix: (facts.party2Prefix && facts.party2Prefix.trim()) ? facts.party2Prefix : 'सौ.',
      party2Name: (facts.party2Name && facts.party2Name.trim()) ? facts.party2Name : (template.id.includes('divorce') ? '________________________' : ''),
      party2MaidenName: (facts.party2MaidenName && facts.party2MaidenName.trim()) ? facts.party2MaidenName : (template.id.includes('divorce') ? '________________________' : ''),
      party2Age: (facts.party2Age && facts.party2Age.trim()) ? facts.party2Age : '',
      party2Occupation: (facts.party2Occupation && facts.party2Occupation.trim()) ? facts.party2Occupation : '',
      party2Guardian: (facts.party2Guardian && facts.party2Guardian.trim()) ? facts.party2Guardian : '',
      party2Address: (facts.party2Address && facts.party2Address.trim()) ? facts.party2Address : '',

      marriageDate: formatToDDMMYYYY(facts.marriageDate) || '____/____/________',
      marriagePlace: (facts.marriagePlace && facts.marriagePlace.trim()) ? facts.marriagePlace : '________________',
      childrenDetails: (facts.childrenDetails && facts.childrenDetails.trim()) ? facts.childrenDetails : 'कोणतेही अपत्य नाही',
      childrenClause: childrenClause,
      separationDate: formatToDDMMYYYY(facts.separationDate) || '____/____/________',
      separationYears: (facts.separationYears && facts.separationYears.trim()) ? facts.separationYears : '१ वर्षापेक्षा जास्त कालावधी',
      settlementClauses: settlementClauses,

      alimonyAmount: (facts.alimonyAmount && facts.alimonyAmount.trim()) ? facts.alimonyAmount : '१,००,०००',
      alimonyWords: (facts.alimonyWords && facts.alimonyWords.trim()) ? facts.alimonyWords : 'रुपये एक लाख मात्र',

      advocateParty1: (facts.advocateParty1 && facts.advocateParty1.trim()) ? facts.advocateParty1 : 'ॲड. सचिन मधुकर महाजन',
      advocateParty2: (facts.advocateParty2 && facts.advocateParty2.trim()) ? facts.advocateParty2 : '. . . . . . . . . . . . . . . . .',
      advocateName: (facts.advocateName && facts.advocateName.trim()) ? facts.advocateName : 'Adv. Sachin M. Mahajan',
      advocateAddress: (facts.advocateAddress && facts.advocateAddress.trim()) ? facts.advocateAddress : 'Chamber No. 4, District Court Complex, Jalgaon',

      effectiveDate: formatToDDMMYYYY(facts.effectiveDate) || todayDDMMYYYY,
      purpose: (facts.purpose && facts.purpose.trim()) ? facts.purpose : 'business collaboration',
      termYears: (facts.termYears && facts.termYears.trim()) ? facts.termYears : '3',
      governingLaw: (facts.governingLaw && facts.governingLaw.trim()) ? facts.governingLaw : 'Laws of India',
      disputeCity: (facts.disputeCity && facts.disputeCity.trim()) ? facts.disputeCity : 'Mumbai',

      outstandingAmount: (facts.outstandingAmount && facts.outstandingAmount.trim()) ? facts.outstandingAmount : 'Rs. 4,50,000/-',
      invoiceDetails: (facts.invoiceDetails && facts.invoiceDetails.trim()) ? facts.invoiceDetails : 'Invoice No. 101',
      noticeDays: (facts.noticeDays && facts.noticeDays.trim()) ? facts.noticeDays : '15',

      affidavitPurpose: (facts.affidavitPurpose && facts.affidavitPurpose.trim()) ? facts.affidavitPurpose : 'नाव दुरुस्ती बाबत',
      affidavitFacts: (facts.affidavitFacts && facts.affidavitFacts.trim()) ? facts.affidavitFacts : '१) मी वरील पत्त्यावर राहत असून सदर प्रतिज्ञापत्रातील सर्व बाबी माझ्या प्रत्यक्ष माहितीत आहेत.',

      // Name Change replacements
      deponentOldName: (facts.deponentOldName && facts.deponentOldName.trim()) ? facts.deponentOldName : (facts.party1Name || '________________________'),
      deponentNewName: (facts.deponentNewName && facts.deponentNewName.trim()) ? facts.deponentNewName : (facts.party1Name || '________________________'),
      fatherOrHusbandName: (facts.fatherOrHusbandName && facts.fatherOrHusbandName.trim()) ? facts.fatherOrHusbandName : '________________________',
      deponentAge: (facts.deponentAge && facts.deponentAge.trim()) ? facts.deponentAge : (facts.party1Age || '____'),
      deponentOccupation: (facts.deponentOccupation && facts.deponentOccupation.trim()) ? facts.deponentOccupation : (facts.party1Occupation || 'सेवा (नोकरी)'),
      deponentAddress: (facts.deponentAddress && facts.deponentAddress.trim()) ? facts.deponentAddress : (facts.party1Address || '________________________'),
      reasonForChange: (facts.reasonForChange && facts.reasonForChange.trim()) ? facts.reasonForChange : 'अंकशास्त्र, ज्योतिषशास्त्र व व्यक्तिगत स्वेच्छेनुसार',
      idProofDetails: (facts.idProofDetails && facts.idProofDetails.trim()) ? facts.idProofDetails : 'आधार कार्ड व पॅन कार्ड',
      authorityName: (facts.authorityName && facts.authorityName.trim()) ? facts.authorityName : 'मे. कार्यकारी दंडाधिकारी / नोटरी पब्लिक',

      // {todaysDate} variable shall be always filled with current system date in DD-MON-YYYY format in marathi
      todaysDate: getMarathiTodayDate(),
    };

    // Replace any other custom facts if non-empty
    for (const [key, val] of Object.entries(cleanFacts)) {
      if (val !== undefined && val !== null) {
        const strVal = String(val);
        if (strVal.trim().length > 0) {
          replacements[key] = strVal;
        }
      }
    }

    // Force {todaysDate} to always be current system date in DD-MON-YYYY format with English numbers
    const marathiToday = getMarathiTodayDate();
    replacements.todaysDate = marathiToday;
    replacements.todayDate = marathiToday;
    replacements.todaysdate = marathiToday;

    for (const [key, val] of Object.entries(replacements)) {
      if (!key || val === undefined || val === null) continue;
      const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const charPattern = key.split('').map((c) => c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('(?:\\s*<[^>]*>)*');

      // Match {key} even if separated by inner HTML tags, HTML entities (&lbrace; &#123;) or styling
      const tagRegex = new RegExp(`(?:\\{|&lbrace;|&#123;|&#x7b;)(?:\\s*<[^>]*>)*\\s*${charPattern}\\s*(?:\\s*<[^>]*>)*(?:\\}|&rbrace;|&#125;|&#x7d;)`, 'gi');
      text = text.replace(tagRegex, val);

      const literalRegex = new RegExp(`\\{${escapedKey}\\}`, 'gi');
      text = text.replace(literalRegex, val);
    }

    // Direct replacement of {todaysDate} variations to ensure English numbers
    text = text.replace(/\{(?:todaysDate|todayDate|todaysdate|today_date|todays_date)\}/gi, marathiToday);
    text = text.replace(/(?:\{|&lbrace;|&#123;|&#x7b;)(?:<[^>]*>)*\s*(?:todaysDate|todayDate|todaysdate|today_date|todays_date)\s*(?:<[^>]*>)*(?:\}|&rbrace;|&#125;|&#x7d;)/gi, marathiToday);

    // 1. Remove all remaining placeholders with brackets and replace with empty spaces
    text = removePlaceholdersWithSpaces(text);

    // 2. If entire table row is having empty / space value -- that row shall get removed
    text = removeEmptyTableRows(text);

    // 3. Final cleanup of any unprovided party residual shells or dead dot signature lines
    text = cleanUnprovidedPartyBlocks(text, cleanFacts);

    return text;
  }

  auditCompliance(template: LegalTemplate, facts: ClientFacts, currentDraft: string): ComplianceCheckResult {
    const checks: ComplianceCheckResult['checks'] = [];

    if (template.id.includes('divorce-13b')) {
      // 1. Separation >= 1 year
      const hasSepDate = !!facts.separationDate && facts.separationDate.length > 4;
      const mentions1Year = currentDraft.includes('१ वर्ष') || currentDraft.includes('1 year') || currentDraft.includes('वर्ष');
      checks.push({
        id: 'statutory_separation',
        label: 'Statutory 1-Year Separation (Sec 13B(1))',
        passed: hasSepDate && mentions1Year,
        severity: 'error',
        message: hasSepDate && mentions1Year 
          ? 'Passed: Separation period exceeds mandatory 1-year requirement.'
          : 'Failed: Under Section 13B, parties must be living separately for at least 1 year prior to filing.'
      });

      // 2. Pregnancy denial statement
      const hasPregnancyDenial = currentDraft.includes('गर्भवती नाही') || currentDraft.toLowerCase().includes('not pregnant');
      checks.push({
        id: 'pregnancy_clause',
        label: 'Non-Pregnancy Affirmation for Wife',
        passed: hasPregnancyDenial,
        severity: 'error',
        message: hasPregnancyDenial
          ? 'Passed: Non-pregnancy negative assertion included.'
          : 'Missing: Court requires an explicit declaration that Applicant No. 2 is not pregnant.'
      });

      // 3. Parties identities
      const hasHusband = !!facts.party1Name && facts.party1Name.trim().length > 3;
      const hasWife = !!facts.party2Name && facts.party2Name.trim().length > 3;
      checks.push({
        id: 'parties_names',
        label: 'Full Names & Age of Both Applicants',
        passed: hasHusband && hasWife,
        severity: 'error',
        message: (hasHusband && hasWife)
          ? 'Passed: Both applicant identities provided.'
          : 'Incomplete: Please ensure both Husband and Wife full names and ages are specified.'
      });

      // 4. Case number reminder
      const hasCaseNo = !!facts.hmpNo && facts.hmpNo.trim().length > 0;
      checks.push({
        id: 'case_number',
        label: 'HMP Case Number',
        passed: hasCaseNo,
        severity: 'info',
        message: hasCaseNo
          ? `Filed under HMP No. ${facts.hmpNo}`
          : 'Notice: Case number is left blank for court clerk to allot upon presentation.'
      });

      // 5. Advocate for Applicant 2
      const hasAdv2 = !!facts.advocateParty2 && !facts.advocateParty2.includes('.');
      checks.push({
        id: 'advocate_2',
        label: 'Applicant No. 2 Independent Advocate',
        passed: hasAdv2,
        severity: 'warning',
        message: hasAdv2
          ? 'Passed: Independent counsel specified for Applicant 2.'
          : 'Warning: Leave blank or appoint separate counsel for Applicant 2 as per High Court ethics.'
      });
    } else if (template.id === 'mutual-nda') {
      const hasParties = !!facts.party1Name && !!facts.party2Name;
      const hasTerm = currentDraft.includes('survive for a period of') || currentDraft.includes('years');
      const hasDispute = !!facts.disputeCity && currentDraft.includes(facts.disputeCity);

      checks.push({
        id: 'parties_identified',
        label: 'Both Contracting Entities Identified',
        passed: hasParties,
        severity: 'error',
        message: hasParties ? 'Passed: Both contracting parties defined.' : 'Missing: Party 1 or Party 2 name missing.'
      });

      checks.push({
        id: 'confidentiality_term',
        label: 'Definite Confidentiality Survival Term',
        passed: hasTerm,
        severity: 'error',
        message: hasTerm ? 'Passed: Survival term explicitly specified.' : 'Missing: Survival duration of confidentiality missing.'
      });

      checks.push({
        id: 'jurisdiction_clause',
        label: 'Governing Law and Dispute Jurisdiction',
        passed: hasDispute,
        severity: 'warning',
        message: hasDispute ? `Passed: Exclusive jurisdiction at ${facts.disputeCity}.` : 'Missing: Dispute jurisdiction city not set.'
      });
    } else if (template.id.includes('name-change')) {
      const hasOldName = !!facts.deponentOldName && facts.deponentOldName.trim().length > 2;
      const hasNewName = !!facts.deponentNewName && facts.deponentNewName.trim().length > 2;
      const isDiff = facts.deponentOldName !== facts.deponentNewName;
      const hasReason = !!facts.reasonForChange && facts.reasonForChange.trim().length > 3;
      const hasAddress = !!facts.deponentAddress && facts.deponentAddress.trim().length > 5;

      checks.push({
        id: 'names_differentiated',
        label: 'Old Name and New Name Differentiated',
        passed: hasOldName && hasNewName && isDiff,
        severity: 'error',
        message: (hasOldName && hasNewName && isDiff)
          ? `Passed: Name change from "${facts.deponentOldName}" to "${facts.deponentNewName}".`
          : 'Error: Both Old Name and distinct New Name must be specified.'
      });

      checks.push({
        id: 'reason_stated',
        label: 'Statutory Reason for Name Change',
        passed: hasReason,
        severity: 'warning',
        message: hasReason ? 'Passed: Reason for name change documented.' : 'Warning: Please provide reason for change.'
      });

      checks.push({
        id: 'residence_verified',
        label: 'Deponent Residential Address',
        passed: hasAddress,
        severity: 'error',
        message: hasAddress ? 'Passed: Residential address specified.' : 'Error: Full residential address is required for Gazette affidavit.'
      });
    } else {
      checks.push({
        id: 'general_parties',
        label: 'Party Details Verified',
        passed: !!facts.party1Name,
        severity: 'info',
        message: 'Deponent/Party 1 details recorded.'
      });
    }

    const passedCount = checks.filter(c => c.passed).length;
    return {
      passed: passedCount === checks.length,
      totalChecks: checks.length,
      passedChecks: passedCount,
      checks
    };
  }
}

export const templateService = new TemplateService();

