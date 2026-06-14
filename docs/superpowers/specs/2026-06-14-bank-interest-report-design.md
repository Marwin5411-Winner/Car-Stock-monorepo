# Bank Interest Report (รายงานคำนวณดอกเบี้ยธนาคาร ต่องวด) — Design

**Date:** 2026-06-14
**Status:** Approved (design) — pending spec review
**Author:** Claude + Marvin

## 1. Background / Why

ลูกค้า (ดีลเลอร์ VBEYOND) ได้รับ "ใบแจ้งเรียกเก็บดอกเบี้ยเพื่อตรวจสอบ" จากธนาคาร TISCO
ทุกงวด (floor-plan / สินเชื่อสต็อกรถ) และอยากให้ระบบ Car-Stock ออก**ใบคำนวณดอกเบี้ยต่องวดเอง**
ที่คิดด้วย**วิธีเดียวกับธนาคาร** จากข้อมูลในระบบ (ไม่ต้องนำเข้ายอดของธนาคาร).

ตัวอย่างบิลต้นทาง: `6BFPCR109428 (1).pdf` (TISCO, วันครบกำหนด 16/6/2026, 24 คัน, รวม 17,406.28).

### Reverse-engineered bank formula (verified against all 24 rows + total)

```
AMOUNT DUE = OUTS.AMOUNT × (RATE / 100) × NO_DAY ÷ 365
NO_DAY     = (TO − FROM) + 1            ← inclusive of BOTH endpoints
FROM       = วันที่ธนาคารจัดไฟแนนซ์คันนั้น (drawdown date)
TO         = min(วันปิดหนี้/ขายคันนั้น, วันสิ้นรอบบิล)   ← วันสิ้นรอบ = วันครบกำหนด − 1
```

- ตรวจแล้ว: ผลรวม AMOUNT DUE ของทั้ง 24 แถว = **17,406.28** ตรงกับยอดรวมในบิลเป๊ะ.
- ระบบเดิม (`interest.service.ts`) ใช้สูตร `principal × (annualRate/100)/365 × days` ซึ่ง
  **เหมือนธนาคารทุกประการ ยกเว้นการนับวัน** — `calculateDays()` เดิมเป็น `floor((end−start)/day)`
  (exclusive) จะได้น้อยกว่าธนาคาร **1 วันต่อช่วง**. รายงานใหม่นี้ใช้ **inclusive (+1)** เพื่อให้ตรงธนาคาร.

## 2. Goal / Non-goals

**Goal**
- รายงานใหม่แยกเมนู: เลือก "ช่วงรอบบิล (จาก–ถึง)" แล้วระบบคิดดอกเบี้ยที่เกิดในรอบนั้น
  ของรถที่จัดไฟแนนซ์ทุกคัน ในรูปแบบ + วิธีคิดแบบบิลธนาคาร.
- มีหน้าเว็บ + PDF (A4 แนวนอน) + Excel.

**Non-goals**
- ไม่นำเข้า/กระทบยอดกับไฟล์ของธนาคาร (reconciliation) — เป็นใบของเราเอง.
- ไม่เก็บเลขสัญญา/BFC_NO/FAC_CODE ของธนาคาร (ใช้ เลขสต็อก/VIN ของเราแทน).
- ไม่แก้วิธีนับวันของรายงานดอกเบี้ยสต็อกเดิม.

## 3. Locked decisions

| เรื่อง | ค่าที่เลือก |
|---|---|
| เป้าหมาย | ออกใบคำนวณดอกเบี้ยต่องวดเอง จากข้อมูลในระบบ |
| สถาปัตยกรรม | รายงานใหม่แยกเมนู (ตาม pattern "รายงานเบิกแคมเปญ") |
| OUTS.AMOUNT | ฐานเดียวกับ engine ดอกเบี้ยเดิม: `InterestPeriod.principalAmount` ถ้ามี, ไม่งั้น `baseCost`/`totalCost` ตาม `interestPrincipalBase` |
| FROM (วันเริ่ม) | `orderDate` → fallback `arrivalDate` |
| TO (วันสุดท้าย) | `min(InterestPeriod.endDate ?? interestStoppedAt ?? สิ้นรอบ, สิ้นรอบ)` |
| การนับวัน | **inclusive (+1)** เพื่อให้ตรงธนาคาร |
| ขอบเขต | รถทุกคันที่มี `financeProvider` (รวมทุกไฟแนนซ์ในใบเดียว), ไม่รวม soft-deleted |
| คอลัมน์ | มีคอลัมน์ "รุ่น/สี" ด้วย |
| สิทธิ์ | `INTEREST_VIEW` |
| Output | หน้าเว็บ + PDF (A4 landscape) + Excel |

