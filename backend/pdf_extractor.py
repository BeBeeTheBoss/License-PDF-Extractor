import sys
import os
import logging
import pdfplumber


def main() -> int:
    # Some PDFs have broken font descriptors; pdfminer logs noisy warnings
    # even when text extraction still succeeds.
    logging.getLogger("pdfminer").setLevel(logging.ERROR)

    # Get PDF path from argument
    if len(sys.argv) < 2:
        print("Usage: python pdf_extractor.py <pdf_file_path>")
        return 1

    pdf_file = sys.argv[1]
    if not os.path.exists(pdf_file):
        print(f"PDF file not found: {pdf_file}")
        return 1

    output_folder = os.path.join(os.path.dirname(pdf_file), "extracted")
    os.makedirs(output_folder, exist_ok=True)

    # Extract text
    text_output_path = os.path.join(output_folder, "extracted_text.txt")
    all_text = ""
    with pdfplumber.open(pdf_file) as pdf:
        for page_number, page in enumerate(pdf.pages, start=1):
            page_text = page.extract_text()
            if page_text:
                all_text += f"--- Page {page_number} ---\n{page_text}\n\n"

    with open(text_output_path, "w", encoding="utf-8") as f:
        f.write(all_text)

    print(f"Text saved: {text_output_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
