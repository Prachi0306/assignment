# SecureID – IAM Registration & Authentication Platform

A full-stack Identity and Access Management (IAM) authentication and registration platform with multi-factor authentication (TOTP), server-side sessions, and JWT token issuance, built using Node.js, Express, MongoDB, and vanilla HTML5/CSS3/JavaScript.

---

## 🛠️ Technologies

| Layer | Technology |
|---|---|
| **Backend** | Node.js, Express.js |
| **Database** | MongoDB, Mongoose |
| **Frontend** | HTML5, CSS3, Vanilla JavaScript (No React / Next.js framework) |
| **Password Security** | Bcrypt (12 salt rounds) |
| **OTP Engine** | Cryptographically secure pseudo-random integers (`crypto.randomInt`), bcrypt OTP hashing |
| **MFA Engine** | RFC 6238 Time-based One-Time Password (TOTP) via `otpauth`, QR Code generator (`qrcode`) |
| **Session Management** | True server-side sessions stored in MongoDB, `HttpOnly` `SameSite=Lax` cookies |
| **Token Subsystem** | Short-lived JSON Web Tokens (`jsonwebtoken`) |
| **Security & Headers** | `helmet`, `cors` whitelist, `cookie-parser` |

---

## 📁 Repository Structure

```
assign/
├── .gitignore                     # Root gitignore (excludes .env, node_modules)
├── README.md                      # Comprehensive project documentation
├── backend/
│   ├── .env.example               # Example environment variables template
│   ├── .gitignore                 # Backend gitignore
│   ├── package.json               # Backend dependencies & npm scripts
│   ├── app.js                     # Express app configuration & middleware
│   ├── server.js                  # Server entry point & MongoDB connection
│   ├── controllers/
│   │   ├── authController.js      # Registration, Email OTP, SMS OTP
│   │   ├── loginController.js     # Login, MFA verification, sessions, JWT, logout
│   │   └── mfaController.js       # MFA TOTP setup & QR code generation
│   ├── models/
│   │   ├── User.js                # User model (sanitized JSON, lockout counters)
│   │   ├── OtpChallenge.js        # OTP challenges with TTL auto-expiration
│   │   └── Session.js             # Server-side sessions with TTL auto-expiration
│   ├── routes/
│   │   ├── auth.js                # Registration, Login, Session & JWT API routes
│   │   └── test.js                # Development/test-only OTP & TOTP endpoints
│   ├── middleware/
│   │   ├── auth.js                # Session cookie & JWT Bearer auth middlewares
│   │   └── errorHandler.js        # Global JSON error handling middleware
│   ├── utils/
│   │   ├── otp.js                 # Crypto OTP generation & bcrypt hashing
│   │   └── validators.js          # Authoritative server-side validators
│   └── test/
│       ├── journey.test.js        # Part 1: Registration automated tests (14 suites)
│       └── login.test.js          # Part 2: Login & Session automated tests (14 suites)
└── frontend/
    ├── register.html              # Registration journey UI (all 12 states)
    ├── login.html                 # Login & 2FA MFA verification UI
    ├── dashboard.html             # Authenticated user security dashboard
    ├── css/
    │   ├── common.css             # SecureID design system (colors, cards, typography)
    │   ├── register.css           # Registration-specific styles
    │   ├── login.css              # Login-specific styles
    │   ├── dashboard.css          # Dashboard layout & security badges
    │   └── dev-helper.css         # Development simulated OTP banner
    └── js/
        ├── register.js            # Registration flow state transitions & validation
        ├── login.js               # Login & MFA flow logic
        └── dashboard.js           # Dashboard profile loader & secure sign out
```

---

## ⚙️ Installation & Setup

### Prerequisites
- **Node.js**: v18 or newer
- **MongoDB**: Running locally at `mongodb://localhost:27017` (or remote MongoDB connection URI)

### Step 1: Clone Repository & Install Dependencies
```bash
cd backend
npm install
```

### Step 2: Configure Environment Variables
Copy `.env.example` to create your local `.env` file:
```bash
cp .env.example .env
```

Review/edit `backend/.env` if you need custom database ports or secrets:
```env
NODE_ENV=development
PORT=3000
MONGODB_URI=mongodb://localhost:27017/secureid
OTP_EXPIRY_MINUTES=3
OTP_MAX_ATTEMPTS=3
FRONTEND_URL=http://localhost:5500
BCRYPT_SALT_ROUNDS=12
JWT_SECRET=your_jwt_secret_key_here
JWT_EXPIRY=15m
```

> 🔒 **Security Notice**: `.env` and `node_modules/` are strictly excluded from GitHub tracking via `.gitignore`.

---

## 🚀 Running the Application

### Start the Backend & Frontend Server
```bash
cd backend
node server.js
```

The Express server will start on `http://localhost:3000` and automatically serve both the API endpoints and the frontend pages:

