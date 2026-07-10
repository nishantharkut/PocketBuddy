# Bank Statement Import Lite

Status: implemented on `feature/statement-import-lite`.

## Why This Exists

PocketBuddy's best capture path is still the Android companion because it works passively. Bank statement import is the fallback for:

- students on iOS;
- students who do not want notification access;
- catch-up imports for old spending before installing the Android app;
- demos where live payment notifications are unreliable.

The feature is intentionally review-first. It previews rows, lets the user skip rows, marks likely duplicates, and stores only normalized transactions. It does not store the raw statement file or PDF password.

## Repeated Vendor Learning

Statement imports often contain noisy bank narrations like `UPI/SHARMA TEA STALL/204501`. PocketBuddy now converts those narrations into a personal vendor fingerprint by removing bank rails, references, and changing numeric IDs. It then asks the student one category question only when the pattern looks like a habit:

- at least 2 payments to the same unknown vendor within 7 days; or
- at least 5 payments to the same unknown vendor within 30 days.

This is intentionally not a global crowd update. The answer is stored as a per-user `merchant_category_mappings` entry, then applied to matching statement rows now and future imports. If the student closes the import prompt, editing one matching statement transaction later can still save the same personal vendor answer.

The goal is to avoid manual row-by-row cleanup. PocketBuddy asks only when a repeated payment pattern becomes behavior.

## Supported Inputs

Recommended:

- CSV exported from the bank portal.
- Delimited text or TSV exported from the bank portal.

Supported with limits:

- Text-based PDF statements with selectable text.
- Password-protected text PDFs, if the user enters the password during preview.
- Multi-page text PDFs up to the first 20 pages. Wrapped narration, UTR, value-date, amount, and balance lines are stitched before parsing.

Not supported:

- Scanned/image-only PDFs.
- Excel files directly. Export or save as CSV first.
- Single-amount CSV rows with no debit/credit marker, because importing them can silently flip income into expense.

## Format Research Notes

The implementation is shaped around real Indian bank export patterns rather than a single hardcoded sample:

- HDFC says account statements can be downloaded in PDF, Excel, Text, Delimited, and MSMoney formats: https://www.hdfc.bank.in/need-help/net-banking-faqs
- ICICI documents online statement download through NetBanking and multi-year detailed statement access: https://www.icici.bank.in/personal-banking/accounts/savings-account/statements
- SBI-style converted data commonly normalizes to Date, Narration, Debit, Credit, and Balance: https://bankconv.com/blog/convert-sbi-bank-statement-to-csv
- Generic bank-statement import tools and accounting systems converge on Date, Description/Narration, Debit, Credit, and Balance as the clean import shape: https://docs.oracle.com/en/cloud/saas/netsuite/ns-online-help/section_162553265314.html
- Text/PDF extraction is brittle when rows contain both a transaction amount and running balance, so PocketBuddy ignores date fragments and reference-like numbers, then treats the last numeric amount as balance and the previous amount as the transaction amount when no CR/DR marker is present.

## Parser Rules

The parser accepts common column aliases:

- Date: `Date`, `Txn Date`, `Transaction Date`, `Posted Date`, `Value Date`, `Value Dt`
- Description: `Narration`, `Description`, `Particulars`, `Details`, `Remarks`, `Transaction Remarks`
- Debit: `Debit`, `Debit Amt`, `Withdrawal Amt`, `Withdrawal Amount`, `Dr`
- Credit: `Credit`, `Credit Amt`, `Deposit Amt`, `Deposit Amount`, `Cr`
- Reference: `Ref No`, `UTR`, `UPI Ref`, `Transaction ID`, `Txn ID`, `Cheque/Ref No`, `Chq./Ref.No.`
- Balance: `Balance`, `Closing Balance`, `Running Balance`, `Available Balance`

For CSV files, the parser can skip account-summary lines before the real transaction header. For text/PDF rows, it imports rows as medium confidence so the user reviews them before commit. For multi-page PDFs, repeated statement headers and page footer lines are ignored.

## Privacy Model

- Raw file: not stored.
- PDF password: not stored.
- Imported transaction source: `statement_import`.
- Data origin: `bank_statement_upload`.
- Low-confidence rows: marked `needs_review`.
- Repeated-vendor answers: stored as personal mappings and deleted during account purge.
- Rollback: each import gets a batch ID, and the user can remove all rows from that batch.

## Product Flow

1. User opens Transactions.
2. User clicks `Import Statement`.
3. User uploads CSV, TSV, TXT, or text PDF.
4. PocketBuddy previews parsed rows.
5. Duplicate candidates are pre-unselected.
6. User imports selected rows.
7. If repeated unknown vendors are found, PocketBuddy asks what that vendor is for once.
8. Transactions appear in the ledger, stats, runway, and source breakdown.
9. User can roll back the batch from recent imports.

## Judge-Safe Framing

Say:

> Bank statement import is our consent-light fallback. The Android app remains the passive path; statements cover iOS users, privacy-sensitive users, and historical catch-up. We do not store raw bank files or passwords. We store only reviewed transaction rows.

Do not say:

> It supports every bank statement.

Better answer:

> We support the dominant structured shapes: CSV/delimited exports and text-based PDFs with debit/credit columns. Scanned statements need OCR, which we intentionally keep out of this path because OCR can misread money.

## Manual Test Checklist

Use a throwaway account first.

1. Export a small statement range as CSV if the bank allows it.
2. Open Transactions.
3. Click `Import Statement`.
4. Upload the file.
5. Confirm rows show correct date, narration, debit/credit, amount, and references.
6. Import 2-5 rows only.
7. Confirm rows appear in Transactions and Stats.
8. Re-upload the same file and confirm duplicates are marked.
9. Roll back the import and confirm imported rows disappear.

For PDFs:

1. Test only a text-based PDF first.
2. If password protected, enter the password only in the preview form.
3. If the app says no selectable text, export CSV from the bank portal instead.

## Current Limitations

- No OCR for scanned PDFs in this feature.
- No direct Excel parsing; save as CSV first.
- No automatic bank-login or Account Aggregator integration in this path.
- Text/PDF parsing is deliberately conservative. Ambiguous rows are skipped or marked for review rather than imported incorrectly.
- Very unusual PDF layouts where one transaction is split across multiple columns out of reading order may still need CSV export.
