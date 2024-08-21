// React imports.
import { useState, useRef, useEffect, useCallback, useMemo } from 'react';

// MUI imports.
import { Box, CircularProgress, Typography } from '@mui/material';

// React PDF library imports.
import { Document, Page, pdfjs } from 'react-pdf';
import { getDocument, OPS } from 'pdfjs-dist';
import 'react-pdf/dist/Page/TextLayer.css';

// String similarity import.
import stringSimilarity from 'string-similarity';

// Hook Import.
import { useAppSelector } from '../../hooks';

// API import.
import { getPresignedUrl } from '../../services/ChatBot.service';

/**
 * Represents a single text item extracted from a PDF.
 */
interface PDFTextItem {
  dir: string;
  fontName: string;
  hasEOL: boolean;
  height: number;
  str: string;
  transform: number[];
  width: number;
}

interface ImageArea {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Configures the global worker options for PDF.js.
 *
 * Sets the `workerSrc` property of `pdfjs.GlobalWorkerOptions` to specify the path to the PDF.js worker script.
 * The path is constructed using the `pdfjs.version` to ensure compatibility with the currently used version of PDF.js.
 *
 * @constant {string} pdfjs.GlobalWorkerOptions.workerSrc - The URL to the PDF.js worker script.
 */
pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

/**
 * Retrieves the API URL from environment variables.
 *
 * This constant holds the API URL for the React application, obtained from the environment variable `VITE_REACT_API_URL`.
 * This URL is used for making API requests in the application.
 *
 * @constant {string} url - The API URL for the React application.
 */
const url = import.meta.env.VITE_REACT_API_URL;

const PDFPreview = () => {
  /**
   *  State variable for storing the number of pages.
   * @constant {number} numPages - The current number of pages.
   * @function setNumPages - Function to update the number of pages.
   */
  const [numPages, setNumPages] = useState<number>(0);

  /**
   * State variable to manage the loading state for the pages.
   *
   * @constant {boolean} isLoading - The current status of the page loading.
   * @function setIsLoading - Function to update the status of the page loading.
   */
  const [isLoading, setIsLoading] = useState(true);

  /**
   * State variable to manage the fetching state of the PDF.
   *
   * @constant {boolean} isFetchingPDF - The current status of PDF fetching.
   * @function setIsFetchingPDF - Function to update the status of PDF fetching.
   */
  const [isFetchingPDF, setIsFetchingPDF] = useState<boolean>(false);

  /**
   * State variable to manage the loading state of the text highlighting process.
   *
   * @constant {boolean} isHighlightLoading - The current status of the highlighting process.
   * @function setIsHighlightLoading - Function to update the status of the highlighting process.
   */
  const [isHighlightLoading, setIsHighlightLoading] = useState(false);

  /**
   * State variable to keep track of the pages that have been rendered.
   *
   * @constant {number[]} renderedPages - The state that stores the array of rendered page numbers.
   * @function setRenderedPages - Function to update the renderedPages state.
   */
  const [renderedPages, setRenderedPages] = useState<number[]>([]);

  /**
   * State to store text items extracted from a PDF.
   * Each item in the array represents a piece of text with its properties.
   * @constant {PDFTextItemp[]}
   * @function setTextItems
   */
  const [textItems, setTextItems] = useState<PDFTextItem[]>([]);

  const [imageAreas, setImageAreas] = useState<ImageArea[]>([]);

  /**
   * Holds the presigned URL for the PDF file fetched from the server.
   * Initially set to an empty string. Updated with the actual presigned URL upon
   * successful fetch operation in the `fetchPresignedUrl` function.
   * @constant {string} presignedUrl
   */

  const [presignedUrl, setPresignedfUrl] = useState<string>('');

  /**
   * Ref to store references to canvas elements for rendering PDF pages.
   * The array contains HTMLCanvasElement references, or null if the canvas is not yet assigned.
   */
  const canvasRefs = useRef<(HTMLCanvasElement | null)[]>([]);

  /**
   * Ref for the PDF viewer element.
   */
  const pdfRef = useRef<HTMLDivElement>(null);

  // Redux variable.
  /**
   * Retrieves the `pdfPreview` state from the `chat` slice of the Redux store, which includes:
   * - `pageNumber`: The page number of the PDF to view.
   * - `filePath`: The path to the PDF file.
   *
   * @type {PDFPreviewParams}
   */
  const pdfPreviewParams = useAppSelector((state) => state.chat.pdfPreview);

  /**
   * Constructed URL for accessing the PDF file.
   * Combines the base URL (`url`) with the PDF file path (`pdfPreviewParams.filePath`), removing the leading slash
   * from the file path if present.
   * @type {string}
   */
  const pdfUrl = url + pdfPreviewParams.filePath?.slice(1);

  /**
   * Fetches a presigned URL for the PDF from the specified `pdfUrl` and updates the `presignedUrl` state.
   *
   * This function sets the `isFetchingPDF` state to `true` while fetching the URL,
   * and updates the `presignedUrl` state with the fetched URL if the fetch operation is successful.
   * If an error occurs during the fetch operation, it logs the error, sets `isLoading` and `isHighlightLoading`
   * states to `false`, and keeps `presignedUrl` unchanged. Finally, it sets `isFetchingPDF` to `false`
   * once the fetch operation is complete.
   *
   * @async
   * @function fetchPresignedUrl
   * @returns {Promise<void>} - A promise that resolves when the fetch operation is complete.
   */
  const fetchPresignedUrl = useCallback(async () => {
    try {
      setIsFetchingPDF(true);
      const response = await getPresignedUrl(pdfUrl);
      if (response.success) {
        setPresignedfUrl(response.data.url);
      } else {
        setIsLoading(false);
        setIsHighlightLoading(false);
      }
    } catch (error) {
      console.error('Error fetching PDF:', error);
    } finally {
      setIsFetchingPDF(false);
    }
  }, [pdfUrl]);

  /**
   * Scrolls the PDF viewer to the specified page.
   *
   * Calculates the scroll position based on the page number and the height of the pages. Smoothly scrolls to
   * the target position within the PDF viewer referenced by `pdfRef`.
   *
   * @param {number} pageNumber - The page number to scroll to (1-based index).
   */
  const scrollToPage = (pageNumber: number) => {
    if (pdfRef.current) {
      const pageHeight = pdfRef.current.querySelector('.react-pdf__Page')?.clientHeight || 0;
      const scrollPosition = (pageNumber - 1) * pageHeight;
      pdfRef.current.scrollTo({
        top: scrollPosition,
        behavior: 'smooth'
      });
    }
  };

  /**
   * Handles the successful loading of a PDF document.
   *
   * Updates the state with the total number of pages (`numPages`) and schedules a scroll to the specified page
   * (`pdfPreviewParams.pageNumber`) after a 500ms delay.
   *
   * @param {Object} param - The object containing PDF loading information.
   * @param {number} param.numPages - The total number of pages in the loaded PDF document.
   */
  const onLoadSuccess = ({ numPages }: { numPages: number }) => {
    setNumPages(numPages);
  };

  /**
   * Callback function to handle the successful rendering of a page.
   * Adds the rendered page number to the `renderedPages` state, ensuring no duplicates.
   *
   * @param {number} pageNumber - The page number that was successfully rendered.
   */
  const onRenderSuccess = (pageNumber: number) => {
    setRenderedPages((prev) => [...new Set([...prev, pageNumber])]);
  };

  /**
   * Asynchronously loads and processes text content from a PDF document.
   *
   * 1. Fetches the PDF document from the specified URL using `getDocument`.
   * 2. Retrieves the specified page from the PDF.
   * 3. Extracts the text content from the page.
   * 4. Updates the state with the extracted text items.
   */
  const loadPdfText = useCallback(async () => {
    try {
      setIsHighlightLoading(true);
      const loadingTask = getDocument(presignedUrl);
      const pdf = await loadingTask.promise;
      const page = await pdf.getPage(pdfPreviewParams.pageNumber);
      const textContent = await page.getTextContent();
      // Get the operator list for the page
      const operatorList = await page.getOperatorList();
      const newImageAreas: { x: number; y: number; width: number; height: number }[] = [];
      // Iterate over the operator list
      for (let i = 0; i < operatorList.fnArray.length; i++) {
        const operator = operatorList.fnArray[i];
        const args = operatorList.argsArray[i];

        // Check for the paintImageXObject operator
        if (operator === OPS.paintImageXObject) {
          const [_name, x, y, width, height] = args;
          newImageAreas.push({ x, y, width, height });
        }
      }
      setImageAreas((prevImageAreas) => [...prevImageAreas, ...newImageAreas]);
      setTextItems(textContent.items as PDFTextItem[]);
    } catch (error) {
      console.error(error);
    } finally {
      setIsHighlightLoading(false);
    }
  }, [pdfPreviewParams.pageNumber, presignedUrl]);

  /**
   * Prepares lines of text from PDF text items by grouping items that belong to the same line.
   * Each line is an array of `PDFTextItem` objects. Lines are determined by the `hasEOL` property
   * of each text item, which signifies the end of a line.
   *
   * @returns {PDFTextItem[][]} An array of lines, where each line is an array of `PDFTextItem` objects.
   */
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

  /**
   * Combines the text from a given array of `PDFTextItem` objects into a single string, with spaces
   * between items. This is useful for creating a coherent string representation of text items in a line.
   *
   * @param {PDFTextItem[]} line - An array of `PDFTextItem` objects representing a line of text.
   * @returns {string} A concatenated string of text from all items in the line.
   */
  const getTextSegment = useCallback(
    (line: PDFTextItem[]) => line.map((item) => item.str).join(' '),
    []
  );

  /**
   * Finds the best match for a given quote within an array of text lines from a PDF. It compares
   * the quote with concatenated text segments from multiple lines and returns the segment with the
   * highest similarity score.
   *
   * @param {PDFTextItem[][]} lines - A 2D array where each sub-array represents a line of text as `PDFTextItem` objects.
   * @param {string} quote - The quote to be matched against the text lines.
   * @returns {{ score: number; lines: PDFTextItem[][] }} An object containing the highest similarity score and the corresponding lines of text.
   */
  const findBestMatch = useCallback(
    (lines: PDFTextItem[][], quote: string) => {
      let bestMatch = { score: -1, lines: [] as PDFTextItem[][] };
      const normalizedQuote = quote.toLowerCase().trim();

      for (let i = 0; i < lines.length; i++) {
        let combinedText = '';
        for (let j = i; j < lines.length; j++) {
          combinedText += (j > i ? ' ' : '') + getTextSegment(lines[j]).toLowerCase().trim();
          const score = stringSimilarity.compareTwoStrings(combinedText, normalizedQuote);
          if (score > 0.8) {
            bestMatch = { score, lines: lines.slice(i, j + 1) };
          }
          if (combinedText.length > normalizedQuote.length * 1.5) break;
        }
      }
      return bestMatch;
    },
    [getTextSegment]
  );

  /**
   * Draws a highlight over the specified text items on a canvas. The highlight is rendered using
   * a semi-transparent yellow fill.
   *
   * @param {CanvasRenderingContext2D} context - The canvas rendering context where the highlight will be drawn.
   * @param {number} canvasHeight - The height of the canvas, used to calculate the correct position of the highlight.
   * @param {PDFTextItem[]} items - An array of `PDFTextItem` objects representing the text to be highlighted.
   */

  const drawHighlight = useCallback(
    (context: CanvasRenderingContext2D, canvasHeight: number, items: PDFTextItem[]) => {
      context.fillStyle = 'rgba(255, 255, 0, 0.3)';
      items.forEach((item) => {
        const [x, y, w, h] = [
          item.transform[4],
          canvasHeight - item.transform[5] - item.height,
          item.width,
          item.height
        ];
        // Check if the highlight area intersects with any image area
        const intersectsWithImage = imageAreas.some((imageArea) => {
          return (
            x < imageArea.x + imageArea.width &&
            x + w > imageArea.x &&
            y < imageArea.y + imageArea.height &&
            y + h > imageArea.y
          );
        });

        // Only draw highlight if it doesn't intersect with any image area
        if (!intersectsWithImage) {
          context.fillRect(x, y, w, h);
        }
      });
    },
    []
  );

  /**
   * Applies highlights to a specific page of a PDF displayed on a canvas. It retrieves the canvas and
   * context, determines the appropriate dimensions, and draws highlights based on the best match for
   * a provided quote. It uses the `findBestMatch` function to locate the closest text match and the
   * `drawHighlight` function to render it.
   *
   * @returns {Promise<void>} A promise that resolves when the highlighting process is complete.
   */
  const applyHighlight = useCallback(() => {
    const canvas = canvasRefs.current[pdfPreviewParams.pageNumber - 1];
    if (!canvas || textItems.length === 0) return;

    const context = canvas.getContext('2d');
    if (!context) return;

    const pdfPage = pdfRef.current?.querySelector(
      `.react-pdf__Page[data-page-number="${pdfPreviewParams.pageNumber}"]`
    ) as HTMLElement | null;

    if (!pdfPage) {
      console.error('PDF page element not found');
      return;
    }

    canvas.width = pdfPage.clientWidth;
    canvas.height = pdfPage.clientHeight;
    context.clearRect(0, 0, canvas.width, canvas.height);

    const bestMatch = findBestMatch(prepareTextLines, pdfPreviewParams.quote);

    if (bestMatch.lines.length === 0) {
      console.error('No close match found for the quote');
      return;
    }

    drawHighlight(context, canvas.height, bestMatch.lines.flat());
  }, [
    textItems,
    prepareTextLines,
    drawHighlight,
    findBestMatch,
    pdfPreviewParams.pageNumber,
    pdfPreviewParams.quote
  ]);

  // Memoize the page components to prevent unnecessary re-renders
  const pageComponents = useMemo(
    () =>
      Array.from(new Array(numPages), (_, index) => (
        <div key={`page_${index + 1}`} style={{ position: 'relative' }}>
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
              position: 'absolute',
              top: 0,
              left: 0,
              pointerEvents: 'none'
            }}
          />
        </div>
      )),
    [numPages]
  );

  useEffect(() => {
    if (numPages > 0 && renderedPages.length === numPages) {
      setIsLoading(false);
      setTimeout(() => {
        scrollToPage(pdfPreviewParams.pageNumber);
      }, 500);
    }
  }, [numPages, renderedPages, pdfPreviewParams.pageNumber]);

  useEffect(() => {
    if (textItems.length !== 0) {
      applyHighlight();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [textItems]);

  useEffect(() => {
    if (presignedUrl === '') {
      fetchPresignedUrl();
    } else {
      loadPdfText();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presignedUrl]);

  return (
    <Box
      id="pdf-preview"
      data-testid="pdf-preview"
      ref={pdfRef}
      sx={{
        position: 'relative',
        width: '100%',
        display: 'flex',
        justifyContent: 'center',
        height: '100vh',
        overflow: isLoading ? 'none' : 'auto',
        scrollbarWidth: 'none',
        msOverflowStyle: 'none',
        '&::-webkit-scrollbar': {
          display: 'none'
        },
        '& .react-pdf__Page': {
          userSelect: 'none',
          pointerEvents: 'none'
        }
      }}
    >
      {(isLoading || isHighlightLoading || isFetchingPDF) && (
        <Box
          sx={{
            position: 'absolute',
            minHeight: '100%',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
            backgroundColor: 'rgba(255, 255, 255, 1.0)',
            zIndex: 999,
            width: '100%'
          }}
        >
          <Box sx={{ position: 'relative', display: 'inline-flex' }}>
            <CircularProgress />
            {!isFetchingPDF && (
              <Box
                sx={{
                  top: 0,
                  left: 0,
                  bottom: 0,
                  right: 0,
                  position: 'absolute',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                <Typography variant="caption" component="div">{`${Math.round(
                  renderedPages.length ? (renderedPages.length / numPages) * 95 : 0
                )}%`}</Typography>
              </Box>
            )}
          </Box>
          {isFetchingPDF ? (
            <p>{'Retrieving your PDF file, please wait.'}</p>
          ) : (
            <p>{"Loading your PDF, this won't take long."}</p>
          )}
        </Box>
      )}
      <Box sx={{ width: '100%' }}>
        <Document
          file={presignedUrl}
          onLoadSuccess={onLoadSuccess}
          onLoadError={() => {
            setIsLoading(false);
            setIsHighlightLoading(false);
          }}
          noData={
            <>
              <Box
                sx={{
                  display: 'flex',
                  justifyContent: 'center',
                  alignItems: 'center',
                  height: '85vh'
                }}
              >
                <p>{'Failed to load PDF.'}</p>
              </Box>
            </>
          }
          loading={
            <>
              <Box
                sx={{
                  display: 'flex',
                  justifyContent: 'center',
                  alignItems: 'center',
                  height: '85vh'
                }}
              >
                <p>{"Loading your PDF, this won't take long."}</p>
              </Box>
            </>
          }
          error={
            <>
              <Box
                sx={{
                  display: 'flex',
                  justifyContent: 'center',
                  alignItems: 'center',
                  height: '85vh'
                }}
              >
                <p>Something went wrong while loading the PDF.</p>
              </Box>
            </>
          }
        >
          {pageComponents}
        </Document>
      </Box>
    </Box>
  );
};

export default PDFPreview;
