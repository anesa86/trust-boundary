# ML1｜Buyer Late-Payment Risk 方法驗證

- 資料：`WA_Fn-UseC_-Accounts-Receivable.csv`（2466 張 invoice、100 個 Buyer）
- 來源：Kaggle — Finance Factoring – IBM Late Payment Histories
- 性質：IBM 示範資料集（很可能為模擬資料），僅用於方法驗證
- 隨機種子：20260707

## 1. 最終特徵與預測當下可用性

| 特徵 | 型別 | 預測當下的依據 |
|---|---|---|
| `invoice_amount` | 數值 | 本張 invoice 金額：開票當下即已知。 |
| `prior_invoice_count` | 數值 | 開票日之前「已付款完成」的同一 Buyer invoice 數；0 代表真的沒有可用歷史。 |
| `prior_on_time_rate` | 數值 | 上述歷史中準時付款（DaysLate = 0）的比例；無歷史時為 NaN。 |
| `prior_late_7d_rate` | 數值 | 上述歷史中逾期 > 7 天的比例；無歷史時為 NaN。 |
| `prior_late_30d_rate` | 數值 | 上述歷史中逾期 > 30 天的比例；無歷史時為 NaN。 |
| `prior_avg_days_late` | 數值 | 上述歷史的平均逾期天數；無歷史時為 NaN。 |
| `prior_median_days_late` | 數值 | 上述歷史的逾期天數中位數；無歷史時為 NaN。 |
| `recent_3_invoice_avg_days_late` | 數值 | 上述歷史中，開票日最近的至多 3 張的平均逾期天數；無歷史時為 NaN。 |
| `prior_avg_invoice_amount` | 數值 | 開票日「之前開立」的同一 Buyer invoice 平均金額（金額在開立時即已知，不需等付款）；無時為 NaN。 |
| `current_amount_vs_prior_avg` | 數值 | 本張金額 ÷ prior_avg_invoice_amount；無比較基礎時為 NaN。 |
| `prior_dispute_rate` | 數值 | 已付款完成的歷史 invoice 中曾有 dispute 的比例（假設 dispute 狀態在付款完成時已確定）；無歷史時為 NaN。 |
| `countryCode` | 類別（one-hot） | Buyer 所在國家代碼：客戶層級的固定屬性，開票當下已知。 |

排除：`customerID`、`invoiceNumber`（身分／編號）；本張的 `SettledDate`、`DaysToSettle`、`DaysLate`、`Disputed`（結果或事後才知道）；`PaperlessDate`、`PaperlessBill`（時間語意不確定）；`DueDate`（全部等於開票日 + 30 天，沒有資訊量）。

缺漏處理：沒有歷史時特徵保留 NaN。Logistic Regression 以 train 中位數補值並加上「是否缺漏」指標欄；Gradient Boosting 原生處理 NaN。`prior_invoice_count = 0` 是真正的 0，不是補值。

## 2. 時間切割與 label 可知性 purge

label 可知日：正例 = 到期日 + (門檻 + 1) 天；負例 = 實際付款日。
train 只保留 label 可知日 < validation 開始日；validation 只保留 label 可知日 < test 開始日；test 不 purge（事後評估）。

### late_7d

- 切點：train < 2013-05-06 ≤ validation < 2013-08-19 ≤ test

| 區段 | purge 前 n | purge 前正例比例 | 被 purge | purge 後 n | purge 後正例數 | purge 後正例比例 |
|---|---|---|---|---|---|---|
| train | 1725 | 0.207 | 92 | 1633 | 337 | 0.206 |
| validation | 370 | 0.162 | 76 | 294 | 38 | 0.129 |
| test | 371 | 0.111 | 0 | 371 | 41 | 0.111 |

### late_15d

- 切點：train < 2013-05-06 ≤ validation < 2013-08-19 ≤ test

| 區段 | purge 前 n | purge 前正例比例 | 被 purge | purge 後 n | purge 後正例數 | purge 後正例比例 |
|---|---|---|---|---|---|---|
| train | 1725 | 0.084 | 99 | 1626 | 129 | 0.079 |
| validation | 370 | 0.051 | 79 | 291 | 12 | 0.041 |
| test | 371 | 0.027 | 0 | 371 | 10 | 0.027 |

## 3. 探索性歷史可用量分組（exploratory history-availability buckets）

依本資料集分布建立的探索性分組，用於觀察「預測當下可用歷史筆數」與模型表現的關係；不是業界標準，也不等同 Prototype 的資料可信度等級。

| 區段 | 0–4 | 5–9 | 10+ |
|---|---|---|---|
| train | 601 | 470 | 562 |
| validation | 0 | 7 | 287 |
| test | 0 | 0 | 371 |

