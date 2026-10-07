"""
ML1｜Buyer Late-Payment Risk — Methodology Validation
=====================================================

研究問題：
    企業能否利用 Buyer 過去的 invoice 付款紀錄，在一張新 invoice 開立的當下，
    估計這張 invoice 逾期超過 7 天的風險？

這是 late-payment risk 的方法驗證，不是違約機率（PD）模型，
也不是可直接上線的企業信用評分模型。

執行方式（在專案根目錄）：
    python ml-evidence/ml1/ml1_buyer_risk.py

輸出：
    ml-evidence/reports/ml1_results.md      實驗報告（彙總統計，不含原始資料）
    ml-evidence/data/ml1_features.csv       特徵表（衍生自原始資料，不進 Git）

需要套件：pandas、numpy、scikit-learn（見 ml-evidence/requirements.txt）
"""

from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.impute import SimpleImputer
from sklearn.inspection import permutation_importance
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    accuracy_score,
    average_precision_score,
    brier_score_loss,
    f1_score,
    precision_recall_curve,
    precision_score,
    recall_score,
    roc_auc_score,
)
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler

SEED = 20260707
ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data"
REPORT_PATH = ROOT / "reports" / "ml1_results.md"
FEATURE_PATH = DATA_DIR / "ml1_features.csv"

DATE_FORMAT = "%m/%d/%Y"
BUCKETS = [(0, 4, "0–4"), (5, 9, "5–9"), (10, 10**9, "10+")]

# 這些欄位描述「這張 invoice 自己的結果」或身分，絕對不能進模型
FORBIDDEN_COLUMNS = {
    "customerID", "invoiceNumber", "SettledDate", "DaysToSettle", "DaysLate",
    "Disputed", "PaperlessDate", "PaperlessBill", "DueDate", "InvoiceDate",
    "late_7d", "late_15d", "label_known_7d", "label_known_15d",
}

NUMERIC_FEATURES = [
    "invoice_amount",
    "prior_invoice_count",
    "prior_on_time_rate",
    "prior_late_7d_rate",
    "prior_late_30d_rate",
    "prior_avg_days_late",
    "prior_median_days_late",
    "recent_3_invoice_avg_days_late",
    "prior_avg_invoice_amount",
    "current_amount_vs_prior_avg",
    "prior_dispute_rate",
]
CATEGORICAL_FEATURES = ["countryCode"]

FEATURE_RATIONALE = {
    "invoice_amount": "本張 invoice 金額：開票當下即已知。",
    "countryCode": "Buyer 所在國家代碼：客戶層級的固定屬性，開票當下已知。",
    "prior_invoice_count": "開票日之前「已付款完成」的同一 Buyer invoice 數；0 代表真的沒有可用歷史。",
    "prior_on_time_rate": "上述歷史中準時付款（DaysLate = 0）的比例；無歷史時為 NaN。",
    "prior_late_7d_rate": "上述歷史中逾期 > 7 天的比例；無歷史時為 NaN。",
    "prior_late_30d_rate": "上述歷史中逾期 > 30 天的比例；無歷史時為 NaN。",
    "prior_avg_days_late": "上述歷史的平均逾期天數；無歷史時為 NaN。",
    "prior_median_days_late": "上述歷史的逾期天數中位數；無歷史時為 NaN。",
    "recent_3_invoice_avg_days_late": "上述歷史中，開票日最近的至多 3 張的平均逾期天數；無歷史時為 NaN。",
    "prior_avg_invoice_amount": "開票日「之前開立」的同一 Buyer invoice 平均金額（金額在開立時即已知，不需等付款）；無時為 NaN。",
    "current_amount_vs_prior_avg": "本張金額 ÷ prior_avg_invoice_amount；無比較基礎時為 NaN。",
    "prior_dispute_rate": "已付款完成的歷史 invoice 中曾有 dispute 的比例（假設 dispute 狀態在付款完成時已確定）；無歷史時為 NaN。",
}

report = []


def w(text=""):
    print(text)
    report.append(text)


def fmt(x, digits=3):
    if x is None or (isinstance(x, float) and np.isnan(x)):
        return "n/a"
    return f"{x:.{digits}f}"


# =====================================================================
# 1. 載入資料與 target
# =====================================================================

