import { db } from './db';

/**
 * Contract Number Generator
 * 
 * Generates contract numbers in the format:
 * - เล่มที่ (Volume): MM/YYYY (เดือน/ปี พ.ศ.) e.g., 01/2568
 * - เลขที่ (Document Number): YYMMXXXX where:
 *   - YY = Last 2 digits of Buddhist year (e.g., 68 for 2568)
 *   - MM = Month (01-12)
 *   - XXXX = Running number (0001, 0002, etc.) - resets every month
 */

const CONTRACT_PREFIX = 'CONTRACT';

export interface ContractNumber {
  volumeNumber: string;    // เล่มที่ e.g., "01/2568"
  documentNumber: string;  // เลขที่ e.g., "68010001"
}

/**
 * Get the current Buddhist year and month
 */
function getBuddhistDateTime(): { year: number; month: number; yearShort: string; monthPadded: string } {
  const now = new Date();
  const buddhistYear = now.getFullYear() + 543;
  const month = now.getMonth() + 1; // 1-12
  
  return {
    year: buddhistYear,
    month,
    yearShort: String(buddhistYear).slice(-2), // Last 2 digits e.g., "68"
    monthPadded: String(month).padStart(2, '0'), // e.g., "01"
  };
}

/**
 * Generate the next contract number
 * Uses database to track running numbers that reset monthly
 */
export async function generateContractNumber(): Promise<ContractNumber> {
  const { year, month, yearShort, monthPadded } = getBuddhistDateTime();
  
  // Use a transaction to ensure atomic increment
  const result = await db.$transaction(async (tx) => {
    // Find or create the sequence for this month
    let sequence = await tx.numberSequence.findUnique({
      where: {
        prefix_year_month: {
          prefix: CONTRACT_PREFIX,
          year,
          month,
        },
      },
    });

    if (!sequence) {
      // Create new sequence for this month, starting at 0
      sequence = await tx.numberSequence.create({
        data: {
          prefix: CONTRACT_PREFIX,
          year,
          month,
          lastNumber: 0,
        },
      });
    }

    // Increment and get the next number
    const nextNumber = sequence.lastNumber + 1;
    
    // Update the sequence
    await tx.numberSequence.update({
      where: { id: sequence.id },
      data: { lastNumber: nextNumber },
    });

    return nextNumber;
  });

  // Format the numbers
  const runningNumber = String(result).padStart(4, '0'); // e.g., "0001"
  
  return {
    volumeNumber: `${monthPadded}/${year}`, // e.g., "01/2568"
    documentNumber: `${yearShort}${monthPadded}${runningNumber}`, // e.g., "68010001"
  };
}

/**
 * Parse a document number back to its components
 * @param documentNumber - e.g., "68010001"
 * @returns { year: "68", month: "01", runningNumber: "0001" }
 */
export function parseDocumentNumber(documentNumber: string): { year: string; month: string; runningNumber: string } | null {
  if (documentNumber.length !== 8) return null;
  
  return {
    year: documentNumber.slice(0, 2),
    month: documentNumber.slice(2, 4),
    runningNumber: documentNumber.slice(4, 8),
  };
}

/**
 * Get the current contract number format info without incrementing
 * Useful for preview/display purposes
 */
export function getCurrentContractNumberFormat(): { volumeNumber: string; documentNumberPrefix: string } {
  const { year, yearShort, monthPadded } = getBuddhistDateTime();
  
  return {
    volumeNumber: `${monthPadded}/${year}`,
    documentNumberPrefix: `${yearShort}${monthPadded}`,
  };
}
