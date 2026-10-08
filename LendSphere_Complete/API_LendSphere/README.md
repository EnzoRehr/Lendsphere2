# LendSphere API — Node.js + Oracle Cloud

## Structura proiectului
```
LendSphereAPI/
├── server.js                  ← Entry point
├── .env                       ← Configurare (nu pune pe GitHub!)
├── package.json
├── db/
│   ├── oracle.js              ← Connection pool Oracle
│   └── schema.sql             ← Script creare tabele
├── middleware/
│   └── auth.js                ← JWT middleware
└── routes/
    ├── auth.js                ← Login / Register
    ├── loans.js               ← CRUD Loans + Repayments
    ├── wallet.js              ← Deposit / Withdraw / Invest
    ├── notifications.js       ← Notificari
    └── admin.js               ← Statistici Admin
```

---

## Pasul 1 — Oracle Cloud

1. Mergi la https://cloud.oracle.com → Sign Up (gratuit)
2. **Autonomous Database → Create Autonomous Database**
   - Workload Type: Transaction Processing
   - Database name: LendSphere
   - Password: `LendSphere#2026`
   - Access: Secure access from everywhere
3. După creare → **DB Connection → Download Wallet**
4. Extrage ZIP-ul wallet în folderul `LendSphereAPI/wallet/`
5. Copiaza `connection string name` (ex: `lendsphere_high`) → pune în `.env`

---

## Pasul 2 — Creare tabele

1. În Oracle Cloud → **Database Actions → SQL**
2. Copiaza tot conținutul din `db/schema.sql`
3. Apasă ▶ Run Script

---

## Pasul 3 — Configurare .env

```env
DB_USER=ADMIN
DB_PASSWORD=LendSphere#2026
DB_CONNECT_STRING=lendsphere_high
DB_WALLET_LOCATION=./wallet
PORT=3000
JWT_SECRET=lendsphere_super_secret_key_2026
JWT_EXPIRES_IN=7d
```

---

## Pasul 4 — Instalare și pornire

```bash
cd LendSphereAPI
npm install
npm run dev      # cu nodemon (auto-restart)
# sau
npm start        # fara nodemon
```

Server pornit la: http://localhost:3000

---

## Pasul 5 — Conectare Android

În proiectul Android, înlocuiește URL-ul API în `LendSphereRepository.kt`:

```kotlin
// Pentru emulator Android:
private const val BASE_URL = "http://10.0.2.2:3000/api/"

// Pentru telefon fizic (același WiFi):
private const val BASE_URL = "http://192.168.X.X:3000/api/"
// Înlocuiește cu IP-ul calculatorului tău
```

---

## Endpoints API

| Metodă | Endpoint | Descriere |
|--------|----------|-----------|
| POST | /api/auth/login | Login |
| POST | /api/auth/register | Register |
| GET | /api/loans/my | Creditele mele (borrower) |
| GET | /api/loans/market | Piața (lender) |
| POST | /api/loans | Cerere împrumut nou |
| PATCH | /api/loans/:id/approve | Aprobare (admin) |
| GET | /api/loans/:id/repayments | Scadențar |
| POST | /api/loans/repayments/:id/pay | Plată rată |
| GET | /api/wallet | Sold + tranzacții |
| POST | /api/wallet/deposit | Depunere |
| POST | /api/wallet/withdraw | Retragere |
| POST | /api/wallet/invest | Investiție |
| GET | /api/wallet/investments | Portofoliu lender |
| GET | /api/notifications | Notificări |
| PATCH | /api/notifications/:id/read | Marcare citită |
| PATCH | /api/notifications/read-all | Toate citite |
| GET | /api/admin/stats | Statistici admin |

---

## Testare rapidă (PowerShell / curl)

```bash
# Login
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"borrower@demo.ro","password":"demo123"}'

# Loans (cu token din login)
curl http://localhost:3000/api/loans/my \
  -H "Authorization: Bearer TOKEN_DIN_LOGIN"
```