- **Registration Page**: [http://localhost:3000/register.html](http://localhost:3000/register.html)
- **Sign In Page**: [http://localhost:3000/login.html](http://localhost:3000/login.html)
- **Authenticated Dashboard**: [http://localhost:3000/dashboard.html](http://localhost:3000/dashboard.html)

---

## 🧪 Running Automated Tests

Run the full automated test suite (28 test suites across Part 1 & Part 2):
```bash
cd backend
npm test
```

Or run test suites individually:
```bash
# Part 1: Registration Journey Tests (14 suites)
npm run test:part1

# Part 2: Login & Session Journey Tests (14 suites)
npm run test:part2
```

---

## 🔍 How Evaluators Can Test the Flows

### 1. Interactive UI Testing in the Browser

1. **Registration Flow**:
   - Navigate to [http://localhost:3000/register.html](http://localhost:3000/register.html).
   - Enter full name, email, phone, and password (observe real-time password requirements).
   - Click **Create Account**.
   - On the **Email OTP screen**, the simulated OTP is automatically retrieved by the development helper banner on screen (or printed to the server terminal console). Enter the code or click **Auto-fill**.
   - On the **SMS OTP screen**, enter the simulated SMS code.
   - On the **MFA Setup screen**, select **Authenticator App**, click **Continue**, and view the generated QR Code and manual Base32 setup key.
   - On the **MFA Verification screen**, enter the TOTP code (or click **Auto-fill** in development mode).
   - View the **Registration Success** celebration screen and click **Continue to Login**.

2. **Login Flow**:
   - Navigate to [http://localhost:3000/login.html](http://localhost:3000/login.html).
   - Enter your registered email and password.
   - The server verifies password and requires MFA verification.
   - Enter the 6-digit TOTP code.
   - The server creates a **Server-Side Session**, sets an **`HttpOnly` Cookie**, and redirects you to [dashboard.html](http://localhost:3000/dashboard.html).
   - Click **Sign Out** to destroy the session and clear the cookie.

---

### 2. Development/Test-Only OTP Retrieval API

Because real email and SMS delivery are simulated, two dedicated endpoints are available **strictly in development/test mode**:

#### A. Retrieve Simulated Email/SMS OTP
```http
GET /api/test/otp/:challengeId
```
**Example Response**:
```json
{
  "success": true,
  "otp": "482913",
  "channel": "email",
  "expiresAt": "2026-08-24T12:00:00.000Z",
  "attempts": 0,
  "maxAttempts": 3,
  "verified": false,
  "note": "DEVELOPMENT/TEST ONLY — This endpoint must be disabled in production."
}
```

#### B. Generate Valid Live MFA TOTP for Test User
```http
POST /api/test/mfa-otp
Content-Type: application/json

{
  "userId": "6a8c3391f72505ef5e3163d7"
}
```
**Example Response**:
```json
{
  "success": true,
  "otp": "233238",
  "note": "DEVELOPMENT ONLY — This endpoint must be disabled in production."
}
```

> 🛡️ **Production Guard**: When `NODE_ENV=production`, both test endpoints return `404 Not Found`.

---

## 📡 API Reference Table

### Registration & Verification
| Method | Endpoint | Description | Auth Required |
|---|---|---|:---:|
| `POST` | `/api/register` | Validate data, hash password, create user, return challenge ID | None |
| `POST` | `/api/send-email-otp` | Resend email OTP challenge | None |
| `POST` | `/api/verify-email-otp` | Verify 6-digit email OTP, proceed to SMS challenge | None |
| `POST` | `/api/send-sms-otp` | Resend SMS OTP challenge | None |
| `POST` | `/api/verify-sms-otp` | Verify 6-digit SMS OTP, proceed to MFA setup | None |
| `POST` | `/api/mfa/setup` | Generate TOTP Base32 secret & QR Code Data URL | None |
| `POST` | `/api/mfa/verify` | Verify TOTP & complete registration (`mfaEnabled = true`) | None |

### Authentication, Sessions & JWT
| Method | Endpoint | Description | Auth Required |
|---|---|---|:---:|
| `POST` | `/api/login` | Validate credentials, check lockout, challenge MFA | None |
| `POST` | `/api/verify-login-otp` | Verify TOTP, create server session, set HttpOnly cookie | None |
| `GET` | `/api/me` | Return authenticated user's profile | **Session Cookie** |
| `POST` | `/api/logout` | Invalidate server session in DB & clear cookie | **Session Cookie** |
| `POST` | `/api/token` | Issue short-lived JWT token (15m expiration) | **Session Cookie** or Credentials |
| `GET` | `/api/protected` | Access protected resource | **Bearer JWT** |
| `GET` | `/api/dashboard` | Hybrid profile endpoint | Session Cookie or Bearer JWT |
| `GET` | `/api/health` | Service health check | None |

---

## 🔐 Security Architecture Checklist

- [x] **No Plaintext Passwords**: Hashed with bcrypt (12 salt rounds).
- [x] **No Plaintext OTPs in Database**: Stored strictly as bcrypt hashes.
- [x] **Cryptographically Secure OTPs**: Generated using `crypto.randomInt`.
- [x] **Server-Side OTP Expiry**: Enforced by server (3-minute lifetime).
- [x] **Server-Side Attempt Limits**: Maximum 3 attempts per challenge; challenge locks upon exhaustion.
- [x] **Single-Use OTP Invalidation**: Challenges marked `verified = true` upon first valid entry.
- [x] **Account Lockout**: 5 consecutive failed login attempts lock account for 15 minutes (`ACCOUNT_LOCKED`).
- [x] **True Server-Side Sessions**: Stored in MongoDB (`Session` model) with TTL auto-cleanup.
- [x] **HttpOnly Cookies**: `sessionId` cookie configured with `httpOnly: true`, `sameSite: 'lax'`, `secure` in production.
- [x] **Token Isolation**: No authentication tokens or passwords stored in `localStorage`.
- [x] **No Sensitive Field Leaks**: `User.toJSON()` explicitly strips `passwordHash`, `mfaSecret`, and `__v`.
- [x] **Environment Variable Isolation**: `.env` and `node_modules/` excluded via `.gitignore`.
