"""Google Sheets cloud storage/synchronisation for Sawariya Billing.

Uses a Google service account. Set GOOGLE_SHEETS_ID and
GOOGLE_SERVICE_ACCOUNT_JSON in the environment. The spreadsheet is shared
with the service-account email as Editor.
"""
import json
import os
import threading
from datetime import datetime
from decimal import Decimal

from google.oauth2.service_account import Credentials
from googleapiclient.discovery import build

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

SYNC_LOCK = threading.Lock()
SCOPES = ["https://www.googleapis.com/auth/spreadsheets"]


def _credentials():
    raw = os.getenv("GOOGLE_SERVICE_ACCOUNT_JSON", "").strip()
    if not raw:
        raise RuntimeError("GOOGLE_SERVICE_ACCOUNT_JSON is not configured")
    if os.path.isfile(raw):
        return Credentials.from_service_account_file(raw, scopes=SCOPES)
    return Credentials.from_service_account_info(json.loads(raw), scopes=SCOPES)


def _service():
    return build("sheets", "v4", credentials=_credentials(), cache_discovery=False)


def _db_session():
    from main import engine
    return sessionmaker(bind=engine, autoflush=False, autocommit=False)()


def _value(v):
    if v is None:
        return ""
    if isinstance(v, Decimal):
        return float(v)
    if isinstance(v, datetime):
        return v.isoformat(sep=" ", timespec="seconds")
    return v


def _rows(headers, records):
    out = [headers]
    for row in records:
        out.append([_value(x) for x in row])
    return out


def _ensure_sheet(service, spreadsheet_id, title):
    meta = service.spreadsheets().get(spreadsheetId=spreadsheet_id).execute()
    for sheet in meta.get("sheets", []):
        if sheet.get("properties", {}).get("title") == title:
            return
    service.spreadsheets().batchUpdate(
        spreadsheetId=spreadsheet_id,
        body={"requests": [{"addSheet": {"properties": {"title": title}}}]},
    ).execute()


def _replace_tab(service, spreadsheet_id, title, values):
    _ensure_sheet(service, spreadsheet_id, title)
    service.spreadsheets().values().clear(
        spreadsheetId=spreadsheet_id,
        range=f"'{title}'!A:ZZ",
        body={},
    ).execute()
    service.spreadsheets().values().update(
        spreadsheetId=spreadsheet_id,
        range=f"'{title}'!A1",
        valueInputOption="USER_ENTERED",
        body={"values": values},
    ).execute()


def sync_user_data(user_id: str):
    """Push one user's complete business data to dedicated spreadsheet tabs."""
    if not os.getenv("GOOGLE_SHEETS_ID", "").strip():
        return False

    # Avoid two concurrent bills rewriting the same spreadsheet at once.
    with SYNC_LOCK:
        from main import Product, Customer, Invoice, InvoiceItem, Purchase, StockMovement, Staff, Khatabook, KhatabookEntry
        sid = os.getenv("GOOGLE_SHEETS_ID", "").strip()
        d = _db_session()
        try:
            service = _service()
            uid = str(user_id)

            products = d.query(Product).filter(Product.user_id == uid).order_by(Product.id).all()
            _replace_tab(service, sid, f"U{uid}_Products", _rows(
                ["ID", "Name", "SKU", "Quantity", "Min Stock", "Purchase Price", "Wholesale Price", "Retailer Price"],
                [(x.id, x.name, x.sku, x.quantity, x.min_stock, x.purchase_price, x.wholesale_price, x.retailer_price) for x in products]
            ))

            customers = d.query(Customer).filter(Customer.user_id == uid).order_by(Customer.id).all()
            _replace_tab(service, sid, f"U{uid}_Customers", _rows(
                ["ID", "Name", "Phone", "Address"],
                [(x.id, x.name, x.phone, x.address) for x in customers]
            ))

            invoices = d.query(Invoice).filter(Invoice.user_id == uid).order_by(Invoice.id).all()
            _replace_tab(service, sid, f"U{uid}_Invoices", _rows(
                ["ID", "Invoice No", "Client Bill ID", "Customer ID", "Subtotal", "Discount", "Total", "Payment Mode", "Paid", "Due", "Created At"],
                [(x.id, x.invoice_no, x.client_bill_id, x.customer_id, x.subtotal, x.discount, x.total, x.payment_mode, x.paid, x.due, x.created_at) for x in invoices]
            ))

            items = d.query(InvoiceItem).filter(InvoiceItem.user_id == uid).order_by(InvoiceItem.id).all()
            _replace_tab(service, sid, f"U{uid}_Invoice_Items", _rows(
                ["ID", "Invoice ID", "Product ID", "Product Name", "Quantity", "Price", "Amount"],
                [(x.id, x.invoice_id, x.product_id, x.product_name, x.quantity, x.price, x.amount) for x in items]
            ))

            purchases = d.query(Purchase).filter(Purchase.user_id == uid).order_by(Purchase.id).all()
            _replace_tab(service, sid, f"U{uid}_Purchases", _rows(
                ["ID", "Supplier", "Total", "Created At"],
                [(x.id, x.supplier, x.total, x.created_at) for x in purchases]
            ))

            movements = d.query(StockMovement).filter(StockMovement.user_id == uid).order_by(StockMovement.id).all()
            _replace_tab(service, sid, f"U{uid}_Stock_Movements", _rows(
                ["ID", "Product ID", "Type", "Quantity", "Note", "Created At"],
                [(x.id, x.product_id, x.movement_type, x.quantity, x.note, x.created_at) for x in movements]
            ))

            staff = d.query(Staff).filter(Staff.user_id == uid).order_by(Staff.id).all()
            _replace_tab(service, sid, f"U{uid}_Staff", _rows(
                ["ID", "Name", "Phone", "Role", "Username", "Status", "Permissions", "Created At", "Updated At"],
                [(x.id, x.name, x.phone, x.role, x.username, x.status, x.permissions, x.created_at, x.updated_at) for x in staff]
            ))

            khata = d.query(Khatabook).filter(Khatabook.user_id == uid).order_by(Khatabook.id).all()
            _replace_tab(service, sid, f"U{uid}_Khatabook", _rows(
                ["ID", "Name", "Phone", "Address", "Customer ID", "Created At", "Updated At"],
                [(x.id, x.name, x.phone, x.address, x.customer_id, x.created_at, x.updated_at) for x in khata]
            ))

            entries = d.query(KhatabookEntry).filter(KhatabookEntry.user_id == uid).order_by(KhatabookEntry.id).all()
            _replace_tab(service, sid, f"U{uid}_Khatabook_Entries", _rows(
                ["ID", "Khatabook ID", "Customer ID", "Type", "Amount", "Note", "Date", "Created At", "Updated At"],
                [(x.id, x.khatabook_id, x.customer_id, x.type, x.amount, x.note, x.date, x.created_at, x.updated_at) for x in entries]
            ))
            return True
        finally:
            d.close()
