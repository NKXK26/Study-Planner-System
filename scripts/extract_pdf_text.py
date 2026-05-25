#!/usr/bin/env python3
"""
PDF text extraction script – tries Docling first (better layout), falls back to pypdf.
"""

import sys
import json

def extract_with_docling(pdf_path):
    try:
        from docling.document_converter import DocumentConverter
        converter = DocumentConverter()
        result = converter.convert(pdf_path)
        return result.document.export_to_text()
    except Exception as e:
        print(f"Docling failed: {e}", file=sys.stderr)
        return None

def extract_with_pypdf(pdf_path):
    try:
        from pypdf import PdfReader
        reader = PdfReader(pdf_path)
        text_parts = []
        for page in reader.pages:
            txt = page.extract_text()
            if txt:
                text_parts.append(txt)
        return "\n\n".join(text_parts)
    except Exception as e:
        print(f"pypdf failed: {e}", file=sys.stderr)
        return None

def main():
    if len(sys.argv) < 2:
        print(json.dumps({"success": False, "error": "No PDF path provided"}))
        sys.exit(1)
    
    pdf_path = sys.argv[1]
    
    # Try Docling first
    text = extract_with_docling(pdf_path)
    if text is not None:
        print(json.dumps({"success": True, "text": text}))
        return
    
    # Fallback to pypdf
    text = extract_with_pypdf(pdf_path)
    if text is not None:
        print(json.dumps({"success": True, "text": text}))
        return
    
    # If both fail
    print(json.dumps({"success": False, "error": "No PDF extraction method worked. Please install pypdf or docling."}))

if __name__ == "__main__":
    main()