def load_data():
    csv_files = sorted(p for p in DATA_DIR.glob("*.csv") if p.name != FEATURE_PATH.name)
    if not csv_files:
        raise SystemExit(f"找不到原始 CSV，請放在 {DATA_DIR}")
    path = csv_files[0]
    if path.stat().st_size == 0:
        raise SystemExit(f"{path.name} 是空檔案，請重新從 Kaggle 下載。")

    df = pd.read_csv(path, dtype={"countryCode": str, "customerID": str, "invoiceNumber": str})
    for col in ["InvoiceDate", "DueDate", "SettledDate", "PaperlessDate"]:
        df[col] = pd.to_datetime(df[col], format=DATE_FORMAT)

    days_late_from_dates = (df["SettledDate"] - df["DueDate"]).dt.days.clip(lower=0)
    if not (days_late_from_dates == df["DaysLate"]).all():
        raise SystemExit("DaysLate 與 SettledDate − DueDate 不一致，請停下來檢查資料。")

    df["late_7d"] = (df["DaysLate"] > 7).astype(int)
    df["late_15d"] = (df["DaysLate"] > 15).astype(int)

    # label 何時可知：
    #   正例：到期日 + (門檻 + 1) 天仍未付款，就已確定逾期超過門檻
    #   負例：要等到實際付款日才能確定沒有超過門檻
    for name, threshold in [("7d", 7), ("15d", 15)]:
        positive_known = df["DueDate"] + pd.Timedelta(days=threshold + 1)
        df[f"label_known_{name}"] = np.where(df[f"late_{name}"] == 1, positive_known, df["SettledDate"])
        df[f"label_known_{name}"] = pd.to_datetime(df[f"label_known_{name}"])

    return path, df.sort_values(["InvoiceDate", "invoiceNumber"]).reset_index(drop=True)


# =====================================================================
# 2. Leakage-safe 歷史特徵
# =====================================================================

def build_history_features(df):
    """
    對每一張 invoice i，只使用同一 Buyer 的 invoice j，且：
      - 付款結果類特徵：j.SettledDate < i.InvoiceDate（結果在 i 開票前已完全確定）
      - 金額類特徵：j.InvoiceDate < i.InvoiceDate（金額在開立時即已知）
    同一天開立的 invoice 不會互相成為歷史（日期必須「嚴格早於」）。
    """
    records = []
    for _, group in df.groupby("customerID", sort=False):
        group = group.sort_values("InvoiceDate")
        inv = group["InvoiceDate"].to_numpy()
        settled = group["SettledDate"].to_numpy()
        days_late = group["DaysLate"].to_numpy(dtype=float)
        disputed = (group["Disputed"] == "Yes").to_numpy(dtype=float)
        amount = group["InvoiceAmount"].to_numpy(dtype=float)

        for k, idx in enumerate(group.index):
            resolved = settled < inv[k]
            issued_before = inv < inv[k]
            n = int(resolved.sum())
            row = {"row_id": idx, "prior_invoice_count": n}
            if n > 0:
                dl = days_late[resolved]
                order = np.argsort(inv[resolved])
                row.update(
                    prior_on_time_rate=float((dl == 0).mean()),
                    prior_late_7d_rate=float((dl > 7).mean()),
                    prior_late_30d_rate=float((dl > 30).mean()),
                    prior_avg_days_late=float(dl.mean()),
                    prior_median_days_late=float(np.median(dl)),
                    recent_3_invoice_avg_days_late=float(dl[order][-3:].mean()),
                    prior_dispute_rate=float(disputed[resolved].mean()),
                )
            else:
                row.update(
                    prior_on_time_rate=np.nan, prior_late_7d_rate=np.nan,
                    prior_late_30d_rate=np.nan, prior_avg_days_late=np.nan,
                    prior_median_days_late=np.nan, recent_3_invoice_avg_days_late=np.nan,
                    prior_dispute_rate=np.nan,
                )
            if issued_before.any():
                avg_amount = float(amount[issued_before].mean())
                row["prior_avg_invoice_amount"] = avg_amount
                row["current_amount_vs_prior_avg"] = float(amount[k] / avg_amount) if avg_amount > 0 else np.nan
            else:
                row["prior_avg_invoice_amount"] = np.nan
                row["current_amount_vs_prior_avg"] = np.nan
            records.append(row)

    features = pd.DataFrame(records).set_index("row_id").sort_index()
    out = df.join(features)
    out["invoice_amount"] = out["InvoiceAmount"]
    return out