## 4. Core algorithm — `reportsService.getBankInterestReport({ cycleStart, cycleEnd })`

`cycleStart`, `cycleEnd` = date-only (normalize ทั้งคู่เป็นเที่ยงคืน). `cycleEnd` คือวันสุดท้ายของรอบ (inclusive).

```
helper daysInclusive(from, to):
    f = midnight(from); t = midnight(to)
    return floor((t - f) / ONE_DAY) + 1        // both endpoints counted

for each stock where financeProvider != null AND deletedAt == null:
    # 1) สร้าง segments
    if stock.interestPeriods not empty:
        segments = for each p in interestPeriods:
            { start: p.startDate,
              end:   p.endDate ?? stock.interestStoppedAt ?? cycleEnd,
              rate:  Number(p.annualRate),                 # already in % e.g. 3.35
              principal: Number(p.principalAmount) }
    else:
        start = stock.orderDate ?? stock.arrivalDate
        end   = stock.interestStoppedAt ?? cycleEnd
        rate  = Number(stock.interestRate) * 100           # field stores fraction → %
        principal = interestPrincipalBase == BASE_COST_ONLY
                      ? baseCost
                      : baseCost + transportCost + accessoryCost + otherCosts
        segments = [{ start, end, rate, principal }]

    # 2) ตัดแต่ละ segment เข้ากรอบรอบบิล แล้วออกเป็นบรรทัด
    for each seg in segments:
        from = max(seg.start, cycleStart)
        to   = min(seg.end,   cycleEnd)
        if from > to: continue                              # ไม่ overlap → ข้าม
        days   = daysInclusive(from, to)
        amount = round2(seg.principal * (seg.rate/100) * days / 365)
        emit row { stockId, stockNumber, vin, vehicleInfo, exteriorColor,
                   principalAmount: seg.principal, rate: seg.rate,
                   periodFrom: from, periodTo: to, days, interest: amount }

rows = sort by (periodFrom asc, vin asc)
summary = {
    vehicleCount: distinct stockId,
    rowCount: rows.length,
    totalInterest: round2(sum of row.interest)             # ปัดราย-บรรทัดก่อนบวก (วิธีธนาคาร)
}
return { rows, summary }
```

### Why this matches the bank (สอดคล้องกับข้อมูลที่ถอดได้)
- **เปลี่ยนเรต/จ่ายเงินต้นกลางรอบ** → `InterestPeriod` ถูกแตกไว้แล้ว (consecutive: prev.end+1 = next.start)
  จึงได้หลายบรรทัดต่อคันโดยไม่ซ้ำ/ไม่ขาดวัน เหมือนบิลธนาคาร.
- **ปิดหนี้/หยุดคิดดอกกลางรอบ** → `interestStoppedAt` ทำให้ `to` หยุดที่วันปิด (เช่น 24 พ.ค.).
- **เพิ่งจัดกลางรอบ** → `from = max(orderDate, cycleStart) = orderDate` (เช่น 9 มิ.ย.).
- **ปัดทศนิยมราย-บรรทัดแล้วบวก** → ผลรวมตรง 17,406.28.

### Edge cases
- ไม่มี `financeProvider` → ไม่อยู่ในรายงาน.
- ปิดหนี้ก่อน `cycleStart` หรือจัดหลัง `cycleEnd` → ไม่ overlap → ไม่อยู่ในรายงาน.
- `from == to` → 1 วัน.
- รถ 1 คันมีหลาย segment overlap → หลายบรรทัด (รวมยอดในแถวรวมท้าย).
- ค่าเวลาใน DateTime ต้อง normalize เป็นเที่ยงคืนก่อนคำนวณวัน (กัน off-by-one).

## 5. API

```
GET /api/reports/bank-interest?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
GET /api/reports/bank-interest/pdf?startDate=...&endDate=...&dueDate=YYYY-MM-DD
```
- `beforeHandle: authMiddleware`, permission `INTEREST_VIEW` (ตาม pattern stock-interest).
- `startDate`/`endDate` จำเป็น; ถ้าขาด → 400.
- JSON: `{ success: true, data: { rows, summary } }`.
- PDF: `application/pdf`, `Content-Disposition: attachment; filename="bank-interest-report.pdf"`.
- `dueDate` (optional, header เท่านั้น) default = `endDate + 1 วัน`.

