import csv
import datetime as dt
import io
import re
import uuid
from dataclasses import dataclass
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from pathlib import Path
from typing import Iterable


class StatementImportError(ValueError):
    """Raised when a statement cannot be parsed into reviewable rows."""


@dataclass(frozen=True)
class StatementRow:
    row_id: str
    posted_at: dt.datetime
    description: str
    amount_paise: int
    direction: str
    category: str
    confidence: str
    reference: str | None = None
    balance_paise: int | None = None
    notes: tuple[str, ...] = ()

    def to_preview_dict(self) -> dict:
        return {
            "row_id": self.row_id,
            "posted_at": self.posted_at.isoformat(),
            "description": self.description,
            "amount_paise": self.amount_paise,
            "direction": self.direction,
            "category": self.category,
            "confidence": self.confidence,
            "reference": self.reference,
            "balance_paise": self.balance_paise,
            "notes": list(self.notes),
        }


DATE_COLUMNS = {
    "date",
    "txn date",
    "transaction date",
    "posted date",
    "posting date",
    "value date",
    "value dt",
    "transaction posted date",
}

DESCRIPTION_COLUMNS = {
    "description",
    "narration",
    "particulars",
    "details",
    "remarks",
    "transaction remarks",
    "transaction description",
    "transaction details",
    "merchant",
}

DEBIT_COLUMNS = {
    "debit",
    "withdrawal",
    "withdrawals",
    "dr",
    "paid out",
    "debit amount",
    "debit amt",
    "withdrawal amount",
    "withdrawal amt",
    "withdrawal dr",
}
CREDIT_COLUMNS = {
    "credit",
    "deposit",
    "deposits",
    "cr",
    "paid in",
    "credit amount",
    "credit amt",
    "deposit amount",
    "deposit amt",
    "deposit cr",
}
AMOUNT_COLUMNS = {
    "amount",
    "transaction amount",
    "txn amount",
    "amount inr",
    "amount rs",
    "withdrawal deposit",
    "withdrawal dr deposit cr",
    "withdrawal dr deposit cr balance",
}
DIRECTION_COLUMNS = {"type", "direction", "dr/cr", "dr cr", "transaction type"}
BALANCE_COLUMNS = {"balance", "closing balance", "available balance", "running balance"}
REFERENCE_COLUMNS = {
    "reference",
    "ref",
    "ref no",
    "utr",
    "upi ref",
    "transaction id",
    "txn id",
    "cheque ref no",
    "chq ref no",
    "cheque reference",
    "cheque reference no",
    "cheque/ref no",
    "chq/ref no",
    "chq ref",
    "ref no cheque",
}

CATEGORY_KEYWORDS = {
    "food": ("canteen", "cafe", "chai", "coffee", "zomato", "swiggy", "food", "mess", "restaurant", "maggi"),
    "travel": ("uber", "ola", "rapido", "auto", "metro", "rail", "irctc", "bus", "fuel", "petrol"),
    "subscription": ("spotify", "netflix", "prime", "youtube", "subscription", "renewal", "autopay"),
    "stationery": ("stationery", "print", "xerox", "book", "notebook", "pen"),
    "shopping": ("amazon", "flipkart", "myntra", "blinkit", "zepto", "instamart", "dmart"),
    "education": ("college", "institute", "course", "exam", "fees", "tuition"),
    "health": ("pharmacy", "medical", "doctor", "clinic", "hospital"),
}

VENDOR_GROUP_NOISE = {
    "upi",
    "imps",
    "neft",
    "rtgs",
    "ach",
    "nach",
    "pos",
    "atm",
    "vpa",
    "ref",
    "reference",
    "txn",
    "transaction",
    "utr",
    "no",
    "id",
    "to",
    "by",
    "from",
    "transfer",
    "payment",
    "payments",
    "paid",
    "pay",
    "sent",
    "received",
    "debit",
    "credit",
    "dr",
    "cr",
    "axis",
    "hdfc",
    "icici",
    "sbi",
    "kotak",
    "yes",
    "yesbank",
    "bank",
    "paymentsbank",
    "phonepe",
    "gpay",
    "googlepay",
    "paytm",
    "bharatpe",
    "amazonpay",
    "p2a",
    "p2m",
    "m2p",
    "collect",
    "merchant",
    "account",
    "acct",
    "ac",
    "a/c",
    "okaxis",
    "oksbi",
    "okicici",
    "okhdfcbank",
    "ybl",
    "ibl",
    "axl",
    "ltd",
    "limited",
    "pvt",
    "private",
}

