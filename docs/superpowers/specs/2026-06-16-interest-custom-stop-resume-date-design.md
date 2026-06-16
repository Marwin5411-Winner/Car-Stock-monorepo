# Design: กำหนดวันหยุด/วันเริ่มดอกเบี้ยเอง (Phase 1 — back-date)

**Date:** 2026-06-16
**Status:** Approved (design)
**Scope:** Phase 1 of 2 — `feat/interest-custom-stop-resume-date`

## Problem

ลูกค้า (เฮีย Liang) แจ้งว่า: บางครั้งพนักงานลืมกดหยุดคิดดอกเบี้ย ทำให้ดอกเบี้ยคิดเกินไปจากวันที่ควรหยุดจริง
และระบบปัจจุบัน "ย้อนกลับไปคำนวณ ณ วันที่ควรหยุด" ไม่ได้ — ปุ่มหยุด/เริ่มใหม่ใช้ "วันนี้" เสมอ

ต้องการ: เลือก **วันที่หยุด** และ **วันที่เริ่มคิดดอกเบี้ยใหม่** ได้เอง (ตัวอย่าง: หยุด 10 มิ.ย. เริ่มใหม่ 15 มิ.ย.)

## Decisions (from brainstorming)

1. **ขอบเขต:** เพิ่มช่องเลือกวันที่ในปุ่ม "หยุด" + "เริ่มใหม่" (ไม่ทำ full history editing)
2. **เคสจริง:** รถยังคิดดอกอยู่ตอนนึกได้ค่อยกดหยุด → แค่ date picker ก็พอ ไม่ต้องแก้ period ที่ปิดไปแล้ว
3. **ช่วงวันที่ (Phase 1):** จำกัด **≤ วันนี้** (back-date/วันนี้) เท่านั้น
   - การรองรับ "วันอนาคต / scheduled-stop" เลื่อนไป **Phase 2** (spec แยก) เพราะต้อง clamp การคำนวณดอกเบี้ยข้ามโมดูล (reports/pdf/stock) และระบบไม่มี scheduler

## Why Phase 1 is self-contained

ดอกเบี้ย "สด" ถูกคำนวณซ้ำในหลายโมดูล (`interest.service`, `reports.service`, `bank-interest.helpers`, `stock.service`, `pdf.controller`)
ทุกที่คำนวณ `วันเริ่ม period → วันนี้` โดยถือว่า period ไม่เริ่มในอนาคต และ endDate ไม่เกินวันนี้

เมื่อ **ทุกวันที่ ≤ วันนี้** invariant เดิมยังคงอยู่ (start ≤ end ≤ today, ไม่มี period อนาคต) → ไม่ต้องแก้การคำนวณที่ใดเลย
งานทั้งหมดอยู่ในโมดูล interest + UI

## Validation rules (enforced client + server)

| Field | Rule |
|---|---|
| วันที่หยุด (`stopDate`) | `activePeriod.startDate ≤ stopDate ≤ today` |
| วันที่เริ่มใหม่ (`startDate`) | `stock.interestStoppedAt ≤ startDate ≤ today` |

- ถ้าไม่มี active period ตอนหยุด → ใช้แค่ขอบบน `≤ today`
- ถ้าไม่มี `interestStoppedAt` ตอน resume (เคสหายาก) → ใช้แค่ขอบบน `≤ today`

## Components & changes

### Backend — `apps/api/src/modules/interest/interest.service.ts`
- `stopInterestCalculation(stockId, userId, notes?, stopDate?)`
  - มี `stopDate?` อยู่แล้ว → **เพิ่ม validation** ช่วงวัน (โยน `BadRequestError` ถ้านอกช่วง)
- `resumeInterestCalculation(stockId, input, userId)`
  - เพิ่ม `startDate?: Date` ใน `input` (default = today)
  - เพิ่ม validation ช่วงวัน
  - ใช้ `input.startDate ?? today` เป็น `startDate` ของ period ใหม่ (แทน hard-code today)

### Backend — `apps/api/src/modules/interest/interest.controller.ts`
- `POST /:stockId/stop`: เพิ่ม `stopDate: t.Optional(t.String())` ใน body; ส่ง `body?.stopDate ? new Date(body.stopDate) : undefined`
- `POST /:stockId/resume`: เพิ่ม `startDate: t.Optional(t.String())` ใน body; ส่งต่อเป็น `Date`
- **Bug fix:** `requester!.userId` → `requester!.id` ใน handler `/stop` และ `/resume`
  (type `requester` มีแค่ `{ id, username, role }` — `userId` เป็น `undefined` ทำให้ resume สร้าง period ด้วย `createdById: undefined`)

