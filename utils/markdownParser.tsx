import React from 'react';

interface MarkdownRendererProps {
  content: string;
}

export const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({ content }) => {
  if (!content) return null;

  // Split content by lines
  const lines = content.split(/\r?\n/);

  return (
    <div className="space-y-2 select-text">
      {lines.map((line, idx) => {
        if (!line.trim()) {
          return <div key={idx} className="h-3" />;
        }

        let sizeClass = "text-sm text-gray-700 dark:text-gray-300 leading-relaxed";
        let isBoldLine = false;
        let cleanLine = line.trim();
        let alignVal: 'left' | 'center' | 'right' | 'justify' = 'left';

        // 1. Detección inicial de alineación
        if (cleanLine.startsWith('[c] ')) {
          alignVal = 'center';
          cleanLine = cleanLine.substring(4).trim();
        } else if (cleanLine.startsWith('[r] ')) {
          alignVal = 'right';
          cleanLine = cleanLine.substring(4).trim();
        } else if (cleanLine.startsWith('[j] ')) {
          alignVal = 'justify';
          cleanLine = cleanLine.substring(4).trim();
        } else if (cleanLine.startsWith('[l] ')) {
          alignVal = 'left';
          cleanLine = cleanLine.substring(4).trim();
        }

        // 2. Detección de encabezados
        if (cleanLine.startsWith('# ')) {
          sizeClass = "text-xl font-extrabold text-gray-900 dark:text-white mt-4 mb-2 block border-b border-gray-100 dark:border-dark-border/50 pb-1";
          isBoldLine = true;
          cleanLine = cleanLine.substring(2).trim();
        } else if (cleanLine.startsWith('## ')) {
          sizeClass = "text-lg font-bold text-gray-900 dark:text-white mt-3.5 mb-1.5 block";
          isBoldLine = true;
          cleanLine = cleanLine.substring(3).trim();
        } else if (cleanLine.startsWith('### ')) {
          sizeClass = "text-base font-bold text-gray-800 dark:text-gray-250 mt-3 mb-1 block";
          isBoldLine = true;
          cleanLine = cleanLine.substring(4).trim();
        }

        // 3. Segunda detección de alineación (si estaba después del encabezado)
        if (cleanLine.startsWith('[c] ')) {
          alignVal = 'center';
          cleanLine = cleanLine.substring(4).trim();
        } else if (cleanLine.startsWith('[r] ')) {
          alignVal = 'right';
          cleanLine = cleanLine.substring(4).trim();
        } else if (cleanLine.startsWith('[j] ')) {
          alignVal = 'justify';
          cleanLine = cleanLine.substring(4).trim();
        } else if (cleanLine.startsWith('[l] ')) {
          alignVal = 'left';
          cleanLine = cleanLine.substring(4).trim();
        }

        let alignClass = "text-left";
        if (alignVal === 'center') alignClass = "text-center";
        else if (alignVal === 'right') alignClass = "text-right";
        else if (alignVal === 'justify') alignClass = "text-justify";

        if (isBoldLine) {
          cleanLine = cleanLine.replace(/\*\*/g, '');
        }

        // Parse inline **bold** tags
        const parts = cleanLine.split('**');

        return (
          <span key={idx} className={`${sizeClass} ${alignClass} break-words block`}>
            {parts.map((part, pIdx) => {
              const isPartBold = isBoldLine || (pIdx % 2 === 1);
              return isPartBold ? (
                <strong key={pIdx} className="font-extrabold text-gray-950 dark:text-white">
                  {part}
                </strong>
              ) : (
                <React.Fragment key={pIdx}>{part}</React.Fragment>
              );
            })}
          </span>
        );
      })}
    </div>
  );
};