DATE_FORMATS = (
    "%d/%m/%Y",
    "%d-%m-%Y",
    "%d.%m.%Y",
    "%d-%b-%Y",
    "%d-%B-%Y",
    "%Y-%m-%d",
    "%d/%m/%y",
    "%d-%m-%y",
    "%d %b %Y",
    "%d %B %Y",
    "%b %d %Y",
    "%B %d %Y",
)

MAX_PREVIEW_ROWS = 250
TEXT_DATE_PATTERN = (
    r"\b(\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{4}-\d{1,2}-\d{1,2}|"
    r"\d{1,2}[-\s]+[A-Za-z]{3,9}[-\s]+\d{2,4})\b"
)


def parse_statement_file(
    filename: str,
    content: bytes,
    password: str | None = None,
    max_rows: int = MAX_PREVIEW_ROWS,
) -> list[StatementRow]:
    suffix = Path(filename or "").suffix.lower()
    if suffix == ".pdf":
        table_rows = parse_statement_pdf_tables(content, password=password, max_rows=max_rows)
        if table_rows:
            return table_rows
        text = _extract_pdf_text(content, password=password)
        return parse_statement_text(text, max_rows=max_rows)
    text = _decode_statement_text(content)
    if suffix in {".csv", ".tsv"} or "," in text[:2000] or "\t" in text[:2000]:
        rows = parse_statement_csv(text, max_rows=max_rows)
        if rows:
            return rows
    return parse_statement_text(text, max_rows=max_rows)


def parse_statement_csv(text: str, max_rows: int = MAX_PREVIEW_ROWS) -> list[StatementRow]:
    sample = text[:4096]
    try:
        dialect = csv.Sniffer().sniff(sample, delimiters=",\t;")
    except csv.Error:
        dialect = csv.excel

    text = _trim_to_statement_header(text, dialect)
    reader = csv.DictReader(io.StringIO(text), dialect=dialect)
    if not reader.fieldnames:
        return []

    header_map = {_normalize_header(field): field for field in reader.fieldnames if field}
    rows: list[StatementRow] = []
    for index, raw_row in enumerate(reader, start=1):
        try:
            row = _row_from_mapping(index, raw_row, header_map)
        except StatementImportError:
            continue
        rows.append(row)
        if len(rows) >= max_rows:
            break
    return rows


def parse_statement_text(text: str, max_rows: int = MAX_PREVIEW_ROWS) -> list[StatementRow]:
    rows: list[StatementRow] = []
    for index, compact in enumerate(_statement_text_candidates(text), start=1):
        try:
            row = _row_from_text_line(index, compact)
        except StatementImportError:
            continue
        rows.append(row)
        if len(rows) >= max_rows:
            break
    if not rows:
        raise StatementImportError(
            "No transactions were detected. Export the bank statement as CSV, or upload a text-based PDF with selectable text."
        )
    return rows


def parse_statement_pdf_tables(
    content: bytes,
    password: str | None = None,
    max_rows: int = MAX_PREVIEW_ROWS,
) -> list[StatementRow]:
    try:
        import pdfplumber
    except ImportError:
        return []

    try:
        with pdfplumber.open(io.BytesIO(content), password=password or "") as pdf:
            tables = []
            for page in pdf.pages[:20]:
                tables.extend(page.extract_tables() or [])
    except Exception as exc:
        error_text = str(exc).casefold()
        if "password" in error_text or "decrypt" in error_text:
            if not password:
                raise StatementImportError("This PDF is password protected. Enter the password to preview it.") from exc
            raise StatementImportError("Could not open the PDF with that password.") from exc
        return []

    rows = _rows_from_pdf_tables(tables, max_rows=max_rows)
    return rows