def independent_history_check(df, sample_size=300):
    """用另一種寫法（逐筆掃描全表）重算歷史特徵，抽樣比對，確保沒有洩漏或計算錯誤。"""
    rng = np.random.default_rng(SEED)
    sample = rng.choice(df.index.to_numpy(), size=min(sample_size, len(df)), replace=False)
    mismatches = 0
    for i in sample:
        r = df.loc[i]
        hist = df[(df["customerID"] == r["customerID"]) & (df["SettledDate"] < r["InvoiceDate"])]
        expected_count = len(hist)
        expected_late7 = (hist["DaysLate"] > 7).mean() if len(hist) else np.nan
        same_day_leak = ((hist["InvoiceDate"] >= r["InvoiceDate"]).any()) if len(hist) else False
        ok_count = expected_count == r["prior_invoice_count"]
        ok_rate = (np.isnan(expected_late7) and np.isnan(r["prior_late_7d_rate"])) or \
                  np.isclose(expected_late7, r["prior_late_7d_rate"])
        if not (ok_count and ok_rate) or same_day_leak:
            mismatches += 1
    return len(sample), mismatches


# =====================================================================
# 3. 依時間切割 + label 可知性 purge
# =====================================================================

def make_splits(df, target):
    dates = df["InvoiceDate"].sort_values().reset_index(drop=True)
    cut_val = dates.iloc[int(len(dates) * 0.70)]
    cut_test = dates.iloc[int(len(dates) * 0.85)]

    raw = {
        "train": df[df["InvoiceDate"] < cut_val],
        "validation": df[(df["InvoiceDate"] >= cut_val) & (df["InvoiceDate"] < cut_test)],
        "test": df[df["InvoiceDate"] >= cut_test],
    }
    known = f"label_known_{target.split('_')[1]}"
    purged = {
        "train": raw["train"][raw["train"][known] < cut_val],
        "validation": raw["validation"][raw["validation"][known] < cut_test],
        "test": raw["test"],
    }
    return cut_val, cut_test, raw, purged


# =====================================================================
# 4. 模型
# =====================================================================

def make_logistic(features_cat):
    numeric = Pipeline([
        ("impute", SimpleImputer(strategy="median", add_indicator=True)),
        ("scale", StandardScaler()),
    ])
    transformers = [("num", numeric, NUMERIC_FEATURES)]
    if features_cat:
        transformers.append(("cat", OneHotEncoder(handle_unknown="ignore"), features_cat))
    return Pipeline([
        ("prep", ColumnTransformer(transformers)),
        ("model", LogisticRegression(max_iter=2000, random_state=SEED)),
    ])


def make_gbm(features_cat):
    # HistGradientBoosting 原生支援 NaN，不需要補值
    transformers = [("num", "passthrough", NUMERIC_FEATURES)]
    if features_cat:
        transformers.append(("cat", OneHotEncoder(handle_unknown="ignore", sparse_output=False), features_cat))
    return Pipeline([
        ("prep", ColumnTransformer(transformers)),
        ("model", HistGradientBoostingClassifier(
            learning_rate=0.05, max_iter=200, max_leaf_nodes=15,
            min_samples_leaf=20, l2_regularization=1.0,
            early_stopping=False, random_state=SEED,
        )),
    ])


def columns_for(features_cat):
    return NUMERIC_FEATURES + features_cat


def choose_threshold(y, p):
    """只在 validation 上選 threshold：取 F1 最大的點。"""
    precision, recall, thresholds = precision_recall_curve(y, p)
    f1 = 2 * precision * recall / np.clip(precision + recall, 1e-12, None)
    best = int(np.nanargmax(f1[:-1])) if len(thresholds) else 0
    return float(thresholds[best]) if len(thresholds) else 0.5


def bootstrap_ci(y, p, metric, n=1000):
    rng = np.random.default_rng(SEED)
    y, p = np.asarray(y), np.asarray(p)
    values = []
    for _ in range(n):
        idx = rng.integers(0, len(y), len(y))
        if y[idx].min() == y[idx].max():
            continue
        values.append(metric(y[idx], p[idx]))
    return (np.percentile(values, 2.5), np.percentile(values, 97.5)) if values else (np.nan, np.nan)


