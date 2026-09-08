import { LegalTemplate } from '../types/index.js';

export const TEMPLATES: LegalTemplate[] = [
  {
    id: 'divorce-13b-mr',
    title: 'Mutual Consent Divorce Petition (Sec 13B) - Marathi',
    titleMr: 'हिंदू विवाह कायदा कलम १३ (ब) अन्वये संमतीने घटस्फोट अर्ज',
    category: 'family',
    language: 'mr',
    isBuiltIn: true,
    description: 'Complete Marathi petition under Section 13B Hindu Marriage Act, 1955 with settlement clauses, pregnancy negative clause, HC guidelines, and verification affidavit.',
    descriptionMr: 'हिंदू विवाह कायदा १९५५ चे कलम १३ (ब) प्रमाणे आपसात संमतीने घटस्फोट मिळणेबाबत कोर्टात दाखल करावयाचा अधिकृत अर्ज.',
    courtApplicable: true,
    defaultCourt: 'मे. दिवाणी न्यायाधीश वरिष्ठ स्तर, अमळनेर',
    statutoryRequirements: [
      'Separation period must be at least 1 year',
      'Non-pregnancy declaration for Applicant No. 2',
      'Both parties must be Hindu as per Section 2',
      'No pending matrimonial petition in any other court',
      'Alimony amount specified or permanent waiver mentioned'
    ],
    fields: [
      { key: 'courtCity', label: 'Court City', labelMr: 'कोर्टाचे शहर', type: 'text', required: true, defaultValue: 'अमळनेर', group: 'court' },
      { key: 'courtName', label: 'Court Name', labelMr: 'कोर्टाचे नाव', type: 'text', required: true, defaultValue: 'मे. दिवाणी न्यायाधीश वरिष्ठ स्तर', group: 'court' },
      { key: 'hmpNo', label: 'HMP Case No.', labelMr: 'विवाह अर्ज नंबर', type: 'text', placeholder: 'उदा. १२३ / २०२५ (दाखल करताना भरू शकता)', group: 'court' },
      { key: 'caseYear', label: 'Year', labelMr: 'वर्ष', type: 'text', defaultValue: '२०२६', group: 'court' },

      // Applicant 1 (Husband)
      { key: 'party1Prefix', label: 'Prefix', type: 'select', defaultValue: 'श्री.', options: [{ label: 'श्री.', value: 'श्री.' }], group: 'party1' },
      { key: 'party1Name', label: 'Husband Full Name', labelMr: 'पतीचे पूर्ण नाव', type: 'text', required: true, placeholder: 'उदा. नितीन मधुकर महाजन', group: 'party1' },
      { key: 'party1Age', label: 'Age', labelMr: 'वय', type: 'number', required: true, placeholder: '३२', group: 'party1' },
      { key: 'party1Occupation', label: 'Occupation', labelMr: 'व्यवसाय', type: 'text', defaultValue: 'सेवा (नोकरी)', placeholder: 'व्यवसाय / सेवा / शेती', group: 'party1' },
      { key: 'party1Address', label: 'Address', labelMr: 'पत्ता', type: 'textarea', required: true, placeholder: 'रा. अमळनेर, ता. अमळनेर, जि. जळगाव', group: 'party1' },

      // Applicant 2 (Wife)
      { key: 'party2Prefix', label: 'Prefix', type: 'select', defaultValue: 'सौ.', options: [{ label: 'सौ.', value: 'सौ.' }], group: 'party2' },
      { key: 'party2Name', label: 'Wife Married Name', labelMr: 'पत्नीचे लग्नानंतरचे नाव', type: 'text', required: true, placeholder: 'उदा. संजीवनी नितीन महाजन', group: 'party2' },
      { key: 'party2MaidenName', label: 'Wife Maiden Name', labelMr: 'पत्नीचे लग्नापूर्वीचे नाव', type: 'text', required: true, placeholder: 'उदा. संजीवनी राधेश्याम महाजन', group: 'party2' },
      { key: 'party2Age', label: 'Age', labelMr: 'वय', type: 'number', required: true, placeholder: '२८', group: 'party2' },
      { key: 'party2Occupation', label: 'Occupation', labelMr: 'व्यवसाय', type: 'text', defaultValue: 'गृहिणी', placeholder: 'गृहिणी / सेवा (नोकरी)', group: 'party2' },
      { key: 'party2Guardian', label: "Father's Name (for Care of)", labelMr: 'वडिलांचे नाव (द्वारा)', type: 'text', placeholder: 'उदा. राधेश्याम महाजन', group: 'party2' },
      { key: 'party2Address', label: 'Current Address', labelMr: 'सध्याचा पत्ता', type: 'textarea', required: true, placeholder: 'रा. द्वारा राधेश्याम महाजन, मु. अकुलखेडा, ता. चोपडा, जि. जळगाव', group: 'party2' },

      // Marriage & Separation
      { key: 'marriageDate', label: 'Marriage Date', labelMr: 'विवाह दिनांक', type: 'text', required: true, placeholder: 'उदा. ०१/०५/२०२१', group: 'marriage' },
      { key: 'marriagePlace', label: 'Marriage Place', labelMr: 'विवाह ठिकाण', type: 'text', required: true, placeholder: 'उदा. जळगाव', group: 'marriage' },
      { key: 'childrenDetails', label: 'Children', labelMr: 'अपत्य तपशील', type: 'text', defaultValue: 'कोणतेही अपत्य नाही', placeholder: 'उदा. कोणतेही अपत्य नाही किंवा मुलगा आर्यन वय ३ वर्ष', group: 'marriage' },
      { key: 'separationDate', label: 'Separation Date', labelMr: 'फारकत / विभक्त दिनांक', type: 'text', required: true, placeholder: 'उदा. १५/०६/२०२२', group: 'marriage' },
      { key: 'separationYears', label: 'Separation Duration', labelMr: 'विभक्त राहण्याचा कालावधी', type: 'text', defaultValue: '३ वर्षांपेक्षा जास्त कालावधी', group: 'marriage' },

      // Settlement
      { key: 'alimonyNil', label: 'Alimony Waived (Nil)', labelMr: 'पोटगी हक्क सोडला', type: 'boolean', defaultValue: false, group: 'terms' },
      { key: 'alimonyAmount', label: 'Alimony Amount (Figures)', labelMr: 'पोटगी रक्कम (अंकी)', type: 'text', placeholder: 'उदा. २,००,०००', group: 'terms' },
      { key: 'alimonyWords', label: 'Alimony Amount (Words)', labelMr: 'पोटगी रक्कम (अक्षरी)', type: 'text', placeholder: 'उदा. रुपये दोन लाख मात्र', group: 'terms' },
      { key: 'custodyWith', label: 'Child Custody', labelMr: 'मुलांचा ताबा', type: 'select', defaultValue: 'wife', options: [{ label: 'आईकडे (With Wife)', value: 'wife' }, { label: 'वडिलांकडे (With Husband)', value: 'husband' }, { label: 'संयुक्त (Joint Custody)', value: 'joint' }, { label: 'लागू नाही (No children)', value: 'na' }], group: 'terms' },

      // Advocates
      { key: 'advocateParty1', label: 'Applicant 1 Advocate', labelMr: 'अर्जदार १ वकील नाव', type: 'text', defaultValue: 'ॲड. सचिन मधुकर महाजन', group: 'general' },
      { key: 'advocateParty2', label: 'Applicant 2 Advocate', labelMr: 'अर्जदार २ वकील नाव', type: 'text', defaultValue: '. . . . . . . . . . . . . . . . .', group: 'general' }
    ],
    standardClauses: [
      {
        id: 'no_pregnancy',
        title: 'Non-Pregnancy Declaration',
        titleMr: 'गर्भधारणा नसलेबाबत कलम',
        category: 'Statutory',
        content: 'Applicant No. 2 specifically affirms that she is not pregnant as of today.',
        contentMr: 'तसेच आज रोजी अर्जदार क्र. २ ही गर्भवती नाही.'
      },
      {
        id: 'hc_guidelines',
        title: 'Bombay High Court Guidelines Compliance',
        titleMr: 'मा. उच्च न्यायालय मार्गदर्शक तत्त्वे पूर्तता',
        category: 'Statutory',
        content: 'Both applicants are Hindu by religion, have not filed any other petition in any court, and their consent is free from any force, coercion or undue influence.',
        contentMr: 'मा. मुंबई उच्च न्यायालयाने दिलेल्या मार्गदर्शक तत्त्वांनुसार अर्जदार क्र. १ व २ हे हिंदू धर्माचे आहेत. उभयतांनी यापूर्वी अन्य कोणत्याही न्यायालयात असा अर्ज दाखल केलेला नाही. उभयतांची संमती पूर्णपणे स्वखुशीने व दबावाशिवाय आहे.'
      },
      {
        id: 'no_claims_future',
        title: 'Full and Final Settlement (No Future Claims)',
        titleMr: 'भविष्यात कोणतीही मागणी न करणेबाबत',
        category: 'Settlement',
        content: 'Neither party shall make any further monetary, property, or maintenance claim against each other or their respective family members in the future.',
        contentMr: 'भविष्यात अर्जदार क्र. २ ही अर्जदार क्र. १ किंवा त्यांच्या कुटुंबीयांविरुद्ध कोणतीही खावटी / पोटगी मागणार नाही तसेच कोणतीही स्थावर अथवा जंगम मिळकतीवर हक्क सांगणार नाही किंवा कोणतेही अर्ज-फाटे-केसेस करणार नाही.'
      }
    ],
    templateText: `{courtCity} येथील {courtName} यांचे कोर्टात.
HMP / विवाह अर्ज नंबर : {hmpNo} / {caseYear}

{party1Prefix} {party1Name}
वय {party1Age} वर्षे, धंदा :- {party1Occupation}
रा. {party1Address}
                      आणि.                        ….......... अर्जदार क्र. १

{party2Prefix} {party2Name}
उर्फ {party2MaidenName}
वय {party2Age} वर्षे, धंदा :- {party2Occupation}
रा. {party2Address}
                      विरुद्ध.                     ….......... अर्जदार क्र. २

सामनेवाले : कोणीही नाही (आपसात संमतीने अर्ज असल्याने)

विषय :- हिंदू विवाह कायदा १९५५ चे कलम १३ (ब) प्रमाणे आपसात संमतीने विवाह विसर्जन (घटस्फोट) मिळणेबाबत अर्ज.

अर्जदार १ व २ खालीलप्रमाणे सविनय अर्ज सादर करतात :

१) अर्जदार क्र. १ व अर्जदार क्र. २ यांचा विवाह हिंदू धर्मशास्त्राप्रमाणे दिनांक {marriageDate} रोजी {marriagePlace} येथे झालेला आहे. {childrenClause} तसेच आज रोजी अर्जदार क्र. २ ही गर्भवती नाही.

२) लग्नानंतर अर्जदार क्र. २ ही अर्जदार क्र. १ यांच्याकडे नांदणेस गेली. त्यानंतर उभयतांनी काही काळ संसार केलेला आहे. परंतु दोघांच्या भिन्न स्वभावामुळे व एकमेकांशी पटत नसल्यामुळे व सतत किरकोळ घरगुती कारणांवरून वाद होऊ लागल्याने दोघांना एकत्रित राहून संसार करणे दुरापास्त झाले.

३) अर्जदार क्र. २ ही दिनांक {separationDate} पासून सुमारे {separationYears} कालावधीपासून पतीपासून विभक्त माहेरी राहत आहे. या काळात दोन्ही अर्जदारांच्या कुटुंबातील लोकांनी, नातेवाईकांनी तसेच वकीलांनी अर्जदारांनी पुन्हा संसार करावा म्हणून अनेक प्रयत्न केले परंतु दोघांचे एकमेकांशी अजिबात पटत नसल्याने सर्व प्रयत्न निष्फळ ठरले.

४) आता दोघांनाही कळून चुकले आहे की ते भविष्यात कधीही एकत्र संसार करू शकत नाहीत. म्हणून दोघांनी अत्यंत विचारपूर्वक, स्वेच्छेने व कायदेशीर सल्ला घेऊन परस्पर संमतीने विवाह संबंध कायमस्वरूपी संपुष्टात आणण्याचा (घटस्फोट घेण्याचा) निर्णय घेतला आहे.

५) अर्जदारांनी आपसातील समझोत्यानुसार खालील अटी व शर्ती मान्य केलेल्या आहेत :
{settlementClauses}

६) मा. मुंबई उच्च न्यायालयाच्या निर्देशानुसार :
अ) अर्जदार क्र. १ व २ हे हिंदू धर्माचे आहेत व हिंदू विवाह कायदा १९५५ लागू आहे.
ब) दोघांचे लग्न होऊन १ वर्षापेक्षा जास्त कालावधी झालेला आहे व ते १ वर्षापेक्षा अधिक कालावधीपासून विभक्त राहत आहेत.
क) उभयतांनी कोणत्याही दबावाखाली, धाकधपटशाने किंवा फसवणुकीने हा अर्ज केलेला नसून पूर्णतः स्वखुशीने व विचारपूर्वक दाखल केलेला आहे.
ड) यापूर्वी कोणत्याही कोर्टात घटस्फोटाचा अथवा वैवाहिक दाद मागण्याचा अर्ज प्रलंबित नाही.

७) हक्क व अधिकार :
सदर अर्जातील विवाहाचे ठिकाण {marriagePlace} व अर्जदारांचे वास्तव्याचे ठिकाण या कोर्टाच्या अधिकारकक्षेत येत असल्याने या न्यायालयाला हा अर्ज चालविण्याचा व हुकूम करण्याचा पूर्ण अधिकार आहे.

८) यास्तव अर्जदारांची नम्र प्रार्थना आहे की :
अ) अर्जदार क्र. १ व २ यांचा दिनांक {marriageDate} रोजी झालेला विवाह हिंदू विवाह कायदा १९५५ चे कलम १३(ब) अन्वये संमतीने विसर्जित (घटस्फोट) झाल्याचा हुकूम करण्यात यावा.
ब) उभयतांच्या संमतीनुसार डिक्री ऑफ डायव्होर्स पारित करण्यात यावी.
क) योग्य तो अन्य हुकूम व्हावा.

दिनांक :     /    /{caseYear}
ठिकाण : {courtCity}

( {party1Name} )                             ( {party2Name} )
अर्जदार क्र. १                                  अर्जदार क्र. २

( {advocateParty1} )                        ( {advocateParty2} )
अर्जदार क्र. १ चे वकील                           अर्जदार क्र. २ चे वकील


---------------------------------------------------------------------------------
                                प्रतिज्ञालेख (AFFIDAVIT)
---------------------------------------------------------------------------------

आम्ही खालील प्रतिज्ञालेख लिहून देतो की :
आम्ही अर्जदार क्र. १ {party1Name} व अर्जदार क्र. २ {party2Name}, वर नमूद पत्त्यावर राहणारे, आज रोजी अमळनेर येथे प्रतिज्ञापत्रावर लिहून देतो की, वरील अर्जातील परिच्छेद १ ते ८ मधील सर्व मजकूर आमच्या सांगण्यावरून टाईप केला असून तो आम्ही वाचून समजून घेतला आहे. त्यातील सर्व हकिकत व माहिती आमच्या व्यक्तिगत माहितीनुसार खरी व बिनचूक आहे.

त्याकरिता आम्ही हा प्रतिज्ञालेख लिहून सही केली असे.

ठिकाण : {courtCity}
दिनांक :     /    /{caseYear}

( {party1Name} )                             ( {party2Name} )
प्रतिज्ञालेख देणार - अर्जदार क्र. १             प्रतिज्ञालेख देणार - अर्जदार क्र. २`
  },
  {
    id: 'period-waive-mr',
    title: 'Cooling-off Period Waiver Application (Sec 13B(2)) - Marathi',
    titleMr: 'कलम १३-ब (२) मधील ६ महिन्यांची मुदत माफ करणेबाबत अर्ज',
    category: 'family',
    language: 'mr',
    isBuiltIn: true,
    description: 'Application to waive the statutory 6-month cooling-off period under Section 13B(2) as per Supreme Court ruling in Amardeep Singh v. Harveen Kaur.',
    descriptionMr: 'सर्वोच्च न्यायालयाच्या अमरदीप सिंग विरुद्ध हरवीन कौर निकालाच्या मार्गदर्शक तत्त्वांच्या आधारे ६ महिन्यांची मुदत माफ करणेबाबत अर्ज.',
    courtApplicable: true,
    defaultCourt: 'मे. दिवाणी न्यायाधीश वरिष्ठ स्तर, अमळनेर',
    statutoryRequirements: [
      'Must state that 18-month separation is completed or mediation failed',
      'All settlement terms including alimony and custody must be fully resolved',
      'Waiting period will only prolong marital agony'
    ],
    fields: [
      { key: 'courtCity', label: 'Court City', labelMr: 'कोर्टाचे शहर', type: 'text', defaultValue: 'अमळनेर', group: 'court' },
      { key: 'courtName', label: 'Court Name', labelMr: 'कोर्टाचे नाव', type: 'text', defaultValue: 'मे. दिवाणी न्यायाधीश वरिष्ठ स्तर', group: 'court' },
      { key: 'hmpNo', label: 'HMP Case No.', labelMr: 'विवाह अर्ज नंबर', type: 'text', placeholder: 'उदा. १२३ / २०२५', group: 'court' },
      { key: 'caseYear', label: 'Year', labelMr: 'वर्ष', type: 'text', defaultValue: '२०२६', group: 'court' },
      { key: 'party1Name', label: 'Husband Name', labelMr: 'पतीचे नाव', type: 'text', required: true, group: 'party1' },
      { key: 'party2Name', label: 'Wife Name', labelMr: 'पत्नीचे नाव', type: 'text', required: true, group: 'party2' },
      { key: 'separationYears', label: 'Separation Duration', labelMr: 'विभक्त कालावधी', type: 'text', defaultValue: '२ वर्षांपेक्षा जास्त', group: 'terms' },
      { key: 'advocateParty1', label: 'Advocate', labelMr: 'वकील नाव', type: 'text', defaultValue: 'ॲड. सचिन मधुकर महाजन', group: 'general' }
    ],
    standardClauses: [],
    templateText: `{courtCity} येथील {courtName} यांचे कोर्टात.
HMP / विवाह अर्ज नंबर : {hmpNo} / {caseYear}

{party1Name}                             ….......... अर्जदार क्र. १
                      विरुद्ध.
{party2Name}                             ….......... अर्जदार क्र. २

विषय :- हिंदू विवाह कायदा कलम १३-ब (२) मधील ६ महिन्यांची कायदेशीर मुदत माफ करणेबाबत अर्ज.

अर्जदार १ व २ खालीलप्रमाणे सविनय विनंती अर्ज करतात :

१) अर्जदारांनी आज रोजी या न्यायालयात परस्पर संमतीने विवाह विसर्जनाचा अर्ज दाखल केलेला आहे.

२) अर्जदार उभयता हे गेल्या {separationYears} कालावधीपासून एकमेकांपासून कायमचे विभक्त राहत असून त्यांचेतील समझोत्याचे सर्व प्रयत्न निष्फळ झालेले आहेत.

३) उभयतांनी मुलांचा ताबा, पोटगी, दागिने व सर्व बाबींचा अंतिम व कायमस्वरूपी समझोता पूर्ण केलेला असून दोघांमध्ये कोणताही वाद शिल्लक राहिलेला नाही.

४) मा. सर्वोच्च न्यायालयाने अमरदीप सिंग वि. हरवीन कौर (Civil Appeal No. 11158 of 2017) या खटल्यात दिलेल्या न्यायनिर्णयानुसार जर उभयतांचे एकत्र येणे अशक्य असेल तर कलम १३-ब (२) मधील ६ महिन्यांचा विचार कालावधी (Cooling-off Period) माफ करण्याचा अधिकार न्यायालयाला आहे.

५) अर्जदारांना ६ महिने थांबविल्याने त्यांच्या मानसिक त्रासात भर पडेल व भविष्यातील पुनर्वसनात बाधा येईल.

यास्तव प्रार्थना आहे की :
सदर अर्जातील कलम १३-ब (२) अन्वये असलेला ६ महिन्यांचा विचार कालावधी माफ करून अर्जावर तात्काळ अंतिम हुकूम व्हावा ही नम्र विनंती.

दिनांक :     /    /{caseYear}
ठिकाण : {courtCity}

( {party1Name} )                             ( {party2Name} )
अर्जदार क्र. १                                  अर्जदार क्र. २

मार्फत : {advocateParty1} (वकील)`
  },
  {
    id: 'mutual-nda',
    title: 'Mutual Non-Disclosure Agreement (NDA)',
    category: 'commercial',
    language: 'en',
    isBuiltIn: true,
    description: 'Bilateral confidentiality agreement protecting proprietary information, trade secrets, intellectual property, and business disclosures between two commercial parties.',
    courtApplicable: false,
    statutoryRequirements: [
      'Definition of Confidential Information',
      'Term of confidentiality (e.g. 2 or 3 years)',
      'Exclusions from confidentiality',
      'Governing law and dispute resolution jurisdiction'
    ],
    fields: [
      { key: 'effectiveDate', label: 'Effective Date', type: 'date', required: true, defaultValue: '03/09/2026', placeholder: 'DD/MM/YYYY', group: 'general' },
      { key: 'party1Name', label: 'Party 1 (Company / Individual)', type: 'text', required: true, placeholder: 'e.g. Acme Technologies Pvt. Ltd.', group: 'party1' },
      { key: 'party1Address', label: 'Party 1 Registered Address', type: 'textarea', required: true, placeholder: 'e.g. 101 Tech Park, Pune, Maharashtra', group: 'party1' },
      { key: 'party2Name', label: 'Party 2 (Company / Individual)', type: 'text', required: true, placeholder: 'e.g. Apex Legal Solutions LLP', group: 'party2' },
      { key: 'party2Address', label: 'Party 2 Registered Address', type: 'textarea', required: true, placeholder: 'e.g. 402 Court Chambers, Mumbai, Maharashtra', group: 'party2' },
      { key: 'purpose', label: 'Purpose of Disclosure', type: 'text', defaultValue: 'evaluating and executing a potential business collaboration, software integration, or legal advisory partnership', group: 'terms' },
      { key: 'termYears', label: 'Confidentiality Term (Years)', type: 'number', defaultValue: '3', group: 'terms' },
      { key: 'governingLaw', label: 'Governing Law', type: 'text', defaultValue: 'Laws of India', group: 'terms' },
      { key: 'disputeCity', label: 'Arbitration / Jurisdiction City', type: 'text', defaultValue: 'Mumbai', group: 'terms' }
    ],
    standardClauses: [
      {
        id: 'injunctive_relief',
        title: 'Injunctive Relief',
        category: 'Remedies',
        content: 'Each party agrees that damages may be inadequate remedy for any breach of this Agreement and that the non-breaching party shall be entitled to seek injunctive relief in addition to any other remedies available at law.'
      },
      {
        id: 'non_solicit',
        title: 'Non-Solicitation of Employees',
        category: 'Restrictive Covenants',
        content: 'During the term of this Agreement and for a period of one (1) year thereafter, neither party shall directly solicit, recruit, or hire any employee or key contractor of the other party introduced in connection with the Purpose.'
      }
    ],
    templateText: `MUTUAL NON-DISCLOSURE AGREEMENT

This Mutual Non-Disclosure Agreement (the "Agreement") is entered into as of {effectiveDate} (the "Effective Date"), by and between:

1. {party1Name}, having its principal place of business at {party1Address} (hereinafter referred to as the "First Party"); and
2. {party2Name}, having its principal place of business at {party2Address} (hereinafter referred to as the "Second Party").

(Each of the First Party and the Second Party may individually be referred to as a "Party" and collectively as the "Parties").

RECITALS
WHEREAS, the Parties wish to explore and engage in discussions concerning {purpose} (the "Purpose"); and
WHEREAS, in connection with the Purpose, each Party may disclose to the other confidential, proprietary, or non-public technical, operational, and financial information;

NOW, THEREFORE, the Parties hereby agree as follows:

1. DEFINITION OF CONFIDENTIAL INFORMATION
"Confidential Information" means all non-public information disclosed by either Party ("Disclosing Party") to the other Party ("Receiving Party"), whether orally, visually, in writing, or in electronic format, that is designated as confidential or that reasonably should be understood to be confidential given the nature of the information and the circumstances of disclosure.

2. OBLIGATIONS OF THE RECEIVING PARTY
The Receiving Party agrees to:
(a) Protect and preserve the confidentiality of the Disclosing Party's Confidential Information using at least the degree of care it uses for its own confidential information, but in no event less than reasonable care;
(b) Use the Confidential Information solely for the authorized Purpose;
(c) Disclose the Confidential Information only to its officers, employees, legal counsel, and consultants who need to know such information for the Purpose and who are bound by confidentiality obligations at least as restrictive as this Agreement.

3. EXCLUSIONS FROM CONFIDENTIALITY
The obligations of confidentiality shall not apply to information that:
(a) Is or becomes publicly known through no breach of this Agreement by the Receiving Party;
(b) Was already known to the Receiving Party prior to disclosure by the Disclosing Party;
(c) Is rightfully received from a third party without duty of confidentiality;
(d) Is independently developed without reference to or reliance upon the Confidential Information.

4. DURATION & RETURN OF MATERIALS
The confidentiality obligations under this Agreement shall survive for a period of {termYears} years from the Effective Date. Upon written request, the Receiving Party shall promptly return or certify the secure destruction of all tangible copies of Confidential Information.

5. GOVERNING LAW & JURISDICTION
This Agreement shall be governed by, and construed in accordance with, the {governingLaw}. The courts situated in {disputeCity} shall have exclusive jurisdiction over any disputes arising out of or in connection with this Agreement.

IN WITNESS WHEREOF, the Parties have executed this Mutual Non-Disclosure Agreement as of the Effective Date.

For {party1Name}:                           For {party2Name}:

_______________________________             _______________________________
Name:                                       Name:
Title:                                      Title:
Date:                                       Date:`
  },
  {
    id: 'legal-notice-recovery',
    title: 'Legal Notice for Recovery of Dues / Debt',
    category: 'notices',
    language: 'en',
    isBuiltIn: true,
    description: 'Formal advocate notice demanding payment of outstanding debt, invoices, or contractual damages within 15 days before initiating civil and criminal proceedings.',
    courtApplicable: false,
    statutoryRequirements: [
      'Particulars of unpaid debt / invoices',
      'Explicit demand period (15 days)',
      'Clear warning of civil litigation and costs under CPC'
    ],
    fields: [
      { key: 'advocateName', label: 'Advocate Name', type: 'text', defaultValue: 'Adv. Sachin M. Mahajan', group: 'general' },
      { key: 'advocateAddress', label: 'Advocate Chamber Address', type: 'textarea', defaultValue: 'Chamber No. 4, District Court Complex, Jalgaon / Amalner', group: 'general' },
      { key: 'party1Name', label: 'Client (Creditor)', type: 'text', required: true, placeholder: 'e.g. Rameshwar Trading Co.', group: 'party1' },
      { key: 'party2Name', label: 'Recipient (Defaulter / Debtor)', type: 'text', required: true, placeholder: 'e.g. Skyward Enterprises', group: 'party2' },
      { key: 'party2Address', label: 'Recipient Address', type: 'textarea', required: true, placeholder: 'e.g. Plot No. 12, MIDC Area, Jalgaon', group: 'party2' },
      { key: 'outstandingAmount', label: 'Outstanding Amount (Rs.)', type: 'text', required: true, placeholder: 'e.g. Rs. 4,50,000/-', group: 'terms' },
      { key: 'invoiceDetails', label: 'Invoice / Agreement Details', type: 'text', placeholder: 'e.g. Tax Invoice No. 892 dated 14/01/2026', group: 'terms' },
      { key: 'noticeDays', label: 'Cure Period (Days)', type: 'number', defaultValue: '15', group: 'terms' }
    ],
    standardClauses: [],
    templateText: `REGISTERED A.D. / SPEED POST LEGAL NOTICE

Date: {effectiveDate}

To,
{party2Name}
{party2Address}

SUBJECT: LEGAL NOTICE UNDER INSTRUCTIONS OF MY CLIENT {party1Name} FOR RECOVERY OF OUTSTANDING DUES AMOUNTING TO {outstandingAmount} ALONG WITH ACCRUED INTEREST.

Sir / Madam,

Under instructions from and on behalf of my client {party1Name}, I do hereby serve upon you the present Legal Notice as follows:

1. That my client is an established business enterprise carrying on trade and commerce in good faith and reputation.

2. That under commercial engagement, my client provided services/goods to you as evidenced by {invoiceDetails}, for which you were legally obligated to make timely payment.

3. That my client has completed all deliverables in accordance with agreed specifications. However, despite multiple reminders, emails, and phone calls, you have intentionally failed, neglected, and refused to clear the legitimate outstanding sum of {outstandingAmount}.

4. That your withholding of my client's hard-earned money constitutes unlawful enrichment, gross breach of trust, and actionable default under civil and commercial laws.

5. I, THEREFORE, HEREBY CALL UPON YOU to pay the entire outstanding sum of {outstandingAmount} along with interest @ 18% per annum from due date until realization, directly to my client or through my office within {noticeDays} days from receipt of this notice, failing which:
(a) My client shall initiate appropriate Civil Recovery Suits before the competent court of law;
(b) Claim compensatory damages and legal costs quantified at Rs. 10,000/- for this notice;
(c) Pursue all available remedies under applicable statutes at your sole cost and consequence.

Copy retained in my chamber for further legal proceedings.

Yours faithfully,

{advocateName}
Advocate, High Court / District Court
{advocateAddress}`
  },
  {
    id: 'general-affidavit-mr',
    title: 'General Legal Affidavit (प्रतिज्ञापत्र) - Marathi',
    titleMr: 'सामान्य कायदेशीर प्रतिज्ञापत्र',
    category: 'litigation',
    language: 'mr',
    isBuiltIn: true,
    description: 'Standard Devanagari legal affidavit under oath for submission before administrative officers, municipal authorities, or courts of law.',
    courtApplicable: true,
    defaultCourt: 'मे. कार्यकारी दंडाधिकारी / सक्षम न्यायालय',
    statutoryRequirements: [
      'Deponent identity and residential verification',
      'Affirmation of truthfulness on solemn oath',
      'Verification clause signed before Notary or Magistrate'
    ],
    fields: [
      { key: 'courtCity', label: 'City', labelMr: 'शहर', type: 'text', defaultValue: 'अमळनेर', group: 'court' },
      { key: 'party1Name', label: 'Deponent Full Name', labelMr: 'प्रतिज्ञापत्र देणाराचे नाव', type: 'text', required: true, placeholder: 'उदा. नितीन मधुकर महाजन', group: 'party1' },
      { key: 'party1Age', label: 'Age', labelMr: 'वय', type: 'number', placeholder: '३५', group: 'party1' },
      { key: 'party1Occupation', label: 'Occupation', labelMr: 'व्यवसाय', type: 'text', defaultValue: 'व्यवसाय', group: 'party1' },
      { key: 'party1Address', label: 'Address', labelMr: 'पत्ता', type: 'textarea', required: true, placeholder: 'रा. अमळनेर, जि. जळगाव', group: 'party1' },
      { key: 'affidavitPurpose', label: 'Subject / Purpose', labelMr: 'प्रतिज्ञापत्राचा विषय', type: 'text', required: true, placeholder: 'उदा. नाव दुरुस्ती / वारस नोंद / मिळकत फेरफार बाबत', group: 'terms' },
      { key: 'affidavitFacts', label: 'Statement of Facts', labelMr: 'सविस्तर हकीकत', type: 'textarea', required: true, placeholder: '१) मी वरील पत्त्यावर राहत असून...', group: 'terms' }
    ],
    standardClauses: [],
    templateText: `समक्ष : {courtCity} येथील मे. सक्षम प्राधिकारी / न्यायालय.

                             प्रतिज्ञापत्र (AFFIDAVIT)

मी, {party1Name}, वय {party1Age} वर्षे, धंदा :- {party1Occupation},
रा. {party1Address},
आज रोजी अमळनेर येथे सत्य प्रतिज्ञेवर लिहून देतो की :

१) मी वरील पत्त्यावर राहत असून सदर प्रतिज्ञापत्रातील सर्व बाबी माझ्या प्रत्यक्ष व कायदेशीर माहितीत आहेत.

२) विषय : {affidavitPurpose}.

३) सविस्तर कथन :
{affidavitFacts}

४) वरील परिच्छेद १ ते ३ मध्ये नमूद केलेला सर्व मजकूर माझ्या सांगण्यानुसार टाईप केलेला असून मी तो काळजीपूर्वक वाचून समजून घेतला आहे. त्यात कोणताही खोटा अथवा दिशाभूल करणारा मजकूर लिहिलेला नाही. सदर प्रतिज्ञापत्र मी कोणत्याही दबावाशिवाय, पूर्ण शुद्धीत व स्वखुशीने लिहून दिले आहे.

सदरचे प्रतिज्ञापत्र खरे असल्याबद्दल खाली माझी स्वाक्षरी केली आहे.

ठिकाण : {courtCity}
दिनांक :     /    /{caseYear}

                                                        ( {party1Name} )
                                                      प्रतिज्ञापत्र देणार

माझे समक्ष सत्य प्रतिज्ञेवर ओळख पटवून सही केली.

( नोटरी / कार्यकारी दंडाधिकारी )`
  },
  {
    id: 'name-change-affidavit-mr',
    title: 'Name Change Affidavit (नावात बदल प्रतिज्ञापत्र) - Marathi',
    titleMr: 'नावात बदल केल्याबाबत प्रतिज्ञापत्र',
    category: 'general',
    language: 'mr',
    isBuiltIn: true,
    description: 'Official Marathi legal affidavit for name change / spelling correction for Gazette publication, Passport, Aadhaar, PAN card, and bank accounts. No matrimonial or spouse details.',
    descriptionMr: 'स्वतःच्या नावात बदल केल्याबाबत शासकीय राजपत्रात (Gazette) प्रसिद्धीसाठी व ओळखपत्रांसाठी करावयाचे अधिकृत प्रतिज्ञापत्र.',
    courtApplicable: true,
    defaultCourt: 'मे. कार्यकारी दंडाधिकारी / नोटरी पब्लिक',
    statutoryRequirements: [
      'Old name and new name must be clearly stated',
      'Reason for change specified (e.g. numerology, astrology, spelling correction)',
      'Affirmation that deponent is henceforth known by new name',
      'Signed before Notary or Executive Magistrate'
    ],
    fields: [
      { key: 'courtCity', label: 'City', labelMr: 'शहर', type: 'text', defaultValue: 'अमळनेर', group: 'court' },
      { key: 'authorityName', label: 'Authority / Court', labelMr: 'सक्षम प्राधिकारी / नोटरी', type: 'text', defaultValue: 'मे. कार्यकारी दंडाधिकारी / नोटरी पब्लिक', group: 'court' },
      { key: 'caseYear', label: 'Year', labelMr: 'वर्ष', type: 'text', defaultValue: '२०२६', group: 'court' },

      // Deponent details only - NO wife or spouse details!
      { key: 'deponentOldName', label: 'Old Name (मागील जुने नाव)', labelMr: 'मागील जुने नाव', type: 'text', required: true, defaultValue: 'नितीन मधुकर पाटील', placeholder: 'उदा. नितीन मधुकर पाटील', group: 'party1' },
      { key: 'deponentNewName', label: 'New Name (नवीन नाव)', labelMr: 'नवीन धारण केलेले नाव', type: 'text', required: true, defaultValue: 'नितीन मधुकर महाजन', placeholder: 'उदा. नितीन मधुकर महाजन', group: 'party1' },
      { key: 'fatherOrHusbandName', label: "Father's / Husband's Name", labelMr: 'वडिलांचे / पतीचे नाव', type: 'text', required: true, defaultValue: 'मधुकर दगडू महाजन', placeholder: 'उदा. मधुकर दगडू महाजन', group: 'party1' },
      { key: 'deponentAge', label: 'Age', labelMr: 'वय', type: 'number', required: true, defaultValue: '३२', placeholder: '३२', group: 'party1' },
      { key: 'deponentOccupation', label: 'Occupation', labelMr: 'व्यवसाय', type: 'text', defaultValue: 'नोकरी / व्यवसाय', group: 'party1' },
      { key: 'deponentAddress', label: 'Residential Address', labelMr: 'पत्ता', type: 'textarea', required: true, defaultValue: 'रा. अमळनेर, ता. अमळनेर, जि. जळगाव', placeholder: 'उदा. रा. अमळनेर, ता. अमळनेर, जि. जळगाव', group: 'party1' },

      // Terms & Reason
      { key: 'reasonForChange', label: 'Reason for Change', labelMr: 'नाव बदलण्याचे कारण', type: 'textarea', defaultValue: 'अंकशास्त्र, ज्योतिषशास्त्र व व्यक्तिगत स्वेच्छेनुसार', placeholder: 'उदा. अंकशास्त्र, ज्योतिषशास्त्र व व्यक्तिगत स्वेच्छेनुसार', group: 'terms' },
      { key: 'idProofDetails', label: 'Identity Proof Details', labelMr: 'ओळख पुरावा तपशील', type: 'text', defaultValue: 'आधार कार्ड व पॅन कार्ड', placeholder: 'उदा. आधार कार्ड क्र. XXXX XXXX 1234', group: 'terms' }
    ],
    standardClauses: [],
    templateText: `समक्ष : {courtCity} येथील {authorityName}.

                     नावात बदल केल्याबाबत प्रतिज्ञापत्र (AFFIDAVIT)

मी, {deponentNewName} (मागील जुने नाव : {deponentOldName}),
वय {deponentAge} वर्षे, धंदा :- {deponentOccupation},
वडिलांचे नाव : {fatherOrHusbandName},
रा. {deponentAddress},
आज रोजी {courtCity} येथे सत्य प्रतिज्ञेवर खालीलप्रमाणे लिहून देतो की :

१) मी वरील पत्त्यावर कायमस्वरूपी वास्तव्यास असून भारतीय नागरिक आहे. माझ्या ओळखीचा पुरावा म्हणून मी {idProofDetails} सादर केलेला आहे.

२) माझे जन्मापासूनचे अथवा मूळ शैक्षणिक कागदपत्रांवरील नाव "{deponentOldName}" असे नोंदविलेले आहे.

३) परंतु मी {reasonForChange} माझ्या पूर्वीच्या नावात बदल करून आजपासून नवीन नाव "{deponentNewName}" असे धारण केलेले आहे.

४) सबब मी याद्वारे अधिकृतपणे जाहीर करतो की, यापुढे भविष्यात माझ्या सर्व शासकीय, निमशासकीय, शैक्षणिक, वित्तीय, बँकिंग, महसुली व कौटुंबिक व्यवहारांत तसेच सर्व ओळखपत्रांवर मला "{deponentNewName}" या नवीन नावानेच ओळखले व संबोधले जावे.

५) "{deponentOldName}" आणि "{deponentNewName}" ही दोन्ही नावे एकाच व्यक्तीची म्हणजेच माझी स्वतःचीच आहेत. यात कोणताही फसवणुकीचा अथवा गैर उद्देश नाही.

६) वरील परिच्छेद १ ते ५ मधील सर्व मजकूर माझ्या सांगण्यावरून संगणकावर टाईप केला असून तो मी काळजीपूर्वक वाचून समजून घेतला आहे. त्यातील सर्व माहिती माझ्या व्यक्तिगत माहिती व समजुतीनुसार खरी व बरोबर आहे.

सदरचे प्रतिज्ञापत्र खरे असल्याबाबत खाली माझी स्वाक्षरी केली असे.

ठिकाण : {courtCity}
दिनांक :     /    /{caseYear}

                                                        ( {deponentNewName} )
                                                      प्रतिज्ञापत्र देणाराची सही
                                                  (पूर्वीचे नाव : {deponentOldName})

माझे समक्ष सत्य प्रतिज्ञेवर सही केली.

( नोटरी पब्लिक / कार्यकारी दंडाधिकारी )`
  }
];

export function getTemplateById(id: string): LegalTemplate | undefined {
  return TEMPLATES.find(t => t.id === id);
}

