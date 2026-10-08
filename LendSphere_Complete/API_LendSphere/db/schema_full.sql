-- ============================================================
-- LendSphere - Script COMPLET Oracle Cloud
-- Un user poate fi atat Borrower cat si Lender
-- ============================================================

BEGIN
    FOR t IN (SELECT table_name FROM user_tables ORDER BY table_name) LOOP
        BEGIN
            EXECUTE IMMEDIATE 'DROP TABLE "' || t.table_name || '" CASCADE CONSTRAINTS PURGE';
        EXCEPTION WHEN OTHERS THEN NULL;
        END;
    END LOOP;
END;
/

-- ── Users (rol unic: BORROWER, LENDER sau ADMIN) ──────────────
-- Un user poate actiona ca borrower SAU lender in functie de actiune
CREATE TABLE ls_users (
    id             VARCHAR2(36)   DEFAULT SYS_GUID() PRIMARY KEY,
    name           VARCHAR2(100)  NOT NULL,
    email          VARCHAR2(150)  NOT NULL UNIQUE,
    password_hash  VARCHAR2(64)   NOT NULL,
    role           VARCHAR2(10)   DEFAULT 'USER'
                     CHECK (role IN ('USER','ADMIN')),
    is_verified    NUMBER(1)      DEFAULT 1,
    biometric_on   NUMBER(1)      DEFAULT 0,
    wallet_balance NUMBER(12,2)   DEFAULT 0,
    created_at     TIMESTAMP      DEFAULT CURRENT_TIMESTAMP
);

-- ── Loans ──────────────────────────────────────────────────────
CREATE TABLE ls_loans (
    id                VARCHAR2(36)   DEFAULT SYS_GUID() PRIMARY KEY,
    title             VARCHAR2(200)  NOT NULL,
    amount            NUMBER(12,2)   NOT NULL,
    currency          VARCHAR2(5)    DEFAULT 'RON',
    term_months       NUMBER(3)      NOT NULL,
    interest_rate     NUMBER(5,2)    NOT NULL,
    status            VARCHAR2(15)   DEFAULT 'PENDING'
                        CHECK (status IN ('PENDING','APPROVED','ACTIVE','FUNDED','REJECTED','COMPLETED','OVERDUE')),
    risk_level        VARCHAR2(10)   DEFAULT 'MEDIUM'
                        CHECK (risk_level IN ('LOW','MEDIUM','HIGH')),
    funded_percent    NUMBER(3)      DEFAULT 0,
    funded_amount     NUMBER(12,2)   DEFAULT 0,
    next_payment_date VARCHAR2(30),
    next_payment_amt  NUMBER(10,2)   DEFAULT 0,
    purpose           VARCHAR2(300),
    borrower_id       VARCHAR2(36)   REFERENCES ls_users(id),
    created_at        TIMESTAMP      DEFAULT CURRENT_TIMESTAMP
);

-- ── Repayments ─────────────────────────────────────────────────
CREATE TABLE ls_repayments (
    id        VARCHAR2(36)  DEFAULT SYS_GUID() PRIMARY KEY,
    loan_id   VARCHAR2(36)  NOT NULL REFERENCES ls_loans(id),
    due_date  VARCHAR2(30)  NOT NULL,
    amount    NUMBER(10,2)  NOT NULL,
    principal NUMBER(10,2)  DEFAULT 0,
    interest  NUMBER(10,2)  DEFAULT 0,
    is_paid   NUMBER(1)     DEFAULT 0,
    paid_at   TIMESTAMP
);

-- ── Transactions ───────────────────────────────────────────────
CREATE TABLE ls_transactions (
    id          VARCHAR2(36)  DEFAULT SYS_GUID() PRIMARY KEY,
    user_id     VARCHAR2(36)  NOT NULL REFERENCES ls_users(id),
    type        VARCHAR2(25)  NOT NULL
                  CHECK (type IN ('DEPOSIT','WITHDRAWAL','INVESTMENT','REPAYMENT_RECEIVED','TRANSFER')),
    title       VARCHAR2(200) NOT NULL,
    amount      NUMBER(12,2)  NOT NULL,
    is_positive NUMBER(1)     DEFAULT 1,
    tx_date     VARCHAR2(30),
    created_at  TIMESTAMP     DEFAULT CURRENT_TIMESTAMP
);

-- ── Investments ────────────────────────────────────────────────
CREATE TABLE ls_investments (
    id              VARCHAR2(36)  DEFAULT SYS_GUID() PRIMARY KEY,
    loan_id         VARCHAR2(36)  NOT NULL REFERENCES ls_loans(id),
    lender_id       VARCHAR2(36)  NOT NULL REFERENCES ls_users(id),
    amount          NUMBER(12,2)  NOT NULL,
    expected_return NUMBER(12,2)  DEFAULT 0,
    invested_at     TIMESTAMP     DEFAULT CURRENT_TIMESTAMP
);

-- ── Notifications ──────────────────────────────────────────────
CREATE TABLE ls_notifications (
    id         VARCHAR2(36)  DEFAULT SYS_GUID() PRIMARY KEY,
    user_id    VARCHAR2(36)  NOT NULL REFERENCES ls_users(id),
    type       VARCHAR2(25)  NOT NULL
                 CHECK (type IN ('PAYMENT_DUE','LOAN_APPROVED','LOAN_REJECTED',
                                 'INVESTMENT_FUNDED','REPAYMENT_RECEIVED','DISPUTE')),
    title      VARCHAR2(200) NOT NULL,
    message    VARCHAR2(500) NOT NULL,
    is_read    NUMBER(1)     DEFAULT 0,
    created_at TIMESTAMP     DEFAULT CURRENT_TIMESTAMP
);

