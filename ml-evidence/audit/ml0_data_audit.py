"""
ML0 Data Audit｜Buyer Risk ML Evidence Sprint
=============================================

用途：在建立任何模型之前，先檢查資料本身長什麼樣子。
這支腳本「只讀取、不修改」原始資料，也不訓練任何模型。

只使用 Python 內建模組，不需要安裝套件。

執行方式（在專案根目錄 C:\\ai_financetrust）：
    python ml-evidence/audit/ml0_data_audit.py

輸出：
    1. 在 Terminal 印出稽核結果
    2. 同時寫入 ml-evidence/reports/ml0_data_audit.md
"""

import csv
import statistics
import sys
from collections import Counter, defaultdict
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data"
REPORT_DIR = ROOT / "reports"

DATE_FORMATS = ["%m/%d/%Y", "%Y-%m-%d", "%d/%m/%Y", "%m/%d/%y", "%Y/%m/%d"]
MISSING_TOKENS = {"", "na", "n/a", "nan", "null", "none", "-"}

lines = []


def out(text=""):
    print(text)
    lines.append(text)


def is_missing(value):
    return value is None or value.strip().lower() in MISSING_TOKENS


def pct(part, whole):
    return f"{(100 * part / whole):.1f}%" if whole else "n/a"


def quantiles(values):
    if not values:
        return "n/a"
    values = sorted(values)

    def q(p):
        index = min(len(values) - 1, max(0, round(p * (len(values) - 1))))
        return values[index]

    return (
        f"min={values[0]}, p25={q(0.25)}, median={q(0.5)}, "
        f"p75={q(0.75)}, p90={q(0.9)}, max={values[-1]}, mean={statistics.mean(values):.2f}"
    )


def detect_date_format(raw_values):
    """找出能解析「全部非空值」的日期格式；有歧義時回報所有可行格式。"""
    present = [v.strip() for v in raw_values if not is_missing(v)]
    if not present:
        return None, []
    working = []
    for fmt in DATE_FORMATS:
        try:
            for v in present:
                datetime.strptime(v, fmt)
            working.append(fmt)
        except ValueError:
            continue
    return (working[0] if working else None), working


def detect_type(raw_values):
    present = [v.strip() for v in raw_values if not is_missing(v)]
    if not present:
        return "empty"
    fmt, _ = detect_date_format(raw_values)
    if fmt:
        return f"date ({fmt})"
    try:
        nums = [float(v.replace(",", "")) for v in present]
        return "integer" if all(n.is_integer() for n in nums) else "float"
    except ValueError:
        return "text"


def find_column(columns, *keywords):
    lowered = {c.lower().replace("_", "").replace(" ", ""): c for c in columns}
    for kw in keywords:
        for key, original in lowered.items():
            if key == kw:
                return original
    for kw in keywords:
        for key, original in lowered.items():
            if kw in key:
                return original
    return None


