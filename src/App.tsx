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

import debounce from "lodash/debounce";
pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;
const url = "https://research.google.com/pubs/archive/44678.pdf";

const PAGES_TO_LOAD = 5;

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

  const [visiblePages, setVisiblePages] = useState<number[]>([]);
  const observerRef = useRef<IntersectionObserver | null>(null);

  const pdfPreviewParams = {
    pageNumber: 144,
    quote: "Second, we show that our probabilistic predictions lead to imp",
  };
  const canvasRefs = useRef<(HTMLCanvasElement | null)[]>([]);

  const pdfRef = useRef<HTMLDivElement>(null);

  // const pdfUrl = `http://localhost:5000/proxy?url=${encodeURIComponent(url)}`;
  const pdfUrl = `http://localhost:5000/pdf`;

  // const scrollToPage = (pageNumber: number) => {
  //   if (pdfRef.current) {
  //     const pageHeight =
  //       pdfRef.current.querySelector(".react-pdf__Page")?.clientHeight || 0;
  //     const scrollPosition = (pageNumber - 1) * pageHeight;
  //     pdfRef.current.scrollTo({
  //       top: scrollPosition,
  //       behavior: "smooth",
  //     });
  //   }
  // };

  const loadVisiblePages = useCallback(
    (centerPage: number) => {
      const start = Math.max(1, centerPage - PAGES_TO_LOAD);
      const end = Math.min(numPages, centerPage + PAGES_TO_LOAD);
      setVisiblePages((prevPages) => {
        const newPages = Array.from(
          { length: end - start + 1 },
          (_, i) => start + i
        );
        return [...new Set([...prevPages, ...newPages])].sort((a, b) => a - b);
      });
    },
    [numPages]
  );

  const handleScroll = useCallback(
    debounce(() => {
      if (!pdfRef.current) return;

      const scrollPosition = pdfRef.current.scrollTop;
      const containerHeight = pdfRef.current.clientHeight;
      const pageHeight =
        pdfRef.current.querySelector(".react-pdf__Page")?.clientHeight || 0;
      if (pageHeight === 0) return;

      const currentPage = Math.floor(scrollPosition / pageHeight) + 1;
      const visiblePages = Math.ceil(containerHeight / pageHeight);

      loadVisiblePages(currentPage);

      // Load more pages if we're near the top or bottom
      if (currentPage - PAGES_TO_LOAD <= 1) {
        loadVisiblePages(Math.max(1, currentPage - PAGES_TO_LOAD));
      } else if (currentPage + PAGES_TO_LOAD >= numPages) {
        loadVisiblePages(Math.min(numPages, currentPage + PAGES_TO_LOAD));
      }
    }, 200),
    [loadVisiblePages, numPages]
  );

  const onLoadSuccess = ({ numPages }: { numPages: number }) => {
    setNumPages(numPages);
    setIsLoading(false);
    // setTimeout(() => {
    //   scrollToPage(pdfPreviewParams.pageNumber);
    // }, 500);
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

  useEffect(() => {
    const pdfElement = pdfRef.current;
    if (pdfElement) {
      pdfElement.addEventListener("scroll", handleScroll);
    }
    return () => {
      if (pdfElement) {
        pdfElement.removeEventListener("scroll", handleScroll);
      }
    };
  }, [handleScroll]);

  useEffect(() => {
    if (numPages > 0) {
      loadVisiblePages(pdfPreviewParams.pageNumber);
    }
  }, [numPages, pdfPreviewParams.pageNumber, loadVisiblePages]);

  useEffect(() => {
    if (!isLoading && pdfRef.current) {
      const pageHeight =
        pdfRef.current.querySelector(".react-pdf__Page")?.clientHeight || 0;
      if (pageHeight > 0) {
        pdfRef.current.scrollTop =
          (pdfPreviewParams.pageNumber - 1) * pageHeight;
      }
    }
  }, [isLoading, pdfPreviewParams.pageNumber]);

  useEffect(() => {
    observerRef.current = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const pageNumber = parseInt(
              entry.target.getAttribute("data-page-number") || "0",
              10
            );
            if (pageNumber && !renderedPages.includes(pageNumber)) {
              onRenderSuccess(pageNumber);
            }
          }
        });
      },
      { root: pdfRef.current, rootMargin: "200px", threshold: 0.1 }
    );

    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
    };
  }, [renderedPages]);

  // Memoize the page components to prevent unnecessary re-renders
  const pageComponents = useMemo(
    () =>
      visiblePages.map((pageNumber) => (
        <div
          key={`page_${pageNumber}`}
          style={{ position: "relative" }}
          data-page-number={pageNumber}
        >
          <Page
            pageNumber={pageNumber}
            renderTextLayer={true}
            renderAnnotationLayer={false}
            onRenderSuccess={() => onRenderSuccess(pageNumber)}
          />
          <canvas
            ref={(canvas) => {
              if (canvas) canvasRefs.current[pageNumber - 1] = canvas;
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
    [visiblePages]
  );

  useEffect(() => {
    if (observerRef.current) {
      document.querySelectorAll("[data-page-number]").forEach((el) => {
        observerRef.current?.observe(el);
      });
    }
  }, [pageComponents]);

  useEffect(() => {
    // if (numPages > 0 && renderedPages.length === numPages) {
    //   setIsLoading(false);
    //   setTimeout(() => {
    //     scrollToPage(pdfPreviewParams.pageNumber);
    //   }, 500);
    // }
    // if (
    //   renderedPages.includes(pdfPreviewParams.pageNumber) &&
    //   textItems.length === 0
    // )
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
            ></div>
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
