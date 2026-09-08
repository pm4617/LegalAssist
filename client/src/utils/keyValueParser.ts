import { FieldDefinition } from '../types';

const STANDARD_FIELD_MAP: Record<string, string[]> = {
  party1Name: ['party1name', 'party 1 name', 'applicant name', 'client name', 'husband name', 'husband', 'deponent name', 'client', 'first party', 'creditor', 'applicant 1', 'mr', 'deponent', 'old name', 'अर्जदाराचे नाव', 'अर्जदार नाव', 'पतीचे नाव', 'मागील नाव', 'जुने नाव', 'प्रथम पक्ष', 'अर्जदार', 'प्रथम पक्षकार'],
  party2Name: ['party2name', 'party 2 name', 'wife name', 'wife', 'opposite party', 'second party', 'defaulter', 'debtor', 'new name', 'mrs', 'सामनेवाल्याचे नाव', 'सामनेवाला नाव', 'पत्नीचे नाव', 'नवीन नाव', 'द्वितीय पक्ष', 'सामनेवाला', 'मृत व्यक्तीचे नाव', 'मृत व्यक्ती', 'द्वितीय पक्षकार'],
  party2MaidenName: ['party2maidenname', 'maiden name', 'maiden', 'माहेरचे नाव', 'लग्नापूर्वीचे नाव'],
  fatherOrHusbandName: ['fatherorhusbandname', 'father name', "father's name", "husband's name", 'guardian', 'वडिलांचे नाव', 'पतीचे नाव', 'पालक'],
  party2Guardian: ['party2guardian', 'guardian', 'वडिलांचे नाव', 'पालक'],
  party1Age: ['party1age', 'party 1 age', 'applicant age', 'client age', 'husband age', 'age', 'वय', 'अर्जदाराचे वय'],
  party2Age: ['party2age', 'party 2 age', 'wife age', 'सामनेवाल्याचे वय'],
  party1Occupation: ['party1occupation', 'occupation', 'dhanda', 'nokri', 'धंदा', 'नोकरी', 'व्यवसाय', 'अर्जदाराचा व्यवसाय'],
  party2Occupation: ['party2occupation', 'wife occupation', 'गृहिणी', 'सामनेवाला व्यवसाय'],
  party1Address: ['party1address', 'applicant address', 'client address', 'husband address', 'address', 'पत्ता', 'राहाणार', 'अर्जदाराचा पत्ता', 'राहणार'],
  party2Address: ['party2address', 'wife address', 'party 2 address', 'सामनेवाल्याचा पत्ता'],
  marriageDate: ['marriagedate', 'marriage date', 'married on', 'विवाह दिनांक', 'लग्न तारीख', 'विवाह तारीख'],
  marriagePlace: ['marriageplace', 'marriage place', 'married at', 'विवाह ठिकाण', 'लग्न ठिकाण'],
  separationDate: ['separationdate', 'separation date', 'date of death', 'death date', 'arrest date', 'विभक्त दिनांक', 'फारकत तारीख', 'मृत्यू दिनांक', 'मृत्यू तारीख', 'अटक दिनांक'],
  separationYears: ['separationyears', 'separation duration', 'विभक्त कालावधी', 'कालावधी'],
  childrenDetails: ['childrendetails', 'children', 'legal heirs', 'heirs', 'अपत्य', 'वारस', 'मुले', 'अपत्य तपशील', 'वारस तपशील'],
  alimonyAmount: ['alimonyamount', 'alimony', 'amount', 'outstanding amount', 'पोटगी रक्कम', 'रक्कम', 'खावटी'],
  alimonyWords: ['alimonywords', 'alimony in words', 'अक्षरी रक्कम', 'अक्षरी'],
  courtCity: ['courtcity', 'court city', 'city', 'place of death', 'court', 'कोर्ट ठिकाण', 'शहर', 'मृत्यूचे ठिकाण'],
  hmpNo: ['hmpno', 'hmp no', 'crime no', 'case no', 'केस नंबर', 'गुन्हा नोंद क्र.', 'क्र.'],
  reasonForChange: ['reasonforchange', 'reason for change', 'reason', 'कारण', 'नावात बदलाचे कारण'],
  governingLaw: ['governinglaw', 'governing law', 'कायदा'],
  purpose: ['purpose', 'हेतू', 'उद्देश'],
};

function matchFieldKey(keyPart: string, fields?: FieldDefinition[]): string | null {
  if (!fields || fields.length === 0) return null;
  const cleanKeyPart = keyPart.toLowerCase().replace(/[\(\)\:\=\-_]/g, ' ').trim();

  for (const f of fields) {
    const fKeyClean = f.key.toLowerCase().replace(/[\(\)\:\=\-_]/g, ' ').trim();
    const fLabelClean = (f.label || '').toLowerCase().replace(/[\(\)\:\=\-_]/g, ' ').trim();
    const fLabelMrClean = (f.labelMr || '').toLowerCase().replace(/[\(\)\:\=\-_]/g, ' ').trim();

    if (
      cleanKeyPart === fKeyClean ||
      (fLabelClean && cleanKeyPart === fLabelClean) ||
      (fLabelMrClean && cleanKeyPart === fLabelMrClean) ||
      (fLabelClean && cleanKeyPart.includes(fLabelClean)) ||
      (fLabelMrClean && cleanKeyPart.includes(fLabelMrClean)) ||
      (fKeyClean && cleanKeyPart.includes(fKeyClean))
    ) {
      return f.key;
    }
  }
  return null;
}

export function parseKeyValueNotes(rawNotes: string, fields?: FieldDefinition[]): Record<string, any> {
  const result: Record<string, any> = {};
  if (!rawNotes || !rawNotes.trim()) return result;

  const lines = rawNotes.split('\n');
  for (const line of lines) {
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;

    const keyPart = line.substring(0, colonIdx).trim();
    const valPart = line.substring(colonIdx + 1).trim();
    if (!keyPart) continue;

    let targetKey: string | null = matchFieldKey(keyPart, fields);

    if (!targetKey) {
      const cleanKeyPart = keyPart.toLowerCase().replace(/[\(\)\:\=\-_]/g, ' ').trim();
      for (const [factKey, keywords] of Object.entries(STANDARD_FIELD_MAP)) {
        if (keywords.some((kw) => cleanKeyPart.includes(kw.toLowerCase()))) {
          targetKey = factKey;
          break;
        }
      }
    }

    const RESERVED_SYSTEM_KEYS = ['id', 'templateid', 'createdat', 'updatedat', 'name', 'template', 'draftid'];
    if (targetKey && RESERVED_SYSTEM_KEYS.includes(targetKey.toLowerCase())) {
      targetKey = null;
    }

    if (!targetKey && /^[a-zA-Z0-9_]+$/.test(keyPart)) {
      if (!RESERVED_SYSTEM_KEYS.includes(keyPart.toLowerCase())) {
        targetKey = keyPart;
      }
    }

    if (targetKey) {
      result[targetKey] = valPart;
    }
  }

  return result;
}