-- ── Indecsi ───────────────────────────────────────────────────
CREATE INDEX idx_loans_borrower ON ls_loans(borrower_id);
CREATE INDEX idx_loans_status   ON ls_loans(status);
CREATE INDEX idx_repay_loan     ON ls_repayments(loan_id);
CREATE INDEX idx_tx_user        ON ls_transactions(user_id);
CREATE INDEX idx_inv_lender     ON ls_investments(lender_id);
CREATE INDEX idx_notif_user     ON ls_notifications(user_id);

-- ── Date demo (parola: demo123) ────────────────────────────────
INSERT INTO ls_users (id, name, email, password_hash, role, is_verified, wallet_balance)
VALUES ('user-ion-01', 'Ion Popescu', 'ion@demo.ro',
        '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', 'USER', 1, 5000);

INSERT INTO ls_users (id, name, email, password_hash, role, is_verified, wallet_balance)
VALUES ('user-maria-01', 'Maria Ionescu', 'maria@demo.ro',
        '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', 'USER', 1, 10000);

-- Parola: admin123
INSERT INTO ls_users (id, name, email, password_hash, role, is_verified, wallet_balance)
VALUES ('user-admin-01', 'Admin LendSphere', 'admin@demo.ro',
        '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2uheWG/igi.', 'ADMIN', 1, 0);

-- Loan activ al lui Ion
INSERT INTO ls_loans (id, title, amount, term_months, interest_rate, status, risk_level,
                      funded_percent, funded_amount, purpose, borrower_id, next_payment_date, next_payment_amt)
VALUES ('loan-001', 'Renovare apartament', 8000, 24, 8.7, 'ACTIVE', 'LOW',
        100, 8000, 'Renovare', 'user-ion-01', '1 mai 2026', 365);

-- Loan pending al lui Ion (disponibil pe piata)
INSERT INTO ls_loans (id, title, amount, term_months, interest_rate, status, risk_level,
                      funded_percent, funded_amount, purpose, borrower_id)
VALUES ('loan-002', 'Educatie MBA', 5000, 12, 7.5, 'APPROVED', 'LOW',
        40, 2000, 'Educatie', 'user-ion-01');

-- Loan al Mariei (disponibil pe piata)
INSERT INTO ls_loans (id, title, amount, term_months, interest_rate, status, risk_level,
                      funded_percent, funded_amount, purpose, borrower_id)
VALUES ('loan-003', 'Afacere proprie', 12000, 36, 11.0, 'APPROVED', 'MEDIUM',
        25, 3000, 'Afacere', 'user-maria-01');

-- Maria a investit in loan-ul lui Ion
INSERT INTO ls_investments (loan_id, lender_id, amount, expected_return)
VALUES ('loan-001', 'user-maria-01', 2000, 2174);

-- Ion a investit in loan-ul Mariei (un user poate fi si lender!)
INSERT INTO ls_investments (loan_id, lender_id, amount, expected_return)
VALUES ('loan-003', 'user-ion-01', 1000, 1110);

-- Tranzactii Ion
INSERT INTO ls_transactions (user_id, type, title, amount, is_positive, tx_date)
VALUES ('user-ion-01', 'DEPOSIT', 'Depunere initiala', 5000, 1, '1 apr 2026');
INSERT INTO ls_transactions (user_id, type, title, amount, is_positive, tx_date)
VALUES ('user-ion-01', 'INVESTMENT', 'Investitie loan-003', 1000, 0, '5 apr 2026');

-- Tranzactii Maria
INSERT INTO ls_transactions (user_id, type, title, amount, is_positive, tx_date)
VALUES ('user-maria-01', 'DEPOSIT', 'Depunere initiala', 10000, 1, '1 apr 2026');
INSERT INTO ls_transactions (user_id, type, title, amount, is_positive, tx_date)
VALUES ('user-maria-01', 'INVESTMENT', 'Investitie loan-001', 2000, 0, '3 apr 2026');

-- Notificari
INSERT INTO ls_notifications (user_id, type, title, message)
VALUES ('user-ion-01', 'LOAN_APPROVED', 'Bun venit!', 'Contul tau a fost creat. Sold initial: 5.000 RON.');
INSERT INTO ls_notifications (user_id, type, title, message)
VALUES ('user-ion-01', 'PAYMENT_DUE', 'Rata scadenta', 'Rata de 365 RON este scadenta pe 1 mai 2026.');
INSERT INTO ls_notifications (user_id, type, title, message)
VALUES ('user-maria-01', 'INVESTMENT_FUNDED', 'Investitie confirmata', 'Ai investit 2.000 RON in loan-001.');

COMMIT;

SELECT 'OK' AS STATUS,
       (SELECT COUNT(*) FROM ls_users) AS USERS,
       (SELECT COUNT(*) FROM ls_loans) AS LOANS,
       (SELECT COUNT(*) FROM ls_investments) AS INVESTMENTS
FROM DUAL;