## 6. UI — `BankInterestReportPage.tsx` (route `/reports/bank-interest`)

- ตัวกรอง: date picker **จากวันที่ / ถึงวันที่** (จำเป็น), **วันครบกำหนดชำระ** (optional).
- ปุ่ม: ดาวน์โหลด PDF (เรียก endpoint), ดาวน์โหลด Excel (`ExportButton`/`exportUtils`, สร้าง client-side จาก rows).
- ตาราง: `ลำดับ | เลขสต็อก | เลขตัวถัง (VIN) | รุ่น/สี | ยอดตั้งดอก | ช่วง (จาก–ถึง) | จำนวนวัน | อัตรา % | ดอกเบี้ย` + แถวรวม.
- เพิ่มการ์ดเมนูใน `ReportsPage.tsx` (id `bank-interest`, title "รายงานคำนวณดอกเบี้ยธนาคาร",
  description "คำนวณดอกเบี้ยไฟแนนซ์รถในสต็อกต่องวด แบบเดียวกับใบแจ้งของธนาคาร", permission `INTEREST_VIEW`).
- เพิ่ม route ใน `App.tsx` ภายใต้ `ProtectedRoute`.

## 7. PDF — `bank-interest-report.hbs` (A4 landscape)

- หัว: company header (จาก `getCompanyHeader()` ใน controller), ชื่อรายงาน,
  "ช่วงรอบบิล: {จาก} ถึง {ถึง}", "วันครบกำหนดชำระ: {dueDate}".
- ตารางคอลัมน์เดียวกับหน้าเว็บ + แถวรวมท้าย (รวมดอกเบี้ย).
- helper เดิม: `formatThaiDate`, `formatCurrency`, `add`, `gt`.
- `pdfService.generateBankInterestReport({ header, dateRange, dueDate, rows, summary })`.

## 8. Files

**สร้าง**
- `apps/api/src/modules/pdf/templates/bank-interest-report.hbs`
- `apps/web/src/pages/reports/BankInterestReportPage.tsx`
- `apps/api/src/__tests__/bank-interest-report.test.ts`

**แก้**
- `apps/api/src/modules/reports/reports.service.ts` → `getBankInterestReport()`
- `apps/api/src/modules/reports/reports.controller.ts` → 2 endpoints
- `apps/api/src/modules/pdf/pdf.service.ts` → `generateBankInterestReport()`
- `apps/web/src/services/report.service.ts` → method เรียก API + ดาวน์โหลด PDF
- `apps/web/src/pages/reports/ReportsPage.tsx` → การ์ดเมนู
- `apps/web/src/App.tsx` → route

## 9. Testing

`bank-interest-report.test.ts`:
1. **Unit (สูตร):** feed inputs ของทั้ง 24 แถวจากบิล TISCO (principal, rate, days)
   → assert ดอกเบี้ยแต่ละแถว + ผลรวม = **17,406.28**.
2. **daysInclusive:** 16→24 = 9, 20→28 = 9, 20 พ.ค.→15 มิ.ย. = 27, from==to → 1.
3. **Clipping:** segment ที่คาบ cycleStart/cycleEnd ถูกตัดถูกต้อง; ปิดหนี้กลางรอบ → `to` = วันปิด;
   จัดหลังรอบ/ปิดก่อนรอบ → ไม่มีบรรทัด.
4. **Multi-segment:** รถที่มี 2 InterestPeriod ในรอบ → 2 บรรทัด รวมวันไม่ซ้ำ/ไม่ขาด.

## 10. Open risks / notes

- **นับวันต่างจากรายงานดอกเบี้ยสต็อกเดิม 1 วัน/ช่วง** (inclusive vs exclusive) — ตั้งใจ; แจ้งผู้ใช้แล้ว.
- ถ้า InterestPeriod ในระบบจริงไม่ครบ (รถเก่าไม่เคยเปลี่ยนเรต) → ใช้ fallback path (orderDate + interestRate)
  ซึ่งให้ผลถูกต้องตราบใดที่ `orderDate`/`arrivalDate` และ `interestRate` ถูกตั้ง.
- ถ้ารอบบิลก่อนหน้าจบที่ `cycleStart − 1` ผู้ใช้ต้องตั้ง `cycleStart` ให้ต่อเนื่อง เพื่อไม่ให้ซ้ำ/ขาดวันข้ามรอบ.