def normalize_statement_description(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", (value or "").casefold()).strip()


def statement_vendor_group_key(description: str) -> str:
    """Return a stable personal vendor key from noisy bank narration text."""
    normalized = normalize_statement_description(description)
    tokens = []
    for token in normalized.split():
        if token in VENDOR_GROUP_NOISE:
            continue
        if token.isdigit():
            continue
        if len(token) <= 1:
            continue
        if re.fullmatch(r"[a-z]*\d+[a-z0-9]*", token):
            continue
        tokens.append(token)
    compact = " ".join(tokens).strip()
    if tokens and len(compact) >= 3:
        return compact[:80]
    return ""


def statement_vendor_display_name(description: str) -> str:
    key = statement_vendor_group_key(description)
    if not key:
        return _clean_description(description) or "Repeated statement vendor"
    words = []
    for token in key.split():
        if token in {"bh", "iiitm", "abv"}:
            words.append(token.upper())
        else:
            words.append(token.capitalize())
    return " ".join(words)[:80] or "Repeated statement vendor"


def statement_row_signature(row: StatementRow | dict) -> str:
    if isinstance(row, StatementRow):
        posted_at = row.posted_at
        amount = row.amount_paise
        direction = row.direction
        description = row.description
    else:
        posted_value = row.get("posted_at") or row.get("created_at")
        posted_at = _parse_date_value(posted_value) if not isinstance(posted_value, dt.datetime) else posted_value
        amount = int(row.get("amount_paise") or row.get("amount") or 0)
        direction = str(row.get("direction") or "debit").lower()
        description = str(row.get("description") or row.get("mapped_merchant_name") or row.get("raw_merchant_string") or "")
    key = f"{posted_at.date().isoformat()}|{direction}|{amount}|{normalize_statement_description(description)}"
    return uuid.uuid5(uuid.NAMESPACE_URL, key).hex


def _row_from_mapping(index: int, raw_row: dict, header_map: dict[str, str]) -> StatementRow:
    def value_for(candidates: Iterable[str]) -> str:
        original = _find_header(header_map, candidates)
        if original and raw_row.get(original) not in (None, ""):
            return str(raw_row.get(original) or "").strip()
        return ""

    date_text = value_for(DATE_COLUMNS)
    description = value_for(DESCRIPTION_COLUMNS)
    debit_text = value_for(DEBIT_COLUMNS)
    credit_text = value_for(CREDIT_COLUMNS)
    amount_text = value_for(AMOUNT_COLUMNS)
    direction_text = value_for(DIRECTION_COLUMNS)
    balance_text = value_for(BALANCE_COLUMNS)
    reference_text = value_for(REFERENCE_COLUMNS)

    posted_at = _parse_date_value(date_text)
    direction, amount_paise = _amount_and_direction(
        debit_text=debit_text,
        credit_text=credit_text,
        amount_text=amount_text,
        direction_text=direction_text,
        description_text=description,
    )
    description = _clean_description(description)
    balance_paise = _parse_money_to_paise(balance_text, allow_zero=True)
    notes: list[str] = []
    confidence = "high"
    if not description:
        description = "Statement entry"
        notes.append("Missing narration in statement row.")
        confidence = "medium"
    reference = _extract_reference(reference_text) or _extract_reference(description)
    row = StatementRow(
        row_id="",
        posted_at=posted_at,
        description=description,
        amount_paise=amount_paise,
        direction=direction,
        category=guess_category(description, direction),
        confidence=confidence,
        reference=reference,
        balance_paise=balance_paise,
        notes=tuple(notes),
    )
    return _with_row_id(row, index)


def _rows_from_pdf_tables(tables: list, max_rows: int = MAX_PREVIEW_ROWS) -> list[StatementRow]:
    parsed_rows: list[StatementRow] = []
    headers: list[str] | None = None
    pending: dict[str, str] | None = None
    row_index = 1

    def flush_pending() -> None:
        nonlocal pending, row_index
        if not pending or len(parsed_rows) >= max_rows:
            pending = None
            return
        header_map = {_normalize_header(header): header for header in pending if header}
        try:
            row = _row_from_mapping(row_index, pending, header_map)
        except StatementImportError:
            pending = None
            return
        parsed_rows.append(
            StatementRow(
                row_id=row.row_id,
                posted_at=row.posted_at,
                description=row.description,
                amount_paise=row.amount_paise,
                direction=row.direction,
                category=row.category,
                confidence="medium",
                reference=row.reference,
                balance_paise=row.balance_paise,
                notes=("Parsed from statement table. Review before importing.",),
            )
        )
        row_index += 1
        pending = None

    for table in tables:
        for raw_cells in table or []:
            cells = [_clean_table_cell(cell) for cell in raw_cells or []]
            if not any(cells):
                continue
            normalized = {_normalize_header(cell) for cell in cells if cell}
            if _looks_like_statement_header(normalized):
                flush_pending()
                headers = cells
                continue
            if not headers:
                continue
            mapping = _table_row_mapping(headers, cells)
            if not any(mapping.values()):
                continue
            header_map = {_normalize_header(header): header for header in mapping if header}
            has_date = bool(_value_from_mapping(mapping, header_map, DATE_COLUMNS))
            if has_date:
                flush_pending()
                pending = mapping
            elif pending:
                _merge_table_continuation(pending, mapping)
            if len(parsed_rows) >= max_rows:
                return parsed_rows
    flush_pending()
    return parsed_rows[:max_rows]


def _clean_table_cell(value: object) -> str:
    return " ".join(str(value or "").replace("\n", " ").split())


def _table_row_mapping(headers: list[str], cells: list[str]) -> dict[str, str]:
    mapping: dict[str, str] = {}
    for index, header in enumerate(headers):
        normalized_header = _normalize_header(header)
        if not normalized_header:
            continue
        value = cells[index] if index < len(cells) else ""
        mapping[header] = value
    return mapping


def _value_from_mapping(raw_row: dict[str, str], header_map: dict[str, str], candidates: Iterable[str]) -> str:
    original = _find_header(header_map, candidates)
    if original and raw_row.get(original) not in (None, ""):
        return str(raw_row.get(original) or "").strip()
    return ""


def _merge_table_continuation(pending: dict[str, str], continuation: dict[str, str]) -> None:
    for header, value in continuation.items():
        if not value:
            continue
        normalized = _normalize_header(header)
        if not pending.get(header):
            pending[header] = value
        elif normalized in {_normalize_header(item) for item in DESCRIPTION_COLUMNS | REFERENCE_COLUMNS}:
            pending[header] = f"{pending[header]} {value}".strip()


def _row_from_text_line(index: int, line: str) -> StatementRow:
    date_match = re.search(TEXT_DATE_PATTERN, line)
    if not date_match:
        raise StatementImportError("Missing transaction date")
    posted_at = _parse_date_value(date_match.group(1))

    money_matches = list(
        re.finditer(r"(?:Rs\.?|INR|₹)?\s*[-(]?\d[\d,]*(?:\.\d{1,2})?\)?\s*(?:CR|DR)?", line, re.IGNORECASE)
    )
    money_matches = [m for m in money_matches if re.search(r"\d", m.group(0))]
    money_matches = _transaction_money_matches(line, date_match.span())
    if not money_matches:
        raise StatementImportError("Missing transaction amount")
    amount_match = _select_transaction_amount_match(line, money_matches)
    amount_text = amount_match.group(0)
    direction_text = _infer_text_direction(line, amount_text)
    if re.search(r"\bDR\b|debit|paid|sent|withdraw", amount_text, re.IGNORECASE):
        direction_text = "debit"
    direction, amount_paise = _amount_and_direction(amount_text=amount_text, direction_text=direction_text)

    description = line[: amount_match.start()]
    description = description.replace(date_match.group(1), "", 1)
    description = _clean_description(description)
    if not description:
        description = "Statement entry"
    row = StatementRow(
        row_id="",
        posted_at=posted_at,
        description=description,
        amount_paise=amount_paise,
        direction=direction,
        category=guess_category(description, direction),
        confidence="medium",
        reference=_extract_reference(line),
        notes=("Parsed from statement text. Review before importing.",) if len(money_matches) > 1 else (),
    )
    return _with_row_id(row, index)


def _statement_text_candidates(text: str) -> list[str]:
    candidates: list[str] = []
    current: list[str] = []
    for raw_line in text.splitlines():
        compact = " ".join(raw_line.strip().split())
        if len(compact) < 3 or _is_statement_noise_line(compact):
            continue
        if re.match(TEXT_DATE_PATTERN, compact):
            if current:
                candidates.append(" ".join(current))
            current = [compact]
        elif current:
            current.append(compact)
            if len(" ".join(current)) > 600:
                candidates.append(" ".join(current))
                current = []
    if current:
        candidates.append(" ".join(current))
    return candidates


def _is_statement_noise_line(line: str) -> bool:
    normalized = line.casefold()
    noise_tokens = (
        "statement of account",
        "account statement",
        "account number",
        "customer id",
        "branch address",
        "opening balance",
        "closing balance",
        "total debit",
        "total credit",
        "page ",
        "txn date value",
        "date narration",
        "withdrawal amt",
        "deposit amt",
        "available balance",
    )
    return any(token in normalized for token in noise_tokens)


def _transaction_money_matches(line: str, primary_date_span: tuple[int, int]) -> list[re.Match]:
    raw_matches = list(
        re.finditer(r"(?:Rs\.?|INR|₹)?\s*[-(]?\d[\d,]*(?:\.\d{1,2})?\)?\s*(?:CR|DR)?", line, re.IGNORECASE)
    )
    filtered = [
        match
        for match in raw_matches
        if re.search(r"\d", match.group(0)) and not _is_non_amount_match(line, match, primary_date_span)
    ]
    return filtered or [match for match in raw_matches if re.search(r"\d", match.group(0))]


def _is_non_amount_match(line: str, match: re.Match, primary_date_span: tuple[int, int]) -> bool:
    start, end = match.span()
    raw = match.group(0)
    leading_spaces = len(raw) - len(raw.lstrip())
    trailing_spaces = len(raw) - len(raw.rstrip())
    trimmed_start = start + leading_spaces
    trimmed_end = end - trailing_spaces
    if trimmed_start >= primary_date_span[0] and trimmed_end <= primary_date_span[1]:
        return True
    before = line[trimmed_start - 1] if trimmed_start > 0 else ""
    after = line[trimmed_end] if trimmed_end < len(line) else ""
    if before.isalnum() or after.isalnum():
        return True
    if before in {"/", "-"} or after in {"/", "-"}:
        return True
    raw = raw.strip()
    numeric = re.sub(r"\D", "", raw)
    if "." not in raw and len(numeric) <= 2:
        return True
    if re.fullmatch(r"20\d{2}|19\d{2}", numeric):
        return True
    if "." not in raw and len(numeric) >= 6:
        return True
    return False


def _select_transaction_amount_match(line: str, money_matches: list[re.Match]) -> re.Match:
    for match in money_matches:
        if re.search(r"\b(CR|DR)\b", match.group(0), re.IGNORECASE):
            return match
    if len(money_matches) >= 2:
        # Text-extracted bank/PDF rows usually end with running balance.
        # The transaction amount is the amount immediately before that.
        return money_matches[-2]
    return money_matches[-1]


def _infer_text_direction(line: str, amount_text: str) -> str:
    amount_hint = amount_text.casefold()
    if any(token in amount_hint for token in ("cr", "credit")):
        return "credit"
    if any(token in amount_hint for token in ("dr", "debit")):
        return "debit"
    text = line.casefold()
    if re.search(r"\b(by|cr|credit|received|deposit|refund|cashback|interest)\b", text):
        return "credit"
    if re.search(r"\b(to|dr|debit|paid|sent|withdraw|upi/dr|atm|pos)\b", text):
        return "debit"
    return "debit"


def _with_row_id(row: StatementRow, index: int) -> StatementRow:
    seed = f"{index}|{row.posted_at.date().isoformat()}|{row.direction}|{row.amount_paise}|{row.description}"
    return StatementRow(
        row_id=uuid.uuid5(uuid.NAMESPACE_URL, seed).hex,
        posted_at=row.posted_at,
        description=row.description,
        amount_paise=row.amount_paise,
        direction=row.direction,
        category=row.category,
        confidence=row.confidence,
        reference=row.reference,
        balance_paise=row.balance_paise,
        notes=row.notes,
    )


def _amount_and_direction(
    *,
    debit_text: str = "",
    credit_text: str = "",
    amount_text: str = "",
    direction_text: str = "",
    description_text: str = "",
) -> tuple[str, int]:
    debit = _parse_money_to_paise(debit_text)
    credit = _parse_money_to_paise(credit_text)
    if debit and credit:
        raise StatementImportError("Both debit and credit values present")
    if debit:
        return "debit", debit
    if credit:
        return "credit", credit

    amount = _parse_money_to_paise(amount_text)
    if not amount:
        raise StatementImportError("Missing amount")

    direction_hint = " ".join((direction_text or "", amount_text or "", description_text or "")).casefold()
    if any(token in direction_hint for token in ("cr", "credit", "received", "deposit")):
        return "credit", amount
    if any(token in direction_hint for token in ("dr", "debit", "paid", "sent", "withdraw")):
        return "debit", amount
    if str(amount_text).strip().startswith("-") or str(amount_text).strip().startswith("("):
        return "debit", amount
    raise StatementImportError("Single amount column needs a debit/credit marker")


def _parse_money_to_paise(value: str | int | float | Decimal | None, allow_zero: bool = False) -> int | None:
    if value in (None, ""):
        return None
    text = str(value).strip()
    if not text:
        return None
    text = text.replace("₹", "").replace("INR", "").replace("Rs.", "").replace("Rs", "")
    text = re.sub(r"\b(CR|DR)\b", "", text, flags=re.IGNORECASE)
    negative_parentheses = text.startswith("(") and text.endswith(")")
    text = text.strip("()").replace(",", "").replace(" ", "")
    text = text.lstrip("+")
    if text.startswith("-"):
        text = text[1:]
    if not text:
        return None
    try:
        amount = Decimal(text)
    except InvalidOperation:
        return None
    paise = int((abs(amount) * Decimal("100")).quantize(Decimal("1"), rounding=ROUND_HALF_UP))
    if paise == 0 and not allow_zero:
        return None
    return paise if not negative_parentheses or paise else None


def _parse_date_value(value: str | dt.datetime | dt.date | None) -> dt.datetime:
    if isinstance(value, dt.datetime):
        return value.replace(tzinfo=None)
    if isinstance(value, dt.date):
        return dt.datetime(value.year, value.month, value.day, 12, 0, 0)
    text = str(value or "").strip()
    if not text:
        raise StatementImportError("Missing date")
    text = re.sub(r"\s+", " ", text)
    for fmt in DATE_FORMATS:
        try:
            parsed = dt.datetime.strptime(text, fmt)
            return parsed.replace(hour=12, minute=0, second=0, microsecond=0)
        except ValueError:
            continue
    try:
        parsed_date = dt.date.fromisoformat(text[:10])
        return dt.datetime(parsed_date.year, parsed_date.month, parsed_date.day, 12, 0, 0)
    except ValueError as exc:
        raise StatementImportError("Unsupported date format") from exc


def _clean_description(value: str) -> str:
    cleaned = " ".join(str(value or "").strip().split())
    cleaned = re.sub(r"\s+", " ", cleaned)
    return cleaned[:120]


def _normalize_header(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", value.casefold()).strip()


def _trim_to_statement_header(text: str, dialect: csv.Dialect) -> str:
    lines = text.splitlines()
    if not lines:
        return text
    try:
        rows = list(csv.reader(io.StringIO(text), dialect=dialect))
    except csv.Error:
        return text
    for index, row in enumerate(rows[:50]):
        normalized = {_normalize_header(cell) for cell in row if str(cell or "").strip()}
        if _looks_like_statement_header(normalized):
            return "\n".join(lines[index:])
    return text


def _looks_like_statement_header(normalized_headers: set[str]) -> bool:
    has_date = bool(normalized_headers & {_normalize_header(value) for value in DATE_COLUMNS})
    has_description = bool(normalized_headers & {_normalize_header(value) for value in DESCRIPTION_COLUMNS})
    has_amount = bool(
        normalized_headers
        & {
            *{_normalize_header(value) for value in DEBIT_COLUMNS},
            *{_normalize_header(value) for value in CREDIT_COLUMNS},
            *{_normalize_header(value) for value in AMOUNT_COLUMNS},
        }
    )
    return has_date and has_description and has_amount


def _find_header(header_map: dict[str, str], candidates: Iterable[str]) -> str | None:
    normalized_candidates = {_normalize_header(candidate) for candidate in candidates}
    for candidate in normalized_candidates:
        if candidate in header_map:
            return header_map[candidate]
    for header, original in header_map.items():
        for candidate in normalized_candidates:
            if len(candidate) >= 4 and candidate in header:
                return original
    return None


def _decode_statement_text(content: bytes) -> str:
    if not content:
        raise StatementImportError("Uploaded statement is empty")
    for encoding in ("utf-8-sig", "utf-8", "cp1252", "latin-1"):
        try:
            return content.decode(encoding)
        except UnicodeDecodeError:
            continue
    raise StatementImportError("Could not decode statement text")


def _extract_pdf_text(content: bytes, password: str | None = None) -> str:
    try:
        from pypdf import PdfReader
    except ImportError as exc:
        raise StatementImportError("PDF import needs the pypdf package. Use CSV export for this build.") from exc

    try:
        reader = PdfReader(io.BytesIO(content))
        if reader.is_encrypted:
            if not password:
                raise StatementImportError("This PDF is password protected. Enter the password to preview it.")
            if reader.decrypt(password) == 0:
                raise StatementImportError("Could not open the PDF with that password.")
        pages = [page.extract_text() or "" for page in reader.pages[:20]]
    except StatementImportError:
        raise
    except Exception as exc:  # pragma: no cover - library-specific PDF failures vary.
        error_text = str(exc).casefold()
        if "aes" in error_text or "cryptography" in error_text or "pycryptodome" in error_text:
            raise StatementImportError(
                "This encrypted PDF needs PDF crypto support. Reinstall backend requirements, then retry with the PDF password."
            ) from exc
        raise StatementImportError("Could not read this PDF. Export CSV from the bank portal for best results.") from exc
    text = "\n".join(pages).strip()
    if not text:
        raise StatementImportError("This PDF has no selectable text. Upload CSV or a text-based statement PDF.")
    return text


def _extract_reference(text: str) -> str | None:
    stripped = str(text or "").strip()
    if re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9-]{5,31}", stripped) and re.search(r"\d", stripped):
        return stripped.replace("-", "").upper()
    patterns = (
        r"\b(?:UPI|UTR|Ref|Reference|Txn|Transaction)\s*(?:No|ID|Number)?\.?\s*[:#-]?\s*([A-Za-z0-9]{8,24})\b",
        r"\b([0-9]{10,18})\b",
    )
    for pattern in patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            return match.group(1).upper()
    return None


def guess_category(description: str, direction: str = "debit") -> str:
    if direction == "credit":
        desc = description.casefold()
        if any(token in desc for token in ("refund", "cashback", "reversal")):
            return "refund"
        return "allowance"
    desc = description.casefold()
    for category, keywords in CATEGORY_KEYWORDS.items():
        if any(keyword in desc for keyword in keywords):
            return category
    return "other"
