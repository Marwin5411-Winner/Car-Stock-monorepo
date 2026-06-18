import { Printer } from 'lucide-react';
import { useState } from 'react';

interface PrintButtonProps {
  contentId?: string;
  title?: string;
  /**
   * When provided, the button prints this server-generated PDF so the printout
   * matches the "ส่งออก PDF" output exactly, instead of printing the page HTML.
   * Takes precedence over contentId.
   */
  getPdf?: () => Promise<Blob>;
  disabled?: boolean;
}

const PRINT_STYLE_RULES = `
  body {
    font-family: 'Sarabun', sans-serif;
    margin: 20px;
    color: #333;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    margin-top: 20px;
  }
  th, td {
    border: 1px solid #ddd;
    padding: 8px;
    text-align: left;
  }
  th {
    background-color: #f5f5f5;
    font-weight: bold;
  }
  tr:nth-child(even) {
    background-color: #f9f9f9;
  }
  .summary-card {
    display: inline-block;
    margin: 10px;
    padding: 15px;
    border: 1px solid #ddd;
    border-radius: 8px;
    min-width: 150px;
  }
  .summary-title {
    font-size: 12px;
    color: #666;
  }
  .summary-value {
    font-size: 20px;
    font-weight: bold;
    color: #333;
  }
  .print-header {
    text-align: center;
    margin-bottom: 20px;
  }
  .print-header h1 {
    margin: 0;
    font-size: 24px;
  }
  .print-header p {
    margin: 5px 0;
    color: #666;
  }
  @media print {
    body { margin: 0; }
    .no-print { display: none; }
  }
`;

export function PrintButton({ contentId, title, getPdf, disabled }: PrintButtonProps) {
  const [preparing, setPreparing] = useState(false);

  // Load the server PDF into a hidden iframe and open the print dialog on it,
  // so what prints is byte-for-byte the same document as "ส่งออก PDF".
  const printPdfBlob = (blob: Blob) => {
    const url = URL.createObjectURL(blob);
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    iframe.style.visibility = 'hidden';
    iframe.src = url;
    iframe.onload = () => {
      try {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
      } catch {
        // Some browsers block programmatic iframe printing of PDFs — fall back
        // to opening the PDF in a new tab so the user can print from the viewer.
        window.open(url, '_blank');
      }
      // Revoke late so the print dialog has time to read the document.
      window.setTimeout(() => {
        iframe.remove();
        URL.revokeObjectURL(url);
      }, 60_000);
    };
    document.body.appendChild(iframe);
  };

  const handlePrintPdf = async () => {
    if (!getPdf) return;
    try {
      setPreparing(true);
      const blob = await getPdf();
      printPdfBlob(blob);
    } catch (err) {
      console.error('Failed to prepare PDF for printing:', err);
    } finally {
      setPreparing(false);
    }
  };

  const handlePrint = () => {
    const originalTitle = document.title;

    if (title) {
      document.title = title;
    }

    if (contentId) {
      const content = document.getElementById(contentId);
      if (content) {
        const printWindow = window.open('', '_blank');
        if (printWindow) {
          const doc = printWindow.document;
          const headerTitle = title || 'รายงาน';

          // Build the print document with DOM APIs rather than string
          // concatenation. This keeps any user-controlled data (report rows,
          // customer names, etc.) as text nodes — no HTML injection surface.
          doc.title = headerTitle;

          const style = doc.createElement('style');
          style.textContent = PRINT_STYLE_RULES;
          doc.head.appendChild(style);

          const headerDiv = doc.createElement('div');
          headerDiv.className = 'print-header';

          const h1 = doc.createElement('h1');
          h1.textContent = headerTitle;
          headerDiv.appendChild(h1);

          const dateP = doc.createElement('p');
          dateP.textContent = `วันที่พิมพ์: ${formatThaiDate(new Date())}`;
          headerDiv.appendChild(dateP);

          doc.body.appendChild(headerDiv);

          // Deep-clone the live report node into the print window. The clone
          // carries over attributes and text nodes exactly but bypasses the
          // XSS risk of innerHTML concatenation.
          doc.body.appendChild(doc.importNode(content, true));

          printWindow.focus();
          setTimeout(() => {
            printWindow.print();
            printWindow.close();
          }, 250);
        }
      }
    } else {
      window.print();
    }

    document.title = originalTitle;
  };

  return (
    <button
      type="button"
      onClick={getPdf ? handlePrintPdf : handlePrint}
      disabled={disabled || preparing}
      className="inline-flex items-center px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 text-sm font-medium transition-colors disabled:opacity-50"
    >
      <Printer className="w-4 h-4 mr-2" />
      {preparing ? 'กำลังเตรียม...' : 'พิมพ์'}
    </button>
  );
}

function formatThaiDate(date: Date): string {
  const thaiMonths = [
    'มกราคม',
    'กุมภาพันธ์',
    'มีนาคม',
    'เมษายน',
    'พฤษภาคม',
    'มิถุนายน',
    'กรกฎาคม',
    'สิงหาคม',
    'กันยายน',
    'ตุลาคม',
    'พฤศจิกายน',
    'ธันวาคม',
  ];

  const day = date.getDate();
  const month = thaiMonths[date.getMonth()];
  const year = date.getFullYear() + 543; // Convert to Buddhist Era

  return `${day} ${month} ${year}`;
}

// Print-friendly styles to add to the page
export const printStyles = `
  @media print {
    .no-print {
      display: none !important;
    }

    .print-only {
      display: block !important;
    }

    body {
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    .page-break {
      page-break-before: always;
    }

    table {
      page-break-inside: auto;
    }

    tr {
      page-break-inside: avoid;
      page-break-after: auto;
    }
  }
`;
