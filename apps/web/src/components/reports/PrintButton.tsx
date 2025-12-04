import { Printer } from 'lucide-react';

interface PrintButtonProps {
  contentId?: string;
  title?: string;
}

export function PrintButton({ contentId, title }: PrintButtonProps) {
  const handlePrint = () => {
    // Store current page title
    const originalTitle = document.title;
    
    if (title) {
      document.title = title;
    }

    if (contentId) {
      // Print specific content
      const content = document.getElementById(contentId);
      if (content) {
        const printWindow = window.open('', '_blank');
        if (printWindow) {
          printWindow.document.write(`
            <!DOCTYPE html>
            <html>
            <head>
              <title>${title || 'รายงาน'}</title>
              <style>
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
              </style>
            </head>
            <body>
              <div class="print-header">
                <h1>${title || 'รายงาน'}</h1>
                <p>วันที่พิมพ์: ${formatThaiDate(new Date())}</p>
              </div>
              ${content.innerHTML}
            </body>
            </html>
          `);
          printWindow.document.close();
          printWindow.focus();
          setTimeout(() => {
            printWindow.print();
            printWindow.close();
          }, 250);
        }
      }
    } else {
      // Print entire page
      window.print();
    }

    // Restore original title
    document.title = originalTitle;
  };

  return (
    <button
      type="button"
      onClick={handlePrint}
      className="inline-flex items-center px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 text-sm font-medium transition-colors"
    >
      <Printer className="w-4 h-4 mr-2" />
      พิมพ์
    </button>
  );
}

function formatThaiDate(date: Date): string {
  const thaiMonths = [
    'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
    'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'
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
