export type TemplateCategory = 'family' | 'commercial' | 'litigation' | 'notices' | 'general';
export type TemplateLanguage = 'mr' | 'en' | 'bilingual';

export interface FieldDefinition {
  key: string;
  label: string;
  labelMr?: string;
  type: 'text' | 'number' | 'date' | 'select' | 'textarea' | 'boolean';
  required?: boolean;
  placeholder?: string;
  options?: { label: string; value: string }[];
  defaultValue?: any;
  group?: 'court' | 'party1' | 'party2' | 'marriage' | 'terms' | 'general';
}

export interface StandardClause {
  id: string;
  title: string;
  titleMr?: string;
  category: string;
  content: string;
  contentMr?: string;
}

export interface LegalTemplate {
  id: string;
  title: string;
  titleMr?: string;
  category: TemplateCategory;
  language: TemplateLanguage;
  description: string;
  descriptionMr?: string;
  courtApplicable?: boolean;
  defaultCourt?: string;
  fields: FieldDefinition[];
  standardClauses: StandardClause[];
  templateText: string;
  templateTextMr?: string;
  statutoryRequirements: string[];
  isBuiltIn?: boolean;        // true = ships with app, protected from deletion
  createdAt?: string;         // ISO timestamp, present on custom templates
  updatedAt?: string;
}

export interface ClientFacts {
  courtCity?: string;
  courtName?: string;
  hmpNo?: string;
  caseYear?: string;
  
  // Party 1 (e.g. Husband / Disclosing Party / Licensor)
  party1Prefix?: string;
  party1Name?: string;
  party1Age?: string;
  party1Occupation?: string;
  party1Address?: string;

  // Party 2 (e.g. Wife / Receiving Party / Licensee)
  party2Prefix?: string;
  party2Name?: string;
  party2MaidenName?: string;
  party2Age?: string;
  party2Occupation?: string;
  party2Address?: string;
  party2Guardian?: string;

  // Facts & Dates
  marriageDate?: string;
  marriagePlace?: string;
  separationDate?: string;
  separationYears?: string;
  childrenDetails?: string;
  custodyWith?: 'wife' | 'husband' | 'joint' | 'na';
  
  // Settlement & Terms
  alimonyAmount?: string;
  alimonyWords?: string;
  alimonyNil?: boolean;
  settlementMeeting?: string;

  // Advocates
  advocateParty1?: string;
  advocateParty2?: string;

  // General fields
  effectiveDate?: string;
  governingLaw?: string;
  disputeCity?: string;
  additionalClauses?: string;

  // Name Change Affidavit fields
  deponentOldName?: string;
  deponentNewName?: string;
  fatherOrHusbandName?: string;
  deponentAge?: string;
  deponentOccupation?: string;
  deponentAddress?: string;
  reasonForChange?: string;
  idProofDetails?: string;
  authorityName?: string;
  [key: string]: any;
}

export interface ComplianceCheckResult {
  passed: boolean;
  totalChecks: number;
  passedChecks: number;
  checks: {
    id: string;
    label: string;
    passed: boolean;
    severity: 'error' | 'warning' | 'info';
    message: string;
  }[];
}

