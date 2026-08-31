# CI/CD — Auto Deploy ไป Test Server

เมื่อมี push เข้า `main` (หรือกด Run workflow เอง) GitHub Actions จะ SSH เข้า Test Server แล้ว:

1. `git fetch` + `reset --hard origin/main`
2. `docker compose up -d --build`
3. รอ health check API (`:3001/health`) และ Web

ไฟล์ที่เกี่ยวข้อง:

| ไฟล์ | หน้าที่ |
|------|---------|
| `.github/workflows/deploy-test.yml` | GitHub Actions workflow |
| `scripts/deploy-test-remote.sh` | สคริปต์ที่รันบน Test Server |

---

## สิ่งที่ต้องมีบน Test Server ก่อน

1. **Docker + Docker Compose v2** ติดตั้งแล้ว
2. **Repo clone ไว้แล้ว** และ `git pull` ได้ (SSH deploy key หรือ HTTPS token)
3. **ไฟล์ `.env.docker`** ตั้งค่าครบ (JWT, DB, UPDATE_SECRET ฯลฯ)
4. **Stack เคยรันสำเร็จแล้ว** อย่างน้อยหนึ่งครั้ง:
   ```bash
   cd /path/to/Car-Stock-monorepo
   docker compose --env-file .env.docker up -d --build
   ```
5. **SSH** เข้าได้ด้วย key (ไม่บังคับ password)

แนะนำให้ใช้ user ที่มีสิทธิ์รัน Docker (อยู่ในกลุ่ม `docker`) ไม่ต้อง `sudo` ในสคริปต์

---

## ตั้งค่า GitHub Secrets

ไปที่ repo → **Settings → Secrets and variables → Actions**

### Secrets (บังคับ)

| Name | ตัวอย่าง | หมายเหตุ |
|------|----------|----------|
| `TEST_SSH_HOST` | `157.x.x.x` | IP หรือ hostname ของ Test Server |
| `TEST_SSH_USER` | `ubuntu` | user สำหรับ SSH |
| `TEST_SSH_KEY` | `-----BEGIN OPENSSH PRIVATE KEY-----...` | private key ทั้งก้อน |
| `TEST_DEPLOY_PATH` | `/home/ubuntu/Car-Stock-monorepo` | path เต็มของ repo บน server |

### Optional

| Name | ชนิด | หมายเหตุ |
|------|------|----------|
| `TEST_SSH_PASSPHRASE` | Secret | ถ้า key มี passphrase |
| `TEST_HEALTH_URL` | Secret | เช่น `http://157.x.x.x:3001/health` — CI เช็คจากภายนอกหลัง deploy |
| `TEST_SSH_PORT` | **Variable** (ไม่ใช่ secret) | default `22` ถ้าไม่ตั้ง |

---

## สร้าง Deploy Key (ครั้งเดียว)

บนเครื่อง dev:

```bash
ssh-keygen -t ed25519 -C "github-actions-car-stock-test" -f ./gha-test-deploy -N ""
```

- **Public** (`gha-test-deploy.pub`) → ใส่ใน server:
  ```bash
  # บน Test Server
  mkdir -p ~/.ssh && chmod 700 ~/.ssh
  cat >> ~/.ssh/authorized_keys   # paste public key
  chmod 600 ~/.ssh/authorized_keys
  ```
- **Private** (`gha-test-deploy`) → วางทั้งไฟล์ใน secret `TEST_SSH_KEY`

ทดสอบจากเครื่องตัวเองก่อน:

```bash
ssh -i ./gha-test-deploy -p 22 ubuntu@157.x.x.x 'echo ok && docker ps | head'
```

ลบไฟล์ key ออกจากเครื่องหลังใส่ secret แล้ว (หรือเก็บใน password manager)

---

## Git บน Server ต้อง pull `main` ได้

CI รัน `git fetch origin main` บน server — ต้อง auth ได้

### แบบ A — Deploy key แบบ read-only (แนะนำ)

1. สร้าง key อีกคู่บน server (คนละตัวกับ GHA SSH):
   ```bash
   ssh-keygen -t ed25519 -C "test-server-git" -f ~/.ssh/github_readonly -N ""
   ```
2. เพิ่ม **public** key ใน GitHub repo → Settings → Deploy keys → Allow read access
3. ตั้ง remote:
   ```bash
   cd /path/to/Car-Stock-monorepo
   git remote set-url origin git@github.com:Marwin5411-Winner/Car-Stock-monorepo.git
   # ~/.ssh/config
   Host github.com
     IdentityFile ~/.ssh/github_readonly
     IdentitiesOnly yes
   ```

### แบบ B — HTTPS + fine-grained / classic PAT

```bash
git remote set-url origin https://<token>@github.com/Marwin5411-Winner/Car-Stock-monorepo.git
```

---

## ทดสอบ

### 1) รันสคริปต์บน server เอง

```bash
cd /path/to/Car-Stock-monorepo
export DEPLOY_PATH="$(pwd)"
bash scripts/deploy-test-remote.sh
```

### 2) Manual workflow

GitHub → **Actions → Deploy Test Server → Run workflow**

### 3) Auto

```bash
git push origin main
```

ดู log ที่ Actions tab

---

## พฤติกรรม / ขอบเขต

- **Concurrency:** push ซ้อนกันจะยกเลิก job เก่า แล้วรันตัวล่าสุด (`cancel-in-progress`)
- **Build:** ใช้ Docker layer cache (เร็วกว่า updater ที่ `--no-cache`)
- **DB:** schema sync ผ่าน API entrypoint (`prisma`) ตามที่ stack ใช้อยู่ — ไม่รัน seed อัตโนมัติ
- **ไม่แตะ production / Windows portable** — workflow นี้เฉพาะ Test Server ผ่าน SSH
- **Windows pack** ยังอยู่ที่ workflow `Pack Windows portable` (tag `v*`) แยกต่างหาก

---

## แก้ปัญหาบ่อยๆ

| อาการ | ตรวจ |
|--------|------|
| `Missing secret: TEST_SSH_*` | ยังไม่ได้ใส่ secrets ใน repo |
| `Permission denied (publickey)` | public key ไม่ได้อยู่ใน `authorized_keys` / user ผิด |
| `git fetch failed` | server pull GitHub ไม่ได้ — ตั้ง deploy key หรือ PAT |
| `API health check failed` | `docker compose logs api` บน server; เช็ค `.env.docker` / DB |
| Build นาน / timeout | default timeout 25 นาที — ดู disk space บน server |
| Web unhealthy แต่ API ขึ้น | อาจ map port ไม่ใช่ 80 — ตั้ง `WEB_HEALTH_URL` บน server ถ้าต้องการ |

Rollback ด่วนบน server (ถ้ายังมี commit เก่า):

```bash
cd /path/to/Car-Stock-monorepo
git reset --hard <good-commit>
docker compose --env-file .env.docker up -d --build
```

หรือใช้ updater ที่มีอยู่:

```bash
make rollback   # จาก Makefile บน server
```
