"""PDF text extraction from raw bytes."""

import logging
from typing import Optional

logger = logging.getLogger(__name__)


def extract_text_from_bytes(pdf_bytes: bytes) -> Optional[str]:
    """Extract text from PDF bytes. Tries pdfplumber first, then PyPDF2."""
    import io

    # Try pdfplumber
    try:
        import pdfplumber
        with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
            pages = [p.extract_text() or "" for p in pdf.pages]
            text = "\n".join(pages).strip()
            if text:
                return text
    except ImportError:
        pass
    except Exception as e:
        logger.warning(f"pdfplumber Fehler: {e}")

    # Fallback: PyPDF2
    try:
        import PyPDF2
        reader = PyPDF2.PdfReader(io.BytesIO(pdf_bytes))
        pages = [p.extract_text() or "" for p in reader.pages]
        text = "\n".join(pages).strip()
        if text:
            return text
    except ImportError:
        logger.warning("Weder pdfplumber noch PyPDF2 installiert")
    except Exception as e:
        logger.warning(f"PyPDF2 Fehler: {e}")

    return None
