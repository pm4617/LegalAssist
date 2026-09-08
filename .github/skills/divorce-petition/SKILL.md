---
name: divorce-petition
description: "Create Marathi divorce petition documents under Section 13B of the Hindu Marriage Act for Indian courts. Use when drafting mutual consent divorce petitions, generating .docx files, filling in client details, or following the standard petition format used by Adv. Sachin Mahajan's firm."
argument-hint: "Provide client details or say 'generate petition' to start"
---

# Divorce Petition — Section 13B (Hindu Marriage Act, 1955)

## Purpose

Draft and generate a complete Marathi mutual consent divorce petition (घटस्फोट अर्ज) as a `.docx` file, formatted for courts in the Jalgaon/Dhule division.

## When to Use

- User asks to create / draft a divorce petition
- User provides client details (husband, wife, marriage date, etc.)
- User wants to generate a Section 13B petition document
- User says "petition", "घटस्फोट", "13B", "divorce petition"

## Required Information Checklist

Before generating, ensure all of the following are collected (use `vscode_askQuestions`):

| Field                | Details                                                |
| -------------------- | ------------------------------------------------------ |
| Court name           | e.g., अमळनेर / जळगाव / धुळे                            |
| Husband full name    | With father's name (e.g., Nitin Madhukar Mahajan)      |
| Husband age          | In years                                               |
| Husband occupation   | Service / Farming / Business etc.                      |
| Husband address      | Village, Taluka, District                              |
| Wife current name    | With husband's name (e.g., Sanjeevani Nitin Mahajan)   |
| Wife maiden name     | Pre-marriage name (e.g., Sanjeevani Radhshyam Mahajan) |
| Wife age             | In years                                               |
| Wife occupation      | Service / Homemaker etc.                               |
| Wife current address | With "Care of / द्वारा" if at parents' home            |
| Marriage date        | dd/mm/yyyy                                             |
| Marriage place       | City/Village                                           |
| Children             | Names + ages, or "No children"                         |
| Separation date      | Month/Year at minimum                                  |
| Child custody        | Husband / Wife / Joint / NA                            |
| Alimony amount       | Rs. amount or "Nil"                                    |
| Settlement meeting   | Date + place, or "No"                                  |

## Procedure

### 1. Read Reference Documents

```
Read ReferenceData/*.docx files to confirm current firm format
```

### 2. Collect Missing Details

Ask user for any missing fields from the checklist above using `vscode_askQuestions`.

### 3. Run the Generation Script

Execute the petition generator script:

```
[generate_petition.py](./assets/generate_petition.py)
```

Pass all collected details as variables at the top of the script before running.

### 4. Save Output

Save to project root as: `{HusbandSurname}_{WifeName}_Divorce_Petition_13B.docx`

### 5. Report Blank Fields

List any fields that were left blank and must be filled before filing:

- HMP Case Number
- Exact separation date (if only year given)
- Applicant No. 2 advocate name

## Key Legal Clauses to Always Include

1. **Marriage facts** — Date, place, Hindu rites
2. **No pregnancy** — अर्जदार क्र. २ ही आज रोजी गर्भवती नाही
3. **Separation period** — Must be 1+ year for 13B eligibility
4. **Reconciliation attempts** — Family/relatives tried but failed
5. **Settlement terms** — Alimony, custody, property, no-cases clause
6. **High Court guidelines** — Religion, name change, no other petition filed
7. **Jurisdiction** — Why this court has authority
8. **Prayer** — Request to dissolve marriage

## Field References

See [petition_fields.md](./references/petition_fields.md) for standard Marathi text for each section.
