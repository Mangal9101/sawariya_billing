# Sawariya Billing — Multi-user Google Login + OTP + Google Sheets

This version keeps the existing FastAPI billing application and adds:

- Google OAuth login
- OTP sent to the Google account email
- Per-user data isolation
- Automatic `user_id` ownership on business records
- Automatic Google Sheets sync after database changes
- Separate Google Sheets tabs for each user's Products, Customers, Invoices, Invoice Items, Purchases, Stock Movements, Staff and Khatabook
- Existing offline/local database support remains available

## Required environment variables

Copy `.env.example` values into your local environment or Render Environment Variables.

### Google OAuth
Create an OAuth 2.0 Web Application client in Google Cloud Console.
Add the exact callback URL:

`http://127.0.0.1:8000/auth/google/callback`

and for Render:

`https://YOUR-APP.onrender.com/auth/google/callback`

Set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` and `GOOGLE_REDIRECT_URI`.

### Email OTP
For Gmail, use a Google App Password (not your normal Gmail password).
Set `SMTP_EMAIL` and `SMTP_PASSWORD`.

If SMTP is not configured during local development, the OTP is printed to the server console. Do not use that fallback in production.

### Google Sheets
1. Create a Google Cloud project/service account.
2. Enable the Google Sheets API.
3. Create a spreadsheet.
4. Share that spreadsheet with the service-account email as **Editor**.
5. Put the spreadsheet ID in `GOOGLE_SHEETS_ID`.
6. Put the service-account JSON in `GOOGLE_SERVICE_ACCOUNT_JSON`.

The app creates tabs such as `U1_Products`, `U1_Customers`, `U1_Invoices`, etc.

## Multi-user behavior

Every business record gets the authenticated user's ID automatically. Reads are automatically filtered by the current user, so one user cannot access another user's products, customers, bills, stock or khatabook through normal routes.

## Important existing database note

The ownership columns are automatically added to existing PostgreSQL/SQLite tables where possible. For a production migration with existing data, review the old records and assign ownership before exposing the database to multiple users.

## Run

```bash
pip install -r requirements.txt
uvicorn main:app --reload
```
