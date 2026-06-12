# 🚗 Smart Parking System

A full-stack web application for discovering, booking, and managing parking spots in real time. Built with **Node.js + Express** on the backend and vanilla HTML/CSS/JS on the frontend, backed by **MySQL**.

---

## 📁 Project Structure

```
smart-parking-system/
├── client/                    # Frontend (HTML, CSS, JS)
│   ├── css/
│   ├── js/
│   ├── pages/
│   └── assets/
└── server/                    # Backend API
    ├── config/db.js           # MySQL connection pool
    ├── controllers/           # Route handlers
    ├── middleware/            # Auth, roles, validation, error handling
    ├── models/                # (Schema reference)
    ├── routes/                # Express routers
    ├── services/              # Business logic (location, QR, notifications)
    ├── utils/                 # Helpers & constants
    ├── database/
    │   ├── schema.sql         # Table definitions
    │   └── seed.sql           # Sample data
    ├── app.js                 # Express app setup
    └── server.js              # Entry point + cron jobs
```

---

## ⚙️ Prerequisites

| Tool | Version |
|------|---------|
| Node.js | ≥ 18.0.0 |
| MySQL | ≥ 8.0 |
| npm | ≥ 9.0 |

---

## 🚀 Getting Started

### 1. Clone the repository

```bash
git clone https://github.com/your-username/smart-parking-system.git
cd smart-parking-system/server
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment variables

```bash
cp .env.example .env
```

Edit `.env` and fill in your values:

```env
PORT=5000
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=smart_parking
JWT_SECRET=your-super-secret-key
```

### 4. Set up the database

```bash
# Create schema and seed sample data
npm run db:setup
```

Or manually:

```bash
mysql -u root -p < database/schema.sql
mysql -u root -p < database/seed.sql
```

### 5. Start the server

```bash
# Development (with auto-reload)
npm run dev

# Production
npm start
```

The API will be available at `http://localhost:5000`.

---

## 🔑 Default Credentials (Seed Data)

| Role | Email | Password |
|------|-------|----------|
| Admin | admin@smartparking.com | Admin@123 |
| Owner | john.owner@email.com | Owner@123 |
| User | alice@email.com | User@123 |

> ⚠️ Change these passwords immediately in any non-local environment.

---

## 📡 API Endpoints

### Auth — `/api/auth`

| Method | Route | Description | Auth |
|--------|-------|-------------|------|
| POST | `/register` | Register a new user | Public |
| POST | `/login` | User login | Public |
| POST | `/admin/login` | Admin login | Public |
| POST | `/refresh` | Refresh access token | Public |
| GET | `/me` | Get current user | 🔒 |
| POST | `/logout` | Logout | 🔒 |

### Users — `/api/users`

| Method | Route | Description | Auth |
|--------|-------|-------------|------|
| GET | `/:id` | Get user profile | 🔒 |
| PUT | `/:id` | Update profile | 🔒 |
| PUT | `/:id/password` | Change password | 🔒 |
| GET | `/` | List all users | 🔒 Admin |

### Parking — `/api/parking`

| Method | Route | Description | Auth |
|--------|-------|-------------|------|
| GET | `/` | List / search parking | Public |
| GET | `/nearby` | Find nearby parking | Public |
| GET | `/:id` | Get parking details | Public |
| POST | `/` | Create parking location | 🔒 Owner |
| PUT | `/:id` | Update parking | 🔒 Owner |
| DELETE | `/:id` | Delete parking | 🔒 Admin |
| GET | `/:id/slots` | Get slot availability | Public |
| PUT | `/:id/approve` | Approve parking | 🔒 Admin |

### Bookings — `/api/bookings`

| Method | Route | Description | Auth |
|--------|-------|-------------|------|
| POST | `/` | Create booking | 🔒 |
| GET | `/` | Get user's bookings | 🔒 |
| GET | `/:id` | Get booking details | 🔒 |
| PUT | `/:id/cancel` | Cancel booking | 🔒 |
| PUT | `/:id/checkin` | Check in (QR scan) | 🔒 |
| PUT | `/:id/checkout` | Check out | 🔒 |

### Reviews — `/api/reviews`

| Method | Route | Description | Auth |
|--------|-------|-------------|------|
| POST | `/` | Submit review | 🔒 |
| GET | `/parking/:id` | Reviews for a parking | Public |
| PUT | `/:id` | Edit own review | 🔒 |
| DELETE | `/:id` | Delete review | 🔒 |
| POST | `/:id/reply` | Owner reply to review | 🔒 Owner |

### Payments — `/api/payments`

