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
  group?: 'court' | 'party1' | 'party2' | 'marriage' | 'terms' | 'general' | string;
}

export interface StandardClause {
  id: string;
  title: string;
  titleMr?: string;
  category: string;
  content: string;
  contentMr?: string;
}

export interface TemplateReferencePdf {
  fileName: string;
  fileSize: number;
  mimeType?: string;
  uploadedAt?: string;
  dataBase64?: string;
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
  isBuiltIn?: boolean;
  createdAt?: string;
  updatedAt?: string;
  referencePdf?: TemplateReferencePdf;
}

export interface DocumentDraft {
  id: string;
  name: string;
  templateId: string;
  facts: ClientFacts;
  documentBody: string;
  createdAt: string;
  updatedAt: string;
}

export interface ClientFacts {
  courtCity?: string;
  courtName?: string;
  hmpNo?: string;
  caseYear?: string;
  
  party1Prefix?: string;
  party1Name?: string;
  party1Age?: string;
  party1Occupation?: string;
  party1Address?: string;

  party2Prefix?: string;
  party2Name?: string;
  party2MaidenName?: string;
  party2Age?: string;
  party2Occupation?: string;
  party2Address?: string;
  party2Guardian?: string;

  marriageDate?: string;
  marriagePlace?: string;
  separationDate?: string;
  separationYears?: string;
  childrenDetails?: string;
  custodyWith?: 'wife' | 'husband' | 'joint' | 'na';
  
  alimonyAmount?: string;
  alimonyWords?: string;
  alimonyNil?: boolean;
  settlementMeeting?: string;

  advocateParty1?: string;
  advocateParty2?: string;
  advocateName?: string;
  advocateAddress?: string;

  effectiveDate?: string;
  purpose?: string;
  termYears?: string;
  governingLaw?: string;
  disputeCity?: string;
  outstandingAmount?: string;
  invoiceDetails?: string;
  noticeDays?: string;

  affidavitPurpose?: string;
  affidavitFacts?: string;

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