def evaluate(y, p, threshold, with_ci=False):
    y = np.asarray(y)
    pred = (p >= threshold).astype(int)
    result = {
        "n": len(y),
        "positives": int(y.sum()),
        "prevalence": float(y.mean()),
        "pr_auc": average_precision_score(y, p) if y.min() != y.max() else np.nan,
        "roc_auc": roc_auc_score(y, p) if y.min() != y.max() else np.nan,
        "brier": brier_score_loss(y, p),
        "precision": precision_score(y, pred, zero_division=0),
        "recall": recall_score(y, pred, zero_division=0),
        "f1": f1_score(y, pred, zero_division=0),
        "accuracy": accuracy_score(y, pred),
        "mean_pred": float(np.mean(p)),
    }
    if with_ci and y.min() != y.max():
        result["pr_auc_ci"] = bootstrap_ci(y, p, average_precision_score)
        result["roc_auc_ci"] = bootstrap_ci(y, p, roc_auc_score)
    return result


def calibration_table(y, p, bins=5):
    frame = pd.DataFrame({"y": np.asarray(y), "p": p})
    frame["bin"] = pd.qcut(frame["p"], q=bins, duplicates="drop")
    table = frame.groupby("bin", observed=True).agg(n=("y", "size"), mean_pred=("p", "mean"), observed=("y", "mean"))
    return table.reset_index(drop=True)


def bucket_of(count):
    for lo, hi, label in BUCKETS:
        if lo <= count <= hi:
            return label
    return "?"


# =====================================================================
# 5. 一次完整實驗（給定 target 與是否使用 countryCode）
# =====================================================================

def run_experiment(df, target, use_country=True):
    cut_val, cut_test, raw, split = make_splits(df, target)
    cat = CATEGORICAL_FEATURES if use_country else []
    cols = columns_for(cat)
    assert not (set(cols) & FORBIDDEN_COLUMNS), "禁止欄位進入模型"

    train, val, test = split["train"], split["validation"], split["test"]
    results = {}
    for name, factory in [("logistic", make_logistic), ("gbm", make_gbm)]:
        model = factory(cat)
        model.fit(train[cols], train[target])
        p_val = model.predict_proba(val[cols])[:, 1]
        threshold = choose_threshold(val[target], p_val)
        p_test = model.predict_proba(test[cols])[:, 1]
        results[name] = {
            "model": model,
            "threshold": threshold,
            "val": evaluate(val[target], p_val, threshold),
            "test": evaluate(test[target], p_test, threshold, with_ci=True),
            "p_test": p_test,
            "p_val": p_val,
        }

    # 參考基準：只看「過去逾期 > 7 天比例」的簡單規則（無歷史時用 train 平均）
    train_rate = train[target].mean()
    rule_col = "prior_late_7d_rate"
    rule_val = val[rule_col].fillna(train_rate).to_numpy()
    rule_test = test[rule_col].fillna(train_rate).to_numpy()
    rule_threshold = choose_threshold(val[target], rule_val)
    results["rule"] = {
        "threshold": rule_threshold,
        "val": evaluate(val[target], rule_val, rule_threshold),
        "test": evaluate(test[target], rule_test, rule_threshold, with_ci=True),
        "p_test": rule_test,
    }
    return cut_val, cut_test, raw, split, cols, results


# =====================================================================
# 6. 報告
# =====================================================================

