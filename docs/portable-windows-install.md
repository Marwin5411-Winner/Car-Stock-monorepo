# คู่มือติดตั้ง VBeyond แบบ Portable บน Windows (ไม่ใช้ Docker)

เอกสารนี้สำหรับติดตั้งบน **Windows Server / PC ลูกค้า** โดยมี PostgreSQL แยก และรันแอปจากโฟลเดอร์เดียว

สัญญาเทคนิค: [portable-windows-contract.md](./portable-windows-contract.md)

---

## สิ่งที่ต้องมีบนเครื่องลูกค้า

| รายการ | จำเป็น? | หมายเหตุ |
|--------|---------|----------|
| Windows 10/11 หรือ Windows Server | ใช่ | แนะนำ x64 |
| PostgreSQL 14+ | ใช่ | ติดตั้งเอง ตั้ง service = Automatic |
| แพ็กเกจ VBeyond zip | ใช่ | จากทีมพัฒนา |
| Google Chrome หรือ Edge | แนะนำ | สำหรับพิมพ์ PDF บางชนิด |
| NSSM | ถ้าต้องการ auto-start | https://nssm.cc/ |
| Docker / Bun / Git / Node | **ไม่ต้อง** | ถ้าแพ็กเกจครบ (มี exe หรือ bun.exe ใน `app\`) |

---

## ติดตั้งครั้งแรก

### 1) PostgreSQL

1. ติดตั้ง PostgreSQL
2. สร้าง database เช่น `car_stock` และ user/password
3. ตรวจว่า **PostgreSQL service** เป็น **Automatic**

### 2) แตกแพ็กเกจ

แตก zip ไปที่ เช่น:

```text
C:\VBeyond\
```

### 3) ตั้งค่า

```text
copy config\.env.example config\.env
notepad config\.env
```

แก้อย่างน้อย:

```env
DATABASE_URL=postgresql://USER:PASSWORD@127.0.0.1:5432/car_stock?schema=public
JWT_SECRET=ใส่สตริงยาวสุ่มอย่างน้อย-32-ตัว
PORT=3001
CORS_ORIGIN=http://IPหรือชื่อเครื่อง:3001
UPDATER_MODE=portable
STATIC_DIR=public
```

ถ้าเครื่องมีหลายคนเข้าจาก LAN ให้ใส่ IP จริงใน `CORS_ORIGIN` (และเปิด firewall พอร์ต `PORT`)

> **⚠️ กับดัก 3 ข้อของไฟล์ `config\.env`** (เจอบ่อยที่สุด — แอปจะไม่ start แล้วหาสาเหตุยาก)
>
> 1. บันทึกเป็น **UTF-8 without BOM** เท่านั้น ถ้ามี BOM บรรทัดแรกจะอ่านไม่ออก (`DATABASE_URL` หาย)
> 2. รหัสผ่านห้ามมี `!` และ `%` — ตัวแปลของ `.bat` จะกินอักขระพวกนี้
> 3. `KEY=VALUE` บรรทัดละคู่ ไม่ต้องใส่ `"` และห้ามเว้นวรรครอบ `=`
>
> `JWT_SECRET` ต้องมีค่าจริง (สุ่มยาว 32+ ตัว) — ตั้งแต่ v1.0.58 API จะ **ไม่ยอม start** ถ้าเว้นว่าง
> (ก่อนหน้านี้มันเงียบๆ ใช้ค่า default ที่เดาได้ ซึ่งเป็นช่องโหว่)
> `start.bat` / `setup.bat` จะฟ้อง error ชัดเจนทันทีถ้าผิดข้อใดข้อหนึ่ง

### 4) Migrate ฐานข้อมูล

ดับเบิลคลิกหรือรัน:

```bat
setup.bat
```

(ถ้าต้องการข้อมูล seed ทดสอบ: `setup.bat /seed` — อย่าใช้ seed บน production จริงโดยไม่ตั้งใจ)

### 5) รันแอป

```bat
start.bat
```

เปิดเบราว์เซอร์: `http://localhost:3001` (หรือ IP:พอร์ต)

หยุด:

```bat
stop.bat
```

---

## Auto-start หลังปิด–เปิดเครื่อง

### แนะนำ: Windows Service + NSSM

1. ดาวน์โหลด [NSSM](https://nssm.cc/) แล้ววาง `nssm.exe` ที่ `C:\VBeyond\tools\nssm.exe`  
   หรือใส่ PATH
2. เปิด **PowerShell as Administrator**:

```powershell
cd C:\VBeyond
.\install-service.ps1
```

จะได้ service ชื่อ **`VBeyondCarStock`** แบบ **Automatic**

ถอด service:

```powershell
.\uninstall-service.ps1
```

### ลำดับ boot ที่ถูกต้อง

```text
Windows start
  → PostgreSQL (Automatic)
  → VBeyondCarStock (Automatic)
  → เปิดเบราว์เซอร์ใช้ได้
```

ถ้า Postgres ช้า แอปจะ retry health ~60 วินาทีตอน start/update

### ทางเลือก: Task Scheduler

สร้าง task “At startup” ชี้ไปที่ `C:\VBeyond\start.bat` (สิทธิ์สูงสุดถ้าต้องการ) — ใช้ได้แต่ Service ดูแล restart ดีกว่า

---

## อัปเดตเวอร์ชัน

### จากหน้า Settings (Admin)

1. ตั้ง `UPDATE_FEED_URL` ใน `config\.env` — ชื่อไฟล์ต้องเป็น `feed.json` เป๊ะๆ:

   ```env
   UPDATE_FEED_URL=https://github.com/Marwin5411-Winner/Car-Stock-monorepo/releases/latest/download/feed.json
   ```

2. Settings → System Update → ตรวจสอบอัพเดท → อัปเดต  
3. ระบบจะ: backup DB → หยุดแอป → เปลี่ยน `app\` → migrate → start → เช็ก `/health`

> **เครื่องที่ติดตั้ง v1.0.55–v1.0.57 อยู่: การอัปเดตครั้งนี้ต้องทำจาก PowerShell เท่านั้น**
>
> เวอร์ชันเหล่านั้นสั่ง updater เป็น process ลูกของ API พอถึงขั้นตอน "หยุดแอป"
> `taskkill /T` จะฆ่า updater ไปด้วย → อัปเดตค้างและแอปดับ ปุ่มใน Settings จึงใช้ไม่ได้ครั้งนี้
> ให้เปิด **PowerShell (Admin)** แล้วรัน (session นี้อยู่นอก process tree ของ API จึงปลอดภัย):
>
> ```powershell
> cd C:\VBeyond
> .\updater\update.ps1 -Action Update
> ```
>
> หลังขึ้น v1.0.58 แล้ว ปุ่มใน Settings จะใช้ได้ตามปกติ

### จาก PowerShell

```powershell
cd C:\VBeyond
.\updater\update.ps1 -Action Check
.\updater\update.ps1 -Action Update
.\updater\update.ps1 -Action Status
.\updater\update.ps1 -Action Backup
.\updater\update.ps1 -Action Rollback -Version 1.0.55
```

ค่าเริ่ม **`AUTO_UPDATE=false`** — ไม่บังคับอัปเดตอัตโนมัติทุก boot (ปลอดภัยกว่า)

---

## โครงสร้างโฟลเดอร์สำคัญ

| path | ความหมาย |
|------|----------|
| `config\.env` | รหัสผ่าน/ค่าตั้ง — **อัปเดตไม่ทับ** |
| `app\` | โค้ดเวอร์ชันปัจจุบัน |
| `releases\` | เวอร์ชันเก่า (rollback) |
| `data\backups\` | dump ก่อนอัปเดต |
| `data\status\update-status.json` | สถานะอัปเดตให้ UI อ่าน |
| `secrets\` | token (ถ้ามี) — ล็อกสิทธิ์ NTFS |

---

## PDF / Chrome

ตั้งแต่ v1.0.58 ระบบหา Chrome/Edge เองอัตโนมัติ (Edge มีติดมากับ Windows 10/11 อยู่แล้ว)
ตั้ง `CHROMIUM_PATH` เฉพาะกรณีติดตั้งเบราว์เซอร์ไว้ที่อื่น:

```env
CHROMIUM_PATH=C:\Program Files\Google\Chrome\Application\chrome.exe
```

---

## ความปลอดภัยสั้นๆ

1. อย่าใส่ `.env` ลง zip ที่ส่งลูกค้าคนอื่น  
2. จำกัด ACL ของ `config\` และ `secrets\` เฉพาะ service account / admin  
3. อย่าใช้ personal SSH key บนเครื่องลูกค้า — ใช้ release zip + (ถ้าจำเป็น) token อ่านอย่างเดียว  
4. เปิด firewall เฉพาะพอร์ตที่ต้องใช้  

---

## แก้ปัญหาเบื้องต้น

| อาการ | ตรวจ |
|--------|------|
| start แล้ว health fail | Postgres รันหรือยัง, `DATABASE_URL` ถูกไหม, ดู `data\logs\app\` |
| start แล้วออก exit 3 | แอปดับทันที — เปิด `data\logs\app\stderr.log` อ่านสาเหตุจริง (มัก JWT_SECRET/DB) |
| แก้ `.env` แล้วยังไม่ต่าง | ไฟล์ถูกเซฟเป็น UTF-8 **with BOM** หรือมี `!` ในรหัสผ่าน (ดูหัวข้อตั้งค่า) |
| เปิดเว็บแล้วขาว | มี `app\public\index.html` ไหม, `STATIC_DIR=public` |
| อัปเดตไม่ได้ | `UPDATE_FEED_URL`, เน็ตออกนอก, `pg_dump` อยู่ใน PATH |
| เปิดเครื่องแล้วไม่ขึ้น | service VBeyondCarStock = Automatic ไหม, Postgres Automatic ไหม |

---

## สำหรับทีมพัฒนา (สร้างแพ็กเกจ)

จาก monorepo (macOS/Linux ได้ — cross-compile Windows):

```bash
bun run pack:windows:zip
# หรือ
./scripts/pack-windows.sh --zip
```

ได้ไฟล์พร้อมส่งใต้ `dist/`:

| ไฟล์ | ความหมาย |
|------|----------|
| `vbeyond-windows-v{VERSION}/` | โฟลเดอร์แพ็กเกจครบ |
| `vbeyond-windows-v{VERSION}.zip` | zip ส่งลูกค้า |
| `vbeyond-windows-v{VERSION}.zip.sha256` | checksum |
| `feed-{VERSION}.json` | feed สำหรับ auto-update |

แพ็กเกจรวมแล้ว:

- `app/vbeyond-api.exe` (Bun cross-compile)
- `app/bun.exe` (official Windows Bun — สำหรับ migrate)
- `app/engines/query_engine-windows.dll.node` + `schema-engine-windows.exe`
- `app/public/` (React SPA)
- `app/prisma/` + vendored Prisma CLI
- `start.bat` / `setup.bat` / service / updater

CI: tag `v*` → workflow **Pack Windows portable** อัปโหลด artifact และแนบ GitHub Release

ดู contract: [portable-windows-contract.md](./portable-windows-contract.md)
