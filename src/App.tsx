import { getDocument } from "pdfjs-dist";
import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
} from "react";
import { Document, Page, pdfjs } from "react-pdf";
import stringSimilarity from "string-similarity";

import "react-pdf/dist/Page/TextLayer.css";

pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;
const url = "https://research.google.com/pubs/archive/44678.pdf";

interface PDFTextItem {
  dir: string;
  fontName: string;
  hasEOL: boolean;
  height: number;
  str: string;
  transform: number[];
  width: number;
}

const App: React.FC = () => {
  const [numPages, setNumPages] = useState<number>(0);
  const [isLoading, setIsLoading] = useState(true);
  const [renderedPages, setRenderedPages] = useState<number[]>([]);
  const [textItems, setTextItems] = useState<PDFTextItem[]>([]);

  const pdfPreviewParams = {
    pageNumber: 3,
    quote: "Second, we show that our probabilistic predictions lead to imp",
  };
  const canvasRefs = useRef<(HTMLCanvasElement | null)[]>([]);

  const pdfRef = useRef<HTMLDivElement>(null);

  const pdfUrl = `http://localhost:5000/proxy?url=${encodeURIComponent(url)}`;

  const scrollToPage = (pageNumber: number) => {
    if (pdfRef.current) {
      const pageHeight =
        pdfRef.current.querySelector(".react-pdf__Page")?.clientHeight || 0;
      const scrollPosition = (pageNumber - 1) * pageHeight;
      pdfRef.current.scrollTo({
        top: scrollPosition,
        behavior: "smooth",
      });
    }
  };

  const onLoadSuccess = ({ numPages }: { numPages: number }) => {
    setNumPages(numPages);
  };

  const onRenderSuccess = (pageNumber: number) => {
    setRenderedPages((prev) => [...new Set([...prev, pageNumber])]);
  };

  const loadPdfText = useCallback(async () => {
    const loadingTask = getDocument(pdfUrl);
    const pdf = await loadingTask.promise;
    const page = await pdf.getPage(pdfPreviewParams.pageNumber);
    const textContent = await page.getTextContent();
    setTextItems(textContent.items as PDFTextItem[]);
  }, []);

  const processedTextItems = useMemo(() => {
    const lines: PDFTextItem[][] = [];
    let currentLine: PDFTextItem[] = [];
    textItems.forEach((item) => {
      currentLine.push(item);
      if (item.hasEOL) {
        lines.push(currentLine);
        currentLine = [];
      }
    });
    if (currentLine.length > 0) lines.push(currentLine);

    return lines;
  }, [textItems]);

  const prepareTextLines = useMemo(() => {
    const lines: PDFTextItem[][] = [];
    let currentLine: PDFTextItem[] = [];
    textItems.forEach((item) => {
      currentLine.push(item);
      if (item.hasEOL) {
        lines.push(currentLine);
        currentLine = [];
      }
    });
    if (currentLine.length > 0) lines.push(currentLine);
    return lines;
  }, [textItems]);

  const getTextSegment = useCallback(
    (line: PDFTextItem[]) => line.map((item) => item.str).join(" "),
    []
  );

  const findBestMatch = useCallback(
    (lines: PDFTextItem[][], quote: string) => {
      let bestMatch = { score: -1, lines: [] as PDFTextItem[][] };
      const normalizedQuote = quote.toLowerCase().trim();

      for (let i = 0; i < lines.length; i++) {
        let combinedText = "";
        for (let j = i; j < lines.length; j++) {
          combinedText +=
            (j > i ? " " : "") + getTextSegment(lines[j]).toLowerCase().trim();
          const score = stringSimilarity.compareTwoStrings(
            combinedText,
            normalizedQuote
          );
          if (score > bestMatch.score) {
            bestMatch = { score, lines: lines.slice(i, j + 1) };
          }
          if (combinedText.length > normalizedQuote.length * 1.5) break;
        }
      }
      return bestMatch;
    },
    [getTextSegment]
  );

  const drawHighlight = useCallback(
    (
      context: CanvasRenderingContext2D,
      canvasHeight: number,
      items: PDFTextItem[]
    ) => {
      context.fillStyle = "rgba(255, 255, 0, 0.3)";
      items.forEach((item) => {
        const [x, y, w, h] = [
          item.transform[4],
          canvasHeight - item.transform[5] - item.height,
          item.width,
          item.height,
        ];
        context.fillRect(x, y, w, h);
      });
    },
    []
  );

  const applyHighlight = useCallback(() => {
    const canvas = canvasRefs.current[pdfPreviewParams.pageNumber - 1];
    if (!canvas || textItems.length === 0) return;

    const context = canvas.getContext("2d");
    if (!context) return;

    const pdfPage = pdfRef.current?.querySelector(
      `.react-pdf__Page[data-page-number="${pdfPreviewParams.pageNumber}"]`
    ) as HTMLElement | null;

    if (!pdfPage) {
      console.error("PDF page element not found");
      return;
    }

    canvas.width = pdfPage.clientWidth;
    canvas.height = pdfPage.clientHeight;
    context.clearRect(0, 0, canvas.width, canvas.height);

    const bestMatch = findBestMatch(prepareTextLines, pdfPreviewParams.quote);

    if (bestMatch.lines.length === 0) {
      console.error("No close match found for the quote");
      return;
    }

    drawHighlight(context, canvas.height, bestMatch.lines.flat());
  }, [
    textItems,
    prepareTextLines,
    drawHighlight,
    findBestMatch,
    pdfPreviewParams.pageNumber,
    pdfPreviewParams.quote,
  ]);

  // Memoize the page components to prevent unnecessary re-renders
  const pageComponents = useMemo(
    () =>
      Array.from(new Array(numPages), (_, index) => (
        <div key={`page_${index + 1}`} style={{ position: "relative" }}>
          <Page
            pageNumber={index + 1}
            renderTextLayer={true}
            renderAnnotationLayer={false}
            onRenderSuccess={() => onRenderSuccess(index + 1)}
          />
          <canvas
            ref={(canvas) => {
              if (canvas) canvasRefs.current[index] = canvas;
            }}
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              pointerEvents: "none",
            }}
          />
        </div>
      )),
    [numPages, onRenderSuccess]
  );

  useEffect(() => {
    if (numPages > 0 && renderedPages.length === numPages) {
      setIsLoading(false);
      setTimeout(() => {
        scrollToPage(pdfPreviewParams.pageNumber);
      }, 500);
    }
    if (
      renderedPages.includes(pdfPreviewParams.pageNumber) &&
      textItems.length === 0
    )
      loadPdfText();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [numPages, renderedPages, pdfPreviewParams.pageNumber]);

  useEffect(() => {
    if (textItems.length !== 0) {
      applyHighlight();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [textItems]);

  return (
    <div
      id="pdf-preview"
      data-testid="pdf-preview"
      ref={pdfRef}
      style={{
        position: "relative",
        width: "100%",
        display: "flex",
        justifyContent: "center",
        height: "100vh",
        overflow: "auto",
        scrollbarWidth: "none",
        msOverflowStyle: "none",
      }}
    >
      {isLoading && (
        <div
          style={{
            position: "absolute",
            minHeight: "90%",
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            alignItems: "center",
            backgroundColor: "rgba(255, 255, 255, 1.0)",
            zIndex: 999,
            width: "100%",
          }}
        >
          <div style={{ position: "relative", display: "inline-flex" }}>
            <p>Loading...</p>
            <div
              style={{
                top: 0,
                left: 0,
                bottom: 0,
                right: 0,
                position: "absolute",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <p>{`${Math.round((renderedPages.length / numPages) * 100)}%`}</p>
            </div>
          </div>
          <p>Loading your PDF, this won't take long.</p>
        </div>
      )}
      <div>
        <Document
          file={pdfUrl}
          onLoadSuccess={onLoadSuccess}
          loading={
            <>
              <div
                style={{
                  display: "flex",
                  justifyContent: "center",
                  alignItems: "center",
                  height: "85vh",
                }}
              >
                <p>Loading your PDF, this won't take long.</p>
              </div>
            </>
          }
          error={
            <>
              <div
                style={{
                  display: "flex",
                  justifyContent: "center",
                  alignItems: "center",
                  height: "85vh",
                }}
              >
                <p>Something went wrong while loading the PDF.</p>
              </div>
            </>
          }
        >
          {pageComponents}
          {/* {Array.from(new Array(numPages), (_el, index) => (
             <div key={`page_${index + 1}`} style={{ position: 'relative' }}>
               <Page
                 key={`page_${index + 1}`}
                 pageNumber={index + 1}
                 renderTextLayer={true}
                 renderAnnotationLayer={false}
                 onRenderSuccess={() => onRenderSuccess(index + 1)}
               />
               <canvas
                 ref={(canvas) => {
                   if (canvas) canvasRefs.current[index] = canvas;
                 }}
                 style={{
                   position: 'absolute',
                   top: 0,
                   left: 0,
                   pointerEvents: 'none'
                 }}
               />
             </div>
           ))} */}
        </Document>
      </div>
    </div>
  );
};

export default App;