def metrics_table(results, part):
    w(f"| 模型 | n | 正例 | 基準（正例比例） | PR-AUC | ROC-AUC | Brier | 平均預測 | Precision | Recall | F1 | Accuracy |")
    w("|---|---|---|---|---|---|---|---|---|---|---|---|")
    names = {"rule": "簡單規則（過去逾期 > 7 天比例，不經訓練）", "logistic": "Logistic Regression", "gbm": "Gradient Boosting"}
    for key in ["rule", "logistic", "gbm"]:
        m = results[key][part]
        pr = fmt(m["pr_auc"])
        roc = fmt(m["roc_auc"])
        if "pr_auc_ci" in m:
            pr += f" [{fmt(m['pr_auc_ci'][0])}, {fmt(m['pr_auc_ci'][1])}]"
            roc += f" [{fmt(m['roc_auc_ci'][0])}, {fmt(m['roc_auc_ci'][1])}]"
        w(f"| {names[key]} | {m['n']} | {m['positives']} | {fmt(m['prevalence'])} | {pr} | {roc} | "
          f"{fmt(m['brier'])} | {fmt(m['mean_pred'])} | {fmt(m['precision'])} | {fmt(m['recall'])} | "
          f"{fmt(m['f1'])} | {fmt(m['accuracy'])} |")
    w()
    w("註：簡單規則的分數是歷史比例，不是校準過的機率，它的 Brier 與平均預測僅供參考。")
    w()


