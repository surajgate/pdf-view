import React, { useState, useEffect, useRef } from "react";
import { Document, Page, pdfjs } from "react-pdf";

pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;
const pdfUrl = "https://research.google.com/pubs/archive/44678.pdf";

const App: React.FC = () => {
  const [pageNumber, setPageNumber] = useState<number>(1);
  const [numPages, setNumPages] = useState<number>(0);
  const [highlights, setHighlights] = useState<any[]>([]);
  const pdfRef = useRef<HTMLDivElement>(null);
  const highlightText = "Abstract"; // Text to highlight

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newPageNumber = Number(e.target.value) || 1;
    setPageNumber(Math.min(newPageNumber, numPages));
  };

  const onLoadSuccess = ({ numPages }: { numPages: number }) => {
    setNumPages(numPages);
  };

  const highlightTextInPage = async (text: string, page: number) => {
    const loadingTask = pdfjs.getDocument(`http://localhost:5000/proxy?url=${encodeURIComponent(pdfUrl)}`);
    const pdf = await loadingTask.promise;
    const pdfPage = await pdf.getPage(page);
    const textContent = await pdfPage.getTextContent();
    
    const scale = 1;
    const viewport = pdfPage.getViewport({ scale });

    const newHighlights = textContent.items.flatMap((item: any) => {
      if (item.str.toLowerCase().includes(text.toLowerCase())) {
        return [{
          x: item.transform[4],
          y: viewport.height - item.transform[5] - item.height,
          width: item.width,
          height: item.height
        }];
      }
      return [];
    });

    setHighlights(newHighlights);
  };

  useEffect(() => {
    if (pageNumber && highlightText) {
      highlightTextInPage(highlightText, pageNumber);
    }
  }, [pageNumber, highlightText]);

  return (
    <div>
      <form onSubmit={(e) => e.preventDefault()}>
        <input
          type="number"
          value={pageNumber}
          onChange={handleChange}
          min="1"
          max={numPages}
        />
        <button
          type="button"
          onClick={() => highlightTextInPage(highlightText, pageNumber)}
        >
          Highlight Text
        </button>
      </form>
      <div ref={pdfRef} style={{ position: 'relative', height: "600px", overflow: "auto" }}>
        <Document
          file={`http://localhost:5000/proxy?url=${encodeURIComponent(pdfUrl)}`}
          onLoadSuccess={onLoadSuccess}
        >
          <Page
            pageNumber={pageNumber}
            renderTextLayer={false}
            renderAnnotationLayer={false}
          />
        </Document>
        <svg
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            pointerEvents: 'none'
          }}
        >
          {highlights.map((highlight, index) => (
            <rect
              key={index}
              x={highlight.x}
              y={highlight.y}
              width={highlight.width}
              height={highlight.height}
              fill="yellow"
              opacity={0.4}
            />
          ))}
        </svg>
      </div>
    </div>
  );
};

export default App;