def main():
    csv_files = sorted(DATA_DIR.glob("*.csv"))
    if not csv_files:
        print(f"找不到 CSV。請把資料放在：{DATA_DIR}")
        sys.exit(1)

    path = csv_files[0]
    if path.stat().st_size == 0:
        print(f"{path.name} 是空檔案（0 位元組），請重新從 Kaggle 下載並放到 {DATA_DIR}")
        sys.exit(1)
    with path.open(newline="", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        columns = reader.fieldnames or []
        rows = list(reader)

    out("# ML0 Data Audit")
    out()
    out(f"- 檔案：`{path.name}`（資料夾內共 {len(csv_files)} 個 CSV，只稽核第一個）")
    out(f"- 列數（rows）：{len(rows)}")
    out(f"- 欄數（columns）：{len(columns)}")
    out()

    # ---------- 1. 欄位、型別、缺漏 ----------
    out("## 1. 欄位、型別與缺漏值")
    out()
    out("| 欄位 | 推測型別 | 缺漏數 | 不重複值數 | 範例值 |")
    out("|---|---|---|---|---|")
    col_types = {}
    for col in columns:
        values = [r.get(col, "") for r in rows]
        col_types[col] = detect_type(values)
        missing = sum(is_missing(v) for v in values)
        uniques = len({v for v in values if not is_missing(v)})
        samples = ", ".join(list(dict.fromkeys(v for v in values if not is_missing(v)))[:3])
        out(f"| {col} | {col_types[col]} | {missing} ({pct(missing, len(rows))}) | {uniques} | {samples} |")
    out()

    # 日期欄位的格式歧義
    for col in columns:
        _, working = detect_date_format([r.get(col, "") for r in rows])
        if len(working) > 1:
            out(f"- 注意：`{col}` 可被多種日期格式解析 {working}，採用第一個。")
    out()

    # ---------- 2. 找出關鍵欄位 ----------
    c_customer = find_column(columns, "customerid", "customer")
    c_invoice_no = find_column(columns, "invoicenumber", "invoiceno", "invoiceid")
    c_invoice_date = find_column(columns, "invoicedate")
    c_due = find_column(columns, "duedate")
    c_settled = find_column(columns, "settleddate", "cleardate", "paymentdate")
    c_amount = find_column(columns, "invoiceamount", "amount")
    c_days_late = find_column(columns, "dayslate")
    c_days_settle = find_column(columns, "daystosettle")
    c_disputed = find_column(columns, "disputed")
    c_paperless_date = find_column(columns, "paperlessdate")
    c_paperless = find_column(columns, "paperlessbill")
    c_country = find_column(columns, "countrycode", "country")

    out("## 2. 自動辨識的關鍵欄位")
    out()
    for label, col in [
        ("Customer ID", c_customer), ("Invoice number", c_invoice_no),
        ("Invoice date", c_invoice_date), ("Due date", c_due), ("Settled date", c_settled),
        ("Invoice amount", c_amount), ("Days late", c_days_late), ("Days to settle", c_days_settle),
        ("Disputed", c_disputed), ("Paperless date", c_paperless_date),
        ("Paperless bill", c_paperless), ("Country", c_country),
    ]:
        out(f"- {label}: `{col}`" if col else f"- {label}: （找不到）")
    out()

    def parse_date(row, col):
        if not col or is_missing(row.get(col, "")):
            return None
        fmt = col_types[col].removeprefix("date (").removesuffix(")")
        try:
            return datetime.strptime(row[col].strip(), fmt).date()
        except ValueError:
            return None

    def parse_num(row, col):
        if not col or is_missing(row.get(col, "")):
            return None
        try:
            return float(row[col].replace(",", ""))
        except ValueError:
            return None

    for r in rows:
        r["_inv"] = parse_date(r, c_invoice_date)
        r["_due"] = parse_date(r, c_due)
        r["_settled"] = parse_date(r, c_settled)
        r["_paperless"] = parse_date(r, c_paperless_date)
        r["_late"] = parse_num(r, c_days_late)
        r["_to_settle"] = parse_num(r, c_days_settle)
        r["_amount"] = parse_num(r, c_amount)

    # ---------- 3. 日期範圍 ----------
    out("## 3. 日期範圍")
    out()
    for label, key in [("Invoice date", "_inv"), ("Due date", "_due"), ("Settled date", "_settled"), ("Paperless date", "_paperless")]:
        ds = [r[key] for r in rows if r[key]]
        out(f"- {label}: {min(ds)} ~ {max(ds)}（{len(ds)} 筆有值）" if ds else f"- {label}: 無資料")
    out()
    month_counts = Counter(r["_inv"].strftime("%Y-%m") for r in rows if r["_inv"])
    out("每月 invoice 數（依 invoice date）：")
    out()
    out("| 月份 | invoice 數 |")
    out("|---|---|")
    for month in sorted(month_counts):
        out(f"| {month} | {month_counts[month]} |")
    out()

    # ---------- 4. Customer ----------
    out("## 4. Customer 分布")
    out()
    if c_customer:
        per_customer = Counter(r[c_customer] for r in rows)
        counts = list(per_customer.values())
        out(f"- 不重複 customer 數：{len(per_customer)}")
        out(f"- 每個 customer 的 invoice 數：{quantiles(counts)}")
        buckets = [(1, 1), (2, 4), (5, 9), (10, 19), (20, 49), (50, 10**9)]
        out()
        out("| 每位 customer 的 invoice 數 | customer 數 |")
        out("|---|---|")
        for lo, hi in buckets:
            n = sum(lo <= c <= hi for c in counts)
            label = f"{lo}" if lo == hi else (f"{lo}+" if hi > 10**8 else f"{lo}–{hi}")
            out(f"| {label} | {n} |")
    out()

    # ---------- 5. Days Late 與 target ----------
    out("## 5. Days Late 分布與延遲比例")
    out()
    late_values = [int(r["_late"]) for r in rows if r["_late"] is not None]
    out(f"- `{c_days_late}`：{quantiles(late_values)}")
    out(f"- Days Late = 0 的比例：{pct(sum(v == 0 for v in late_values), len(late_values))}")
    out(f"- Days Late < 0 的筆數：{sum(v < 0 for v in late_values)}")
    out()
    out("| 門檻 | 依資料集 Days Late | 依 settled − due 重新計算 |")
    out("|---|---|---|")
    recomputed = [(r["_settled"] - r["_due"]).days for r in rows if r["_settled"] and r["_due"]]
    for t in (0, 7, 15, 30):
        a = sum(v > t for v in late_values)
        b = sum(v > t for v in recomputed)
        out(f"| late > {t} 天 | {a} ({pct(a, len(late_values))}) | {b} ({pct(b, len(recomputed))}) |")
    out()

    # Days Late 與日期是否一致
    mismatch_late = 0
    for r in rows:
        if r["_late"] is not None and r["_settled"] and r["_due"]:
            if int(r["_late"]) != max(0, (r["_settled"] - r["_due"]).days):
                mismatch_late += 1
    mismatch_settle = 0
    for r in rows:
        if r["_to_settle"] is not None and r["_settled"] and r["_inv"]:
            if int(r["_to_settle"]) != (r["_settled"] - r["_inv"]).days:
                mismatch_settle += 1
    out(f"- Days Late ≠ max(0, settled − due) 的筆數：{mismatch_late}")
    out(f"- Days To Settle ≠ settled − invoice 的筆數：{mismatch_settle}")
    out()

    # ---------- 6. Payment term ----------
    out("## 6. 付款帳期（due − invoice）")
    out()
    terms = [(r["_due"] - r["_inv"]).days for r in rows if r["_due"] and r["_inv"]]
    out(f"- {quantiles(terms)}")
    out(f"- 最常見帳期：{Counter(terms).most_common(5)}")
    out()

    # ---------- 7. Open invoices、重複、日期異常 ----------
    out("## 7. 資料品質")
    out()
    open_invoices = sum(1 for r in rows if not r["_settled"])
    out(f"- 尚未付款（settled date 空白）：{open_invoices}")
    full_dupes = len(rows) - len({tuple(r.get(c, "") for c in columns) for r in rows})
    out(f"- 完全重複的列：{full_dupes}")
    if c_invoice_no:
        inv_counts = Counter(r[c_invoice_no] for r in rows)
        out(f"- 重複的 invoice number：{sum(1 for v in inv_counts.values() if v > 1)} 個號碼")
    out(f"- settled 早於 invoice：{sum(1 for r in rows if r['_settled'] and r['_inv'] and r['_settled'] < r['_inv'])}")
    out(f"- due 早於 invoice：{sum(1 for r in rows if r['_due'] and r['_inv'] and r['_due'] < r['_inv'])}")
    out(f"- settled 早於 due（提早付款）：{sum(1 for r in rows if r['_settled'] and r['_due'] and r['_settled'] < r['_due'])}")
    amounts = [r["_amount"] for r in rows if r["_amount"] is not None]
    out(f"- invoice amount：{quantiles([round(a, 2) for a in amounts])}")
    out(f"- invoice amount ≤ 0：{sum(1 for a in amounts if a <= 0)}")
    out()

    # ---------- 8. Disputed / Paperless ----------
    out("## 8. Disputed 與 Paperless")
    out()
    if c_disputed:
        out(f"- Disputed 分布：{dict(Counter(r[c_disputed] for r in rows))}")
        groups = defaultdict(list)
        for r in rows:
            if r["_late"] is not None:
                groups[r[c_disputed]].append(r["_late"] > 7)
        for key, flags in groups.items():
            out(f"  - Disputed = {key}：late > 7 天比例 {pct(sum(flags), len(flags))}（{len(flags)} 筆）")
    if c_paperless:
        out(f"- Paperless bill 分布：{dict(Counter(r[c_paperless] for r in rows))}")
    if c_paperless_date:
        after = sum(1 for r in rows if r["_paperless"] and r["_inv"] and r["_paperless"] > r["_inv"])
        out(f"- Paperless date 晚於 invoice date：{after}（{pct(after, len(rows))}）")
        out("  - 若比例不低，代表 paperless 狀態可能是事後才記錄的，作為 feature 需注意時間語意")
    out()

    # ---------- 9. 歷史可用性（leakage 關鍵） ----------
    out("## 9. 預測當下可用的 Buyer 歷史")
    out()
    out("對每一張 invoice，在它的 invoice date 當下：")
    out("- A：同一 customer 更早開立的 invoice 數")
    out("- B：同一 customer 更早開立、而且**已經付款完成**的 invoice 數（只有 B 的付款結果在當下是已知的）")
    out()
    by_customer = defaultdict(list)
    if c_customer:
        for r in rows:
            if r["_inv"]:
                by_customer[r[c_customer]].append(r)
    prior_issued, prior_settled = [], []
    for invoices in by_customer.values():
        for r in invoices:
            prior_issued.append(sum(1 for o in invoices if o["_inv"] < r["_inv"]))
            prior_settled.append(sum(1 for o in invoices if o["_settled"] and o["_settled"] < r["_inv"]))
    out(f"- A 更早開立：{quantiles(prior_issued)}")
    out(f"- B 更早且已付款：{quantiles(prior_settled)}")
    out()
    out("| B（已知付款結果的歷史筆數） | invoice 數 |")
    out("|---|---|")
    for lo, hi in [(0, 0), (1, 2), (3, 4), (5, 9), (10, 19), (20, 10**9)]:
        n = sum(lo <= v <= hi for v in prior_settled)
        label = f"{lo}" if lo == hi else (f"{lo}+" if hi > 10**8 else f"{lo}–{hi}")
        out(f"| {label} | {n} ({pct(n, len(prior_settled))}) |")
    same_day = sum(
        1 for invoices in by_customer.values() for r in invoices
        for o in invoices if o is not r and o["_inv"] == r["_inv"]
    )
    out()
    out(f"- 同一 customer 同一天開立多張 invoice 的配對數：{same_day}（同日的 invoice 不應互相當作歷史）")
    out()

    # ---------- 10. 時間切割預覽 ----------
    out("## 10. 依時間切割預覽（70% / 15% / 15%，尚未建模）")
    out()
    dated = sorted((r for r in rows if r["_inv"]), key=lambda r: r["_inv"])
    n = len(dated)
    if n < 10:
        out("- 有效 invoice 太少，無法預覽切割")
        return
    cut1, cut2 = dated[int(n * 0.70)]["_inv"], dated[int(n * 0.85)]["_inv"]
    splits = {
        "train": [r for r in dated if r["_inv"] < cut1],
        "validation": [r for r in dated if cut1 <= r["_inv"] < cut2],
        "test": [r for r in dated if r["_inv"] >= cut2],
    }
    out(f"- 切點：train < {cut1} ≤ validation < {cut2} ≤ test（同一天不會被拆到兩邊）")
    out()
    out("| 區段 | invoice 數 | 日期範圍 | late > 7 天比例 | customer 數 |")
    out("|---|---|---|---|---|")
    for name, part in splits.items():
        if not part:
            out(f"| {name} | 0 | - | - | - |")
            continue
        late7 = sum(1 for r in part if r["_late"] is not None and r["_late"] > 7)
        custs = len({r[c_customer] for r in part}) if c_customer else "-"
        out(f"| {name} | {len(part)} | {part[0]['_inv']} ~ {part[-1]['_inv']} | {pct(late7, len(part))} | {custs} |")
    if c_customer:
        train_customers = {r[c_customer] for r in splits["train"]}
        unseen = {r[c_customer] for r in splits["test"]} - train_customers
        out()
        out(f"- test 中、train 期間從未出現的 customer：{len(unseen)}")
    # train 期結束時仍未付款（label 在切點當下還未知）
    unresolved = sum(1 for r in splits["train"] if r["_settled"] and r["_settled"] >= cut1)
    out(f"- train 區段中，付款日落在 validation 開始之後的 invoice：{unresolved}（這些 label 在 train 截止時還不知道）")
    out()

    REPORT_DIR.mkdir(parents=True, exist_ok=True)
    report_path = REPORT_DIR / "ml0_data_audit.md"
    report_path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"\n報告已寫入：{report_path}")


if __name__ == "__main__":
    main()
