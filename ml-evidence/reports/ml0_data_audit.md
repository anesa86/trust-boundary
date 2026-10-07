# ML0 Data Audit

- 檔案：`WA_Fn-UseC_-Accounts-Receivable.csv`（資料夾內共 1 個 CSV，只稽核第一個）
- 列數（rows）：2466
- 欄數（columns）：12

## 1. 欄位、型別與缺漏值

| 欄位 | 推測型別 | 缺漏數 | 不重複值數 | 範例值 |
|---|---|---|---|---|
| countryCode | integer | 0 (0.0%) | 5 | 391, 406, 818 |
| customerID | text | 0 (0.0%) | 100 | 0379-NEVHP, 8976-AMJEO, 2820-XGXSB |
| PaperlessDate | date (%m/%d/%Y) | 0 (0.0%) | 91 | 4/6/2013, 3/3/2012, 1/26/2012 |
| invoiceNumber | integer | 0 (0.0%) | 2466 | 611365, 7900770, 9231909 |
| InvoiceDate | date (%m/%d/%Y) | 0 (0.0%) | 681 | 1/2/2013, 1/26/2013, 7/3/2013 |
| DueDate | date (%m/%d/%Y) | 0 (0.0%) | 681 | 2/1/2013, 2/25/2013, 8/2/2013 |
| InvoiceAmount | float | 0 (0.0%) | 2098 | 55.94, 61.74, 65.88 |
| Disputed | text | 0 (0.0%) | 2 | No, Yes |
| SettledDate | date (%m/%d/%Y) | 0 (0.0%) | 695 | 1/15/2013, 3/3/2013, 7/8/2013 |
| PaperlessBill | text | 0 (0.0%) | 2 | Paper, Electronic |
| DaysToSettle | integer | 0 (0.0%) | 67 | 13, 36, 5 |
| DaysLate | integer | 0 (0.0%) | 37 | 0, 6, 5 |


## 2. 自動辨識的關鍵欄位

- Customer ID: `customerID`
- Invoice number: `invoiceNumber`
- Invoice date: `InvoiceDate`
- Due date: `DueDate`
- Settled date: `SettledDate`
- Invoice amount: `InvoiceAmount`
- Days late: `DaysLate`
- Days to settle: `DaysToSettle`
- Disputed: `Disputed`
- Paperless date: `PaperlessDate`
- Paperless bill: `PaperlessBill`
- Country: `countryCode`

## 3. 日期範圍

- Invoice date: 2012-01-03 ~ 2013-12-02（2466 筆有值）
- Due date: 2012-02-02 ~ 2014-01-01（2466 筆有值）
- Settled date: 2012-01-13 ~ 2014-01-09（2466 筆有值）
- Paperless date: 2012-01-09 ~ 2013-11-27（2466 筆有值）

每月 invoice 數（依 invoice date）：

| 月份 | invoice 數 |
|---|---|
| 2012-01 | 90 |
| 2012-02 | 97 |
| 2012-03 | 117 |
| 2012-04 | 97 |
| 2012-05 | 112 |
| 2012-06 | 98 |
| 2012-07 | 109 |
| 2012-08 | 102 |
| 2012-09 | 122 |
| 2012-10 | 108 |
| 2012-11 | 112 |
| 2012-12 | 113 |
| 2013-01 | 111 |
| 2013-02 | 100 |
| 2013-03 | 106 |
| 2013-04 | 112 |
| 2013-05 | 125 |
| 2013-06 | 99 |
| 2013-07 | 107 |
| 2013-08 | 103 |
| 2013-09 | 118 |
| 2013-10 | 94 |
| 2013-11 | 105 |
| 2013-12 | 9 |

## 4. Customer 分布

- 不重複 customer 數：100
- 每個 customer 的 invoice 數：min=15, p25=21, median=24, p75=28, p90=31, max=36, mean=24.66