| Method | Route | Description | Auth |
|--------|-------|-------------|------|
| POST | `/` | Initiate payment | 🔒 |
| GET | `/:id` | Payment details | 🔒 |
| POST | `/:id/refund` | Process refund | 🔒 Admin |

---

## 🗄️ Database Schema (Summary)

| Table | Purpose |
|-------|---------|
| `users` | All users (user / owner / admin) |
| `parking_owners` | Extended info for parking owners |
| `parking_locations` | Parking lots with geo-coordinates |
| `parking_slots` | Individual slots within a parking |
| `bookings` | Reservations with status lifecycle |
| `payments` | Payment records linked to bookings |
| `reviews` | User ratings and comments |
| `notifications` | In-app notification feed |
| `favorites` | Saved/bookmarked parking by users |
| `promo_codes` | Discount codes |
| `analytics_daily` | Daily stats per parking location |

---

## 🔐 Authentication

The API uses **JWT (JSON Web Tokens)**:

- Access token validity: `7 days` (configurable via `JWT_EXPIRES_IN`)
- Refresh token validity: `30 days` (configurable via `JWT_REFRESH_EXPIRES_IN`)

Include the token in every protected request:

```
Authorization: Bearer <access_token>
```

---

## ⏱️ Background Jobs (Cron)

| Job | Schedule | Action |
|-----|----------|--------|
| Expire pending bookings | Every 5 min | Sets `status = 'expired'` for bookings pending > 15 min |
| Mark no-shows | Every 5 min | Sets `status = 'no_show'` for confirmed but unchecked bookings |
| Sync slot availability | Every 1 min | Recalculates `available_slots` for all parking locations |

---

## 🛠️ Key Services

### `locationService.js`
- `findNearbyParking(lat, lng, radiusKm, options)` — Haversine-based geo search with filters
- `getRecommendations(lat, lng)` — Returns nearest / cheapest / best-rated / least-crowded sets
- `estimateTravelTime(distanceKm, mode)` — Simplified ETA by travel mode

### `qrService.js`
- `generateBookingQR(booking)` — Generates a PNG data URL QR code for check-in

### `notificationService.js`
- `createNotification(userId, type, title, message, data)`
- `notifyBookingConfirmed / Cancelled / Reminder`
- `notifyPaymentSuccess / Failed`
- `sendPromotion(userIds, ...)` — Bulk promotional push

---

## 📦 Environment Variables Reference

| Variable | Default | Description |
|----------|---------|-------------|
| `NODE_ENV` | `development` | App environment |
| `PORT` | `5000` | Server port |
| `CLIENT_URL` | `http://localhost:3000` | Allowed CORS origin |
| `DB_HOST` | `localhost` | MySQL host |
| `DB_PORT` | `3306` | MySQL port |
| `DB_USER` | `root` | MySQL username |
| `DB_PASSWORD` | — | MySQL password |
| `DB_NAME` | `smart_parking` | Database name |
| `JWT_SECRET` | — | **Required** — keep secret |
| `JWT_EXPIRES_IN` | `7d` | Access token TTL |
| `JWT_REFRESH_EXPIRES_IN` | `30d` | Refresh token TTL |
| `BCRYPT_SALT_ROUNDS` | `12` | Password hashing cost |
| `RATE_LIMIT_WINDOW_MS` | `900000` | Rate limit window (15 min) |
| `RATE_LIMIT_MAX_REQUESTS` | `100` | Max requests per window |
| `GOOGLE_MAPS_API_KEY` | — | Optional — for map features |
| `MAX_FILE_SIZE` | `5242880` | Max upload size (5 MB) |
| `UPLOAD_PATH` | `./uploads` | Local file upload directory |

---

## 🧱 Tech Stack

**Backend**
- Node.js + Express
- MySQL 8 via `mysql2`
- `jsonwebtoken` for auth
- `bcryptjs` for password hashing
- `express-validator` for input validation
- `helmet` + `cors` for security
- `express-rate-limit` for DDoS protection
- `qrcode` for QR generation
- `node-cron` for scheduled tasks
- `uuid` for unique identifiers

**Frontend**
- Vanilla HTML5 / CSS3 / JavaScript
- Google Maps JS API (optional)

---

## 🔒 Security Notes

- All passwords are hashed with bcrypt (salt rounds: 12)
- JWT secrets must be strong and kept in `.env` — never commit them
- Rate limiting is enabled on all `/api/*` routes
- Helmet sets secure HTTP headers by default
- SQL queries use parameterised statements (no raw string interpolation)
- Role-based access control enforced at middleware level

---

## 📄 License

MIT © 2024 Smart Parking System