def main():
    path, df = load_data()
    df = build_history_features(df)

    w("# ML1｜Buyer Late-Payment Risk 方法驗證")
    w()
    w(f"- 資料：`{path.name}`（{len(df)} 張 invoice、{df['customerID'].nunique()} 個 Buyer）")
    w("- 來源：Kaggle — Finance Factoring – IBM Late Payment Histories")
    w("- 性質：IBM 示範資料集（很可能為模擬資料），僅用於方法驗證")
    w(f"- 隨機種子：{SEED}")
    w()

    # ---------- 1–2. Feature list ----------
    w("## 1. 最終特徵與預測當下可用性")
    w()
    w("| 特徵 | 型別 | 預測當下的依據 |")
    w("|---|---|---|")
    for f in NUMERIC_FEATURES:
        w(f"| `{f}` | 數值 | {FEATURE_RATIONALE[f]} |")
    for f in CATEGORICAL_FEATURES:
        w(f"| `{f}` | 類別（one-hot） | {FEATURE_RATIONALE[f]} |")
    w()
    w("排除：`customerID`、`invoiceNumber`（身分／編號）；本張的 `SettledDate`、`DaysToSettle`、`DaysLate`、"
      "`Disputed`（結果或事後才知道）；`PaperlessDate`、`PaperlessBill`（時間語意不確定）；"
      "`DueDate`（全部等於開票日 + 30 天，沒有資訊量）。")
    w()
    w("缺漏處理：沒有歷史時特徵保留 NaN。Logistic Regression 以 train 中位數補值並加上「是否缺漏」指標欄；"
      "Gradient Boosting 原生處理 NaN。`prior_invoice_count = 0` 是真正的 0，不是補值。")
    w()

    # ---------- 3–4. Splits ----------
    w("## 2. 時間切割與 label 可知性 purge")
    w()
    w("label 可知日：正例 = 到期日 + (門檻 + 1) 天；負例 = 實際付款日。")
    w("train 只保留 label 可知日 < validation 開始日；validation 只保留 label 可知日 < test 開始日；test 不 purge（事後評估）。")
    w()
    for target in ["late_7d", "late_15d"]:
        cut_val, cut_test, raw, purged = make_splits(df, target)
        w(f"### {target}")
        w()
        w(f"- 切點：train < {cut_val.date()} ≤ validation < {cut_test.date()} ≤ test")
        w()
        w("| 區段 | purge 前 n | purge 前正例比例 | 被 purge | purge 後 n | purge 後正例數 | purge 後正例比例 |")
        w("|---|---|---|---|---|---|---|")
        for part in ["train", "validation", "test"]:
            r, p = raw[part], purged[part]
            w(f"| {part} | {len(r)} | {fmt(r[target].mean())} | {len(r) - len(p)} | {len(p)} | "
              f"{int(p[target].sum())} | {fmt(p[target].mean())} |")
        w()

    # ---------- 歷史分組樣本數 ----------
    w("## 3. 探索性歷史可用量分組（exploratory history-availability buckets）")
    w()
    w("依本資料集分布建立的探索性分組，用於觀察「預測當下可用歷史筆數」與模型表現的關係；"
      "不是業界標準，也不等同 Prototype 的資料可信度等級。")
    w()
    _, _, _, purged7 = make_splits(df, "late_7d")
    w("| 區段 | 0–4 | 5–9 | 10+ |")
    w("|---|---|---|---|")
    for part in ["train", "validation", "test"]:
        b = purged7[part]["prior_invoice_count"].map(bucket_of).value_counts()
        w(f"| {part} | {b.get('0–4', 0)} | {b.get('5–9', 0)} | {b.get('10+', 0)} |")
    w()

    # ---------- 主實驗 ----------
    cut_val, cut_test, raw, split, cols, res = run_experiment(df, "late_7d", use_country=True)

    w("## 4. 主要結果：late_7d（含 countryCode）")
    w()
    w("threshold 只在 validation 上依 F1 最大選定，test 只評估一次。test 的 PR-AUC 與 ROC-AUC 附 1,000 次 bootstrap 95% 信賴區間。")
    w()
    w("### Validation")
    w()
    metrics_table(res, "val")
    w("### Test")
    w()
    metrics_table(res, "test")
    w(f"- 選定的 threshold：簡單規則 {fmt(res['rule']['threshold'])}、"
      f"Logistic {fmt(res['logistic']['threshold'])}、Gradient Boosting {fmt(res['gbm']['threshold'])}")
    w(f"- 只猜正例比例的模型：PR-AUC = 正例比例（test = {fmt(res['logistic']['test']['prevalence'])}）、ROC-AUC = 0.5")
    w()

    # ---------- Calibration ----------
    w("## 5. Calibration（test，依預測值分 5 組）")
    w()
    for key, label in [("logistic", "Logistic Regression"), ("gbm", "Gradient Boosting")]:
        w(f"### {label}")
        w()
        w("| 組別 | n | 平均預測機率 | 實際逾期比例 |")
        w("|---|---|---|---|")
        table = calibration_table(split["test"]["late_7d"], res[key]["p_test"])
        for i, row in table.iterrows():
            w(f"| {i + 1} | {int(row['n'])} | {fmt(row['mean_pred'])} | {fmt(row['observed'])} |")
        m = res[key]["test"]
        w()
        w(f"整體：平均預測 {fmt(m['mean_pred'])}，實際比例 {fmt(m['prevalence'])}，Brier {fmt(m['brier'])}")
        w()
    ref_brier = brier_score_loss(split["test"]["late_7d"], np.full(len(split["test"]), split["train"]["late_7d"].mean()))
    w(f"參考：一律預測 train 正例比例（{fmt(split['train']['late_7d'].mean())}）的 Brier = {fmt(ref_brier)}")
    w()

    # ---------- Feature importance ----------
    w("## 6. 特徵影響")
    w()
    w("### Logistic Regression 係數（標準化後）")
    w()
    lr = res["logistic"]["model"]
    names = lr.named_steps["prep"].get_feature_names_out()
    coefs = lr.named_steps["model"].coef_[0]
    w("| 特徵 | 係數 |")
    w("|---|---|")
    for n_, c in sorted(zip(names, coefs), key=lambda t: -abs(t[1])):
        w(f"| `{n_}` | {c:+.3f} |")
    w()
    w("### Gradient Boosting permutation importance（validation，PR-AUC 下降量）")
    w()
    gbm = res["gbm"]["model"]
    val = split["validation"]
    pi = permutation_importance(gbm, val[cols], val["late_7d"], scoring="average_precision",
                                n_repeats=20, random_state=SEED)
    w("| 特徵 | 平均下降 | 標準差 |")
    w("|---|---|---|")
    for i in np.argsort(-pi.importances_mean):
        w(f"| `{cols[i]}` | {pi.importances_mean[i]:+.4f} | {pi.importances_std[i]:.4f} |")
    w()

    # ---------- countryCode sensitivity ----------
    w("## 7. countryCode 敏感度")
    w()
    _, _, _, _, _, res_nc = run_experiment(df, "late_7d", use_country=False)
    w("| 模型 | test PR-AUC（含 country） | test PR-AUC（不含） | 差異 | test ROC-AUC（含） | test ROC-AUC（不含） |")
    w("|---|---|---|---|---|---|")
    for key, label in [("logistic", "Logistic Regression"), ("gbm", "Gradient Boosting")]:
        a, b = res[key]["test"], res_nc[key]["test"]
        w(f"| {label} | {fmt(a['pr_auc'])} | {fmt(b['pr_auc'])} | {a['pr_auc'] - b['pr_auc']:+.3f} | "
          f"{fmt(a['roc_auc'])} | {fmt(b['roc_auc'])} |")
    w()

    # ---------- History bucket performance ----------
    w("## 8. 依歷史可用量分組的 test 表現")
    w()
    w("每組至少需要 10 個正例與 10 個負例才計算指標，否則標示樣本不足。")
    w()
    test = split["test"].copy()
    test["bucket"] = test["prior_invoice_count"].map(bucket_of)
    w("| 分組 | n | 正例 | 正例比例 | Logistic PR-AUC | Logistic ROC-AUC | GBM PR-AUC | GBM ROC-AUC |")
    w("|---|---|---|---|---|---|---|---|")
    for _, _, label in BUCKETS:
        mask = (test["bucket"] == label).to_numpy()
        y = test["late_7d"].to_numpy()[mask]
        pos, neg = int(y.sum()), int(len(y) - y.sum())
        if pos >= 10 and neg >= 10:
            vals = []
            for key in ["logistic", "gbm"]:
                p = res[key]["p_test"][mask]
                vals += [fmt(average_precision_score(y, p)), fmt(roc_auc_score(y, p))]
            w(f"| {label} | {len(y)} | {pos} | {fmt(y.mean())} | " + " | ".join(vals) + " |")
        else:
            w(f"| {label} | {len(y)} | {pos} | {fmt(y.mean()) if len(y) else 'n/a'} | 樣本不足 | 樣本不足 | 樣本不足 | 樣本不足 |")
    w()

    # ---------- late_15d ----------
    w("## 9. late_15d 敏感度")
    w()
    _, _, _, split15, _, res15 = run_experiment(df, "late_15d", use_country=True)
    w("### Test")
    w()
    metrics_table(res15, "test")
    test_pos15 = res15["logistic"]["test"]["positives"]
    w(f"- test 正例數：{test_pos15}" + ("（少於 30，結果極不穩定，僅供參考）" if test_pos15 < 30 else ""))
    w()

    # ---------- Leakage audit ----------
    w("## 10. Leakage audit")
    w()
    checked, mismatches = independent_history_check(df)
    w(f"- 禁止欄位是否進入模型：否（程式斷言檢查通過；模型欄位 = {', '.join(cols)}）")
    w(f"- 歷史特徵獨立重算抽樣 {checked} 筆：不一致 {mismatches} 筆（同時檢查歷史中沒有同日或更晚開立的 invoice）")
    for part, frame in [("train", split["train"]), ("validation", split["validation"])]:
        limit = cut_val if part == "train" else cut_test
        w(f"- {part} 最晚的 label 可知日：{frame['label_known_7d'].max().date()}（必須早於 {limit.date()}）")
    rng = np.random.default_rng(SEED)
    shuffled = split["train"].copy()
    shuffled["late_7d"] = rng.permutation(shuffled["late_7d"].to_numpy())
    sanity = make_gbm(CATEGORICAL_FEATURES).fit(shuffled[cols], shuffled["late_7d"])
    p_sanity = sanity.predict_proba(split["test"][cols])[:, 1]
    w(f"- 打亂 train label 後重新訓練（應接近隨機）：test PR-AUC {fmt(average_precision_score(split['test']['late_7d'], p_sanity))}、"
      f"ROC-AUC {fmt(roc_auc_score(split['test']['late_7d'], p_sanity))}")
    unseen = set(split["test"]["customerID"]) - set(split["train"]["customerID"])
    w(f"- test 中 train 期間沒出現過的 Buyer：{len(unseen)}")
    w()

    # 輸出特徵表（衍生資料，不進 Git）
    keep = ["customerID", "invoiceNumber", "InvoiceDate", "late_7d", "late_15d",
            "label_known_7d", "label_known_15d"] + NUMERIC_FEATURES + CATEGORICAL_FEATURES
    df[keep].to_csv(FEATURE_PATH, index=False)

    REPORT_PATH.parent.mkdir(parents=True, exist_ok=True)
    REPORT_PATH.write_text("\n".join(report) + "\n", encoding="utf-8")
    print(f"\n報告已寫入：{REPORT_PATH}")
    print(f"特徵表已寫入：{FEATURE_PATH}（不進 Git）")


if __name__ == "__main__":
    main()