### Frontend — `apps/web/src/services/interest.service.ts`
- `stopCalculation(stockId, notes?, stopDate?)` → ส่ง `{ notes?, stopDate? }`
- `ResumeInterestData` เพิ่ม `startDate?: string` (ส่งไปกับ resume)

### Frontend — Stop UI (`apps/web/src/pages/interest/InterestDetailPage.tsx`)
- เปลี่ยน `handleStopCalculation` จาก `window.confirm` → **modal เล็ก** (สไตล์เดียวกับ `DebtPaymentModal`)
  - DatePicker "วันที่หยุดคิดดอกเบี้ย" (default = today, `maxDate = today`, `minDate = activePeriod.startDate`)
  - textarea "หมายเหตุ" (optional)
  - ปุ่ม ยืนยัน/ยกเลิก → เรียก `stopCalculation(id, notes, stopDate)` → refetch

### Frontend — Resume UI (`apps/web/src/pages/interest/InterestEditPage.tsx`)
- resume mode ปัจจุบัน **ซ่อน** ช่องวันที่ (`{!isResume && ...}`) → ให้ **แสดง** "วันที่เริ่มคิดดอกเบี้ยใหม่"
  - ใช้ state `effectiveDate` เดิม, `maxDate = today`, `minDate = interestStoppedAt`
  - branch resume ใน `handleSubmit` ส่ง `startDate: effectiveDate || undefined`

### Frontend — `apps/web/src/components/ui/date-picker.tsx`
- เพิ่ม prop `minDate?: string` / `maxDate?: string` (ISO) → disable วันนอกช่วงในปฏิทิน (และในปุ่ม "วันนี้")
- reusable ทั้งระบบ ไม่กระทบ caller เดิม (props optional)

## Data flow

**Stop:** modal (date + notes) → `interestService.stopCalculation(id, notes, stopDate)`
→ `POST /api/interest/:id/stop { notes?, stopDate? }`
→ service validate + ปิด active period ที่ `stopDate` + recompute interest ถึง `stopDate` + set `stopInterestCalc=true`, `interestStoppedAt=stopDate`
→ success → refetch detail

**Resume:** edit form (rate, principalBase, startDate, notes) → `resumeCalculation(id, { annualRate, principalBase, notes, startDate })`
→ `POST /api/interest/:id/resume { ..., startDate? }`
→ service validate + สร้าง active period ที่ `startDate` + set `stopInterestCalc=false`, `interestStoppedAt=null`
→ return period → navigate ไปหน้า detail

## Error handling

`getErrorMessage` map `BAD_REQUEST` → "คำขอไม่ถูกต้อง" เสมอ (ทับ message จาก server)
→ **ใช้ client-side validation เป็นหลัก** (DatePicker `min/max` กันเลือกผิด + เช็คก่อนส่ง โชว์ข้อความเจาะจง เช่น "วันที่หยุดต้องไม่เกินวันนี้ และไม่ก่อนวันเริ่ม period ปัจจุบัน")
→ server-side validation = safety net (BadRequestError)

## Testing (repo convention: pure-logic, no DB)

ต่อยอด `apps/web/src/pages/interest/interestActions.ts`:
- `isValidStopDate(stopDate, activePeriodStart, today): boolean`
- `isValidResumeStartDate(startDate, lastStopDate, today): boolean`

เทสครอบ: ก่อน period start (reject), = period start (ok), ระหว่าง (ok), = today (ok), อนาคต (reject), resume ก่อนวันหยุด (reject)
มิเรอร์ logic เดียวกันใน service เป็น guard ฝั่ง server

## Out of scope (Phase 2 — separate spec)

- วันที่หยุด/เริ่มในอนาคต + scheduled-stop (คิดต่อจนถึงวันแล้วหยุดเอง)
- การ clamp การคำนวณดอกเบี้ยใน reports/pdf/stock + แก้ `calculateDays` ที่ใช้ `Math.abs`
- การแก้ไขประวัติ period ย้อนหลังแบบเต็มรูปแบบ (insert/edit/delete period เก่า)
