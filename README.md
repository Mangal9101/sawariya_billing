# Sawariya Confectionary - Billing & Stock Management

## What was fixed

The application now uses the **same FastAPI application and business logic online and offline**.

### Online
If `DATABASE_URL` is present, the app uses PostgreSQL (for example on Render).

### Offline / local
If `DATABASE_URL` is not present, the app automatically uses:
`./sawariya_billing.db`

No manual database configuration is required for local use.

### Important
Online PostgreSQL and offline SQLite are **separate databases**. Data entered offline does not automatically appear online, and vice versa. Automatic two-way synchronization would require a separate sync system.

## Run offline on Windows

The easiest way:

1. Extract this project.
2. Double-click `run_offline.bat`.
3. Wait for the server to start.
4. Open `http://127.0.0.1:8000`
5. Login with:
   - `admin` / `admin123`
   - `staff` / `staff123`

The local database file `sawariya_billing.db` is stored beside `main.py` and survives restarts.

## Run manually

```bash
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --host 127.0.0.1 --port 8000
```

## Render / PostgreSQL

Set these environment variables on the Render web service:

- `DATABASE_URL` = your PostgreSQL connection string
- `SECRET_KEY` = a long random secret

Start command:

```bash
uvicorn main:app --host 0.0.0.0 --port $PORT
```

## Main fixes included

- Automatic SQLite fallback when `DATABASE_URL` is absent.
- Stable absolute paths for templates/static files.
- SQLite foreign-key enforcement.
- Duplicate product lines can no longer oversell stock.
- Out-of-stock products cannot be added to the billing cart.
- Billing draft remains in browser storage.
- Product search and billing JavaScript now handle missing/failed elements more safely.
- `Save & Print Bill` now opens a real printable invoice after successful save.
- PWA/service-worker caching was cleaned up so API/auth responses are not cached.