## 4. 主要結果：late_7d（含 countryCode）

threshold 只在 validation 上依 F1 最大選定，test 只評估一次。test 的 PR-AUC 與 ROC-AUC 附 1,000 次 bootstrap 95% 信賴區間。

### Validation

| 模型 | n | 正例 | 基準（正例比例） | PR-AUC | ROC-AUC | Brier | 平均預測 | Precision | Recall | F1 | Accuracy |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 簡單規則（過去逾期 > 7 天比例，不經訓練） | 294 | 38 | 0.129 | 0.480 | 0.887 | 0.091 | 0.191 | 0.456 | 0.684 | 0.547 | 0.854 |
| Logistic Regression | 294 | 38 | 0.129 | 0.450 | 0.873 | 0.086 | 0.153 | 0.491 | 0.737 | 0.589 | 0.867 |
| Gradient Boosting | 294 | 38 | 0.129 | 0.396 | 0.867 | 0.095 | 0.138 | 0.453 | 0.632 | 0.527 | 0.854 |

註：簡單規則的分數是歷史比例，不是校準過的機率，它的 Brier 與平均預測僅供參考。

### Test

| 模型 | n | 正例 | 基準（正例比例） | PR-AUC | ROC-AUC | Brier | 平均預測 | Precision | Recall | F1 | Accuracy |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 簡單規則（過去逾期 > 7 天比例，不經訓練） | 371 | 41 | 0.111 | 0.550 [0.418, 0.692] | 0.886 [0.823, 0.937] | 0.079 | 0.179 | 0.465 | 0.805 | 0.589 | 0.876 |
| Logistic Regression | 371 | 41 | 0.111 | 0.437 [0.316, 0.595] | 0.866 [0.817, 0.914] | 0.078 | 0.136 | 0.417 | 0.610 | 0.495 | 0.863 |
| Gradient Boosting | 371 | 41 | 0.111 | 0.459 [0.322, 0.612] | 0.865 [0.819, 0.911] | 0.080 | 0.127 | 0.383 | 0.561 | 0.455 | 0.852 |

註：簡單規則的分數是歷史比例，不是校準過的機率，它的 Brier 與平均預測僅供參考。

- 選定的 threshold：簡單規則 0.400、Logistic 0.302、Gradient Boosting 0.291
- 只猜正例比例的模型：PR-AUC = 正例比例（test = 0.111）、ROC-AUC = 0.5

## 5. Calibration（test，依預測值分 5 組）

### Logistic Regression

| 組別 | n | 平均預測機率 | 實際逾期比例 |
|---|---|---|---|
| 1 | 75 | 0.021 | 0.000 |
| 2 | 74 | 0.031 | 0.027 |
| 3 | 74 | 0.056 | 0.027 |
| 4 | 74 | 0.142 | 0.108 |
| 5 | 74 | 0.432 | 0.392 |

整體：平均預測 0.136，實際比例 0.111，Brier 0.078

### Gradient Boosting

| 組別 | n | 平均預測機率 | 實際逾期比例 |
|---|---|---|---|
| 1 | 75 | 0.003 | 0.000 |
| 2 | 74 | 0.008 | 0.000 |
| 3 | 74 | 0.033 | 0.054 |
| 4 | 74 | 0.138 | 0.149 |
| 5 | 74 | 0.452 | 0.351 |

整體：平均預測 0.127，實際比例 0.111，Brier 0.080

參考：一律預測 train 正例比例（0.206）的 Brier = 0.107

## 6. 特徵影響

### Logistic Regression 係數（標準化後）

| 特徵 | 係數 |
|---|---|
| `num__prior_avg_days_late` | +1.184 |
| `num__prior_on_time_rate` | -0.563 |
| `num__recent_3_invoice_avg_days_late` | -0.369 |
| `cat__countryCode_391` | -0.308 |
| `cat__countryCode_818` | +0.208 |
| `num__prior_invoice_count` | -0.185 |
| `cat__countryCode_897` | +0.160 |
| `num__prior_avg_invoice_amount` | +0.159 |
| `num__prior_median_days_late` | -0.134 |
| `num__invoice_amount` | +0.106 |
| `num__missingindicator_prior_avg_invoice_amount` | -0.104 |
| `num__missingindicator_current_amount_vs_prior_avg` | -0.104 |
| `num__current_amount_vs_prior_avg` | +0.084 |
| `num__missingindicator_prior_on_time_rate` | +0.084 |
| `num__missingindicator_prior_late_7d_rate` | +0.084 |
| `num__missingindicator_prior_late_30d_rate` | +0.084 |
| `num__missingindicator_prior_avg_days_late` | +0.084 |
| `num__missingindicator_prior_median_days_late` | +0.084 |
| `num__missingindicator_recent_3_invoice_avg_days_late` | +0.084 |
| `num__missingindicator_prior_dispute_rate` | +0.084 |
| `num__prior_dispute_rate` | +0.076 |
| `cat__countryCode_406` | -0.058 |
| `num__prior_late_30d_rate` | +0.030 |
| `cat__countryCode_770` | -0.024 |
| `num__prior_late_7d_rate` | -0.023 |

