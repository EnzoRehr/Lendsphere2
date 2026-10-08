# LendSphere — Proiect Complet

## Structura
```
LendSphere_Complete/
├── Android_LendSphere/   ← Proiect Android (Kotlin + Compose)
└── API_LendSphere/       ← Backend Node.js + Oracle DB
```

## Cum pornesti

### 1. Backend API
```bash
cd API_LendSphere
npm install
npm run dev
# Server pornit pe http://localhost:3000
```

### 2. Android
- Deschide Android Studio → Open → selecteaza folderul `Android_LendSphere`
- Build → Clean Project
- Run ▶

## Conturi demo
| Email | Parola | Rol |
|---|---|---|
| borrower@demo.ro | demo123 | Împrumutat |
| lender@demo.ro | demo123 | Creditor |
| admin@demo.ro | admin123 | Administrator |

## Conectare Android la API
- **Emulator:** `http://10.0.2.2:3000/api/`
- **Telefon fizic:** `http://IP_CALCULATOR:3000/api/`