| 每位 customer 的 invoice 數 | customer 數 |
|---|---|
| 1 | 0 |
| 2–4 | 0 |
| 5–9 | 0 |
| 10–19 | 14 |
| 20–49 | 86 |
| 50+ | 0 |

## 5. Days Late 分布與延遲比例

- `DaysLate`：min=0, p25=0, median=0, p75=5, p90=13, max=45, mean=3.44
- Days Late = 0 的比例：64.4%
- Days Late < 0 的筆數：0

| 門檻 | 依資料集 Days Late | 依 settled − due 重新計算 |
|---|---|---|
| late > 0 天 | 877 (35.6%) | 877 (35.6%) |
| late > 7 天 | 458 (18.6%) | 458 (18.6%) |
| late > 15 天 | 174 (7.1%) | 174 (7.1%) |
| late > 30 天 | 8 (0.3%) | 8 (0.3%) |

- Days Late ≠ max(0, settled − due) 的筆數：0
- Days To Settle ≠ settled − invoice 的筆數：0

## 6. 付款帳期（due − invoice）

- min=30, p25=30, median=30, p75=30, p90=30, max=30, mean=30.00
- 最常見帳期：[(30, 2466)]

## 7. 資料品質

- 尚未付款（settled date 空白）：0
- 完全重複的列：0
- 重複的 invoice number：0 個號碼
- settled 早於 invoice：0
- due 早於 invoice：0
- settled 早於 due（提早付款）：1505
- invoice amount：min=5.26, p25=46.4, median=60.55, p75=73.77, p90=85.89, max=128.28, mean=59.90
- invoice amount ≤ 0：0

## 8. Disputed 與 Paperless

- Disputed 分布：{'No': 1905, 'Yes': 561}
  - Disputed = No：late > 7 天比例 10.6%（1905 筆）
  - Disputed = Yes：late > 7 天比例 45.8%（561 筆）
- Paperless bill 分布：{'Paper': 1263, 'Electronic': 1203}
- Paperless date 晚於 invoice date：1259（51.1%）
  - 若比例不低，代表 paperless 狀態可能是事後才記錄的，作為 feature 需注意時間語意

## 9. 預測當下可用的 Buyer 歷史

對每一張 invoice，在它的 invoice date 當下：
- A：同一 customer 更早開立的 invoice 數
- B：同一 customer 更早開立、而且**已經付款完成**的 invoice 數（只有 B 的付款結果在當下是已知的）

- A 更早開立：min=0, p25=6, median=12, p75=18, p90=23, max=35, mean=12.27
- B 更早且已付款：min=0, p25=5, median=11, p75=17, p90=22, max=34, mean=11.36

| B（已知付款結果的歷史筆數） | invoice 數 |
|---|---|
| 0 | 194 (7.9%) |
| 1–2 | 207 (8.4%) |
| 3–4 | 200 (8.1%) |
| 5–9 | 482 (19.5%) |
| 10–19 | 954 (38.7%) |
| 20+ | 429 (17.4%) |

- 同一 customer 同一天開立多張 invoice 的配對數：86（同日的 invoice 不應互相當作歷史）

## 10. 依時間切割預覽（70% / 15% / 15%，尚未建模）

- 切點：train < 2013-05-06 ≤ validation < 2013-08-19 ≤ test（同一天不會被拆到兩邊）

| 區段 | invoice 數 | 日期範圍 | late > 7 天比例 | customer 數 |
|---|---|---|---|---|
| train | 1725 | 2012-01-03 ~ 2013-05-05 | 20.7% | 100 |
| validation | 370 | 2013-05-06 ~ 2013-08-18 | 16.2% | 97 |
| test | 371 | 2013-08-19 ~ 2013-12-02 | 11.1% | 95 |

- test 中、train 期間從未出現的 customer：0
- train 區段中，付款日落在 validation 開始之後的 invoice：102（這些 label 在 train 截止時還不知道）