### Gradient Boosting permutation importance（validation，PR-AUC 下降量）

| 特徵 | 平均下降 | 標準差 |
|---|---|---|
| `prior_avg_days_late` | +0.0885 | 0.0549 |
| `prior_on_time_rate` | +0.0697 | 0.0385 |
| `countryCode` | +0.0135 | 0.0063 |
| `prior_dispute_rate` | +0.0127 | 0.0089 |
| `prior_late_7d_rate` | +0.0052 | 0.0094 |
| `prior_median_days_late` | +0.0043 | 0.0047 |
| `prior_late_30d_rate` | +0.0000 | 0.0000 |
| `prior_avg_invoice_amount` | -0.0016 | 0.0218 |
| `invoice_amount` | -0.0021 | 0.0228 |
| `current_amount_vs_prior_avg` | -0.0117 | 0.0250 |
| `prior_invoice_count` | -0.0123 | 0.0110 |
| `recent_3_invoice_avg_days_late` | -0.0226 | 0.0138 |

## 7. countryCode 敏感度

| 模型 | test PR-AUC（含 country） | test PR-AUC（不含） | 差異 | test ROC-AUC（含） | test ROC-AUC（不含） |
|---|---|---|---|---|---|
| Logistic Regression | 0.437 | 0.424 | +0.013 | 0.866 | 0.867 |
| Gradient Boosting | 0.459 | 0.457 | +0.002 | 0.865 | 0.870 |

## 8. 依歷史可用量分組的 test 表現

每組至少需要 10 個正例與 10 個負例才計算指標，否則標示樣本不足。

| 分組 | n | 正例 | 正例比例 | Logistic PR-AUC | Logistic ROC-AUC | GBM PR-AUC | GBM ROC-AUC |
|---|---|---|---|---|---|---|---|
| 0–4 | 0 | 0 | n/a | 樣本不足 | 樣本不足 | 樣本不足 | 樣本不足 |
| 5–9 | 0 | 0 | n/a | 樣本不足 | 樣本不足 | 樣本不足 | 樣本不足 |
| 10+ | 371 | 41 | 0.111 | 0.437 | 0.866 | 0.459 | 0.865 |

## 9. late_15d 敏感度

### Test

| 模型 | n | 正例 | 基準（正例比例） | PR-AUC | ROC-AUC | Brier | 平均預測 | Precision | Recall | F1 | Accuracy |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 簡單規則（過去逾期 > 7 天比例，不經訓練） | 371 | 10 | 0.027 | 0.183 [0.071, 0.415] | 0.896 [0.806, 0.954] | 0.079 | 0.179 | 0.143 | 0.700 | 0.237 | 0.879 |
| Logistic Regression | 371 | 10 | 0.027 | 0.123 [0.053, 0.289] | 0.862 [0.777, 0.933] | 0.028 | 0.057 | 0.091 | 0.400 | 0.148 | 0.876 |
| Gradient Boosting | 371 | 10 | 0.027 | 0.095 [0.041, 0.223] | 0.781 [0.601, 0.907] | 0.035 | 0.044 | 0.125 | 0.300 | 0.176 | 0.925 |

註：簡單規則的分數是歷史比例，不是校準過的機率，它的 Brier 與平均預測僅供參考。

- test 正例數：10（少於 30，結果極不穩定，僅供參考）

## 10. Leakage audit

- 禁止欄位是否進入模型：否（程式斷言檢查通過；模型欄位 = invoice_amount, prior_invoice_count, prior_on_time_rate, prior_late_7d_rate, prior_late_30d_rate, prior_avg_days_late, prior_median_days_late, recent_3_invoice_avg_days_late, prior_avg_invoice_amount, current_amount_vs_prior_avg, prior_dispute_rate, countryCode）
- 歷史特徵獨立重算抽樣 300 筆：不一致 0 筆（同時檢查歷史中沒有同日或更晚開立的 invoice）
- train 最晚的 label 可知日：2013-05-05（必須早於 2013-05-06）
- validation 最晚的 label 可知日：2013-08-18（必須早於 2013-08-19）
- 打亂 train label 後重新訓練（應接近隨機）：test PR-AUC 0.134、ROC-AUC 0.492
- test 中 train 期間沒出現過的 Buyer：0

