import React, { useState, useEffect } from 'react';
import { X, Sparkles, FileText, Loader2 } from 'lucide-react';
import { LegalTemplate, ClientFacts } from '../types';
import { convertToDevanagari } from '../utils/transliterate';

interface ClientNotesModalProps {
  isOpen: boolean;
  onClose: () => void;
  onExtract: (notes: string) => Promise<void>;
  isLoading: boolean;
  activeTemplate?: LegalTemplate;
  facts?: ClientFacts;
}

export const ClientNotesModal: React.FC<ClientNotesModalProps> = ({
  isOpen,
  onClose,
  onExtract,
  isLoading,
  activeTemplate,
  facts,
}) => {
  const getDefaultNotes = (template?: LegalTemplate, currentFacts?: ClientFacts): string => {
    if (!template) return '';

    // If template has fields, generate key-value lines for all fields with latest inputted values
    if (template.fields && template.fields.length > 0) {
      return template.fields
        .map((f) => {
          const label = f.label || f.key;
          const labelMrPart = f.labelMr ? ` (${f.labelMr})` : '';
          const fullLabel = `${label}${labelMrPart}`;

          let val = currentFacts ? (currentFacts as any)[f.key] : undefined;
          if (val === undefined || val === null || String(val).trim() === '') {
            val = f.defaultValue || f.placeholder || '';
          }
          return `${fullLabel}: ${val}`;
        })
        .join('\n');
    }

    const idLower = (template.id || '').toLowerCase();
    const titleLower = (template.title || '').toLowerCase();
    const titleMrLower = (template.titleMr || '').toLowerCase();

    // Presets with current facts overrides if present
    if (idLower.includes('heirship') || titleLower.includes('heirship') || titleMrLower.includes('वारस')) {
      return `Deceased Person Name: ${currentFacts?.party2Name || 'रसिकलाल उत्तमचंद शहा'}
Date of Death: ${currentFacts?.separationDate || '12/04/2024'}
Place of Death: ${currentFacts?.courtCity || 'अमळनेर'}
Applicant Name: ${currentFacts?.party1Name || 'रमेश रसिकलाल शहा'}
Relation with Deceased: मुलगा
Legal Heirs Details: १. रमेश रसिकलाल शहा (मुलगा), २. सुनीता विजय जैन (मुलगी)
Property Particulars: अमळनेर येथील नगर परिषद मालमत्ता क्र. १२३/A`;
    }

    if (idLower.includes('bail') || titleLower.includes('bail') || titleMrLower.includes('जामीन')) {
      return `Court: ${currentFacts?.courtName || 'Me. Judicial Magistrate First Class, Amalner'}
Crime No.: ${currentFacts?.hmpNo || 'CR 145 / 2026'}
Police Station: Amalner Police Station
Accused Name: ${currentFacts?.party1Name || 'Nitin Madhukar Patil'}, Age ${currentFacts?.party1Age || '28'}
Offences: IPC Sec 324, 504, 506, 34
Arrest Date: ${currentFacts?.separationDate || '02/09/2026'}
Bail Sureties: Willing to furnish solvent surety of Amalner resident`;
    }

    if (idLower.includes('name-change') || titleLower.includes('name change') || titleMrLower.includes('नावात बदल')) {
      return `Old Name: ${currentFacts?.party1Name || 'Nitin Madhukar Patil'}
New Name: ${currentFacts?.party2Name || 'Nitin Madhukar Mahajan'}
Father's Name: ${currentFacts?.party2Guardian || 'Madhukar Dagdu Mahajan'}
Age: ${currentFacts?.party1Age || '32'}, service in private company, residing at Amalner, Jalgaon.
Reason for change: Numerology, astrology and personal preference.
ID Proof: Aadhaar Card and PAN Card.`;
    }

    if (idLower.includes('nda') || titleLower.includes('agreement') || titleMrLower.includes('करार')) {
      return `First Party: ${currentFacts?.party1Name || 'Acme Technologies Pvt. Ltd., registered office at 101 Tech Park, Pune.'}
Second Party: ${currentFacts?.party2Name || 'Apex Legal Solutions LLP, registered office at 402 Court Chambers, Mumbai.'}
Purpose: Evaluating software integration and legal advisory collaboration.
Term: 3 years.
Governing Law: ${currentFacts?.governingLaw || 'Laws of India, exclusive jurisdiction at Mumbai.'}`;
    }

    if (idLower.includes('notice') || titleLower.includes('notice') || titleMrLower.includes('नोटीस')) {
      return `Client: ${currentFacts?.party1Name || 'M/s. Jalgaon Agro Equipments Ltd., Amalner.'}
Defaulter: ${currentFacts?.party2Name || 'Rajesh Enterprises, Prop. Rajesh Patil, MIDC Area, Jalgaon.'}
Outstanding Amount: ${currentFacts?.outstandingAmount || 'Rs. 4,50,000/- against Tax Invoice No. 2024/89.'}
Notice Period: 15 days to pay or face legal action under Section 138 NI Act.`;
    }

    if (idLower.includes('period-waive') || titleLower.includes('waive') || titleMrLower.includes('मुदत माफी')) {
      return `Court: ${currentFacts?.courtName || 'Civil Judge Senior Division, Amalner.'}
HMP Case No.: ${currentFacts?.hmpNo || '142 / 2026.'}
Husband: ${currentFacts?.party1Name || 'Nitin Madhukar Mahajan.'}
Wife: ${currentFacts?.party2Name || 'Sanjeevani Nitin Mahajan.'}
Separated for: ${currentFacts?.separationYears || 'more than 2 years.'}
All alimony, custody and settlements fully resolved.`;
    }

    if (idLower.includes('divorce') || titleLower.includes('divorce') || titleMrLower.includes('घटस्फोट')) {
      return `Client: ${currentFacts?.party1Name || 'Nitin Madhukar Mahajan'}, age ${currentFacts?.party1Age || '35'}, service in private company, residing at ${currentFacts?.party1Address || 'Amalner, Jalgaon'}.
Wife: ${currentFacts?.party2Name || 'Sanjeevani Nitin Mahajan'} (maiden name: ${currentFacts?.party2MaidenName || 'Sanjeevani Radheshyam Mahajan'}), age ${currentFacts?.party2Age || '30'}, homemaker, residing with father ${currentFacts?.party2Guardian || 'Radheshyam Mahajan'} at ${currentFacts?.party2Address || 'Akulkheda, Taluka Chopda, Dist Jalgaon'}.
Married on ${currentFacts?.marriageDate || '01/05/2021'} at ${currentFacts?.marriagePlace || 'Jalgaon'}.
Children: ${currentFacts?.childrenDetails || 'No children.'}
Separated since ${currentFacts?.separationDate || '15/06/2022'} (${currentFacts?.separationYears || 'approx 3 years'}).
Settlement: One-time alimony of Rs. ${currentFacts?.alimonyAmount || '2,00,000/-'} (${currentFacts?.alimonyWords || 'Two Lakh Rupees'}) agreed. All stridhan and household items exchanged. No cases filed.`;
    }

    return `Client Name: ${currentFacts?.party1Name || 'Nitin Madhukar Mahajan'}
Opposite Party: ${currentFacts?.party2Name || 'Sanjeevani Nitin Mahajan'}
Case Date: ${currentFacts?.effectiveDate || '03/09/2026'}
Details: Sample raw interview details for ${template.title || 'legal draft'}.`;
  };

  const [notes, setNotes] = useState<string>(() => getDefaultNotes(activeTemplate, facts));
  const [isTransliterating, setIsTransliterating] = useState(false);

  // Update default notes whenever active template changes or modal opens
  useEffect(() => {
    if (isOpen && activeTemplate) {
      setNotes(getDefaultNotes(activeTemplate, facts));
    }
  }, [isOpen, activeTemplate?.id]);

  if (!isOpen) return null;

  // Transliterate values after colon (:) to Devanagari Marathi script
  const handleTransliterateNotesValues = async () => {
    if (!notes || !notes.trim()) return;
    setIsTransliterating(true);
    try {
      const lines = notes.split('\n');
      const convertedLines: string[] = [];

      for (const line of lines) {
        const colonIdx = line.indexOf(':');
        if (colonIdx !== -1) {
          const keyPart = line.substring(0, colonIdx);
          const valPart = line.substring(colonIdx + 1);

          if (valPart.trim()) {
            const convertedVal = await convertToDevanagari(valPart);
            const hasSpace = valPart.startsWith(' ');
            convertedLines.push(`${keyPart}:${hasSpace ? ' ' : ''}${convertedVal.trim()}`);
          } else {
            convertedLines.push(line);
          }
        } else if (line.trim()) {
          const convertedLine = await convertToDevanagari(line);
          convertedLines.push(convertedLine);
        } else {
          convertedLines.push(line);
        }
      }

      setNotes(convertedLines.join('\n'));
    } catch (e) {
      console.error('Transliterate notes error:', e);
    } finally {
      setIsTransliterating(false);
    }
  };

  const handleExtract = async () => {
    if (!notes.trim()) return;
    await onExtract(notes);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-150">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-800/50">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-indigo-400" />
            <div>
              <h3 className="font-semibold text-white">Extract Details & Auto-Populate Draft</h3>
              <p className="text-xs text-indigo-300 font-medium">{activeTemplate?.title}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <p className="text-sm text-slate-400 leading-relaxed">
            Paste raw lawyer interview notes, WhatsApp client details, or handwritten case summaries in Marathi or English. The AI Copilot will parse all party names, addresses, dates, marriage facts, and settlement terms into your form and document.
          </p>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-semibold text-slate-300">
                Raw Interview Notes / Key-Value Details
              </label>
              <button
                type="button"
                onClick={handleTransliterateNotesValues}
                disabled={isTransliterating || !notes.trim()}
                className="text-[11px] px-1.5 py-0.5 bg-indigo-950 hover:bg-indigo-900 disabled:opacity-40 text-indigo-300 border border-indigo-700/60 rounded font-bold font-marathi shadow-sm transition flex items-center gap-1 cursor-pointer"
                title="Convert values (after ':') to Marathi Devanagari"
              >
                {isTransliterating ? '...' : 'म'}
              </button>
            </div>

            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={8}
              className="w-full px-4 py-3 bg-slate-800/80 border border-slate-700 rounded-xl text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition font-marathi leading-relaxed"
              placeholder="Enter raw notes here..."
            />
          </div>
        </div>

        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-800 bg-slate-800/30">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setNotes(getDefaultNotes(activeTemplate))}
              className="text-xs text-indigo-400 hover:text-indigo-300 font-medium transition"
              title="Reset notes to sample draft template details"
            >
              Load Sample Notes
            </button>
            <span className="text-slate-700">|</span>
            <button
              type="button"
              onClick={() => setNotes('')}
              className="text-xs text-slate-400 hover:text-white transition"
            >
              Clear Text
            </button>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-sm font-medium text-slate-400 hover:text-white hover:bg-slate-800 transition"
            >
              Cancel
            </button>
            <button
              onClick={handleExtract}
              disabled={isLoading || !notes.trim()}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 shadow-lg shadow-indigo-600/30 transition"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Extracting...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  Auto-Populate Draft
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

