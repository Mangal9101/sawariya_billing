import os
from datetime import datetime, timezone, timedelta
from decimal import Decimal
from urllib.parse import quote

from fastapi import FastAPI, Request, Form
from fastapi.responses import HTMLResponse, RedirectResponse, JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from starlette.middleware.sessions import SessionMiddleware

from sqlalchemy import (
    create_engine, Column, Integer, String, Numeric,
    DateTime, ForeignKey, Text, func, text, event
)
from sqlalchemy.orm import declarative_base, sessionmaker, relationship, joinedload
from sqlalchemy.exc import IntegrityError


# =========================================================
# INDIA TIMEZONE
# =========================================================

IST = timezone(timedelta(hours=5, minutes=30))


def utc_to_ist(dt):
    if not dt:
        return dt

    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)

    return dt.astimezone(IST)


def ist_day_to_utc_range(selected_date):
    start_ist = datetime.combine(
        selected_date,
        datetime.min.time()
    ).replace(tzinfo=IST)

    end_ist = start_ist + timedelta(days=1)

    start_utc = start_ist.astimezone(
        timezone.utc
    ).replace(tzinfo=None)

    end_utc = end_ist.astimezone(
        timezone.utc
    ).replace(tzinfo=None)

    return start_utc, end_utc


# =========================================================
# DATABASE
# =========================================================

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

DATABASE_URL = os.getenv("DATABASE_URL", "").strip()

if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

if DATABASE_URL:
    engine = create_engine(DATABASE_URL, pool_pre_ping=True, future=True)
    DATABASE_MODE = "PostgreSQL (online)"
else:
    sqlite_path = os.getenv("OFFLINE_DB_PATH", os.path.join(BASE_DIR, "sawariya_billing.db"))
    engine = create_engine(
        f"sqlite:///{sqlite_path}",
        connect_args={"check_same_thread": False},
        future=True
    )
    DATABASE_MODE = "SQLite (offline/local)"

    @event.listens_for(engine, "connect")
    def _enable_sqlite_foreign_keys(dbapi_connection, connection_record):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()

SessionLocal = sessionmaker(
    bind=engine,
    autoflush=False,
    autocommit=False
)

Base = declarative_base()


# =========================================================
# MODELS
# =========================================================

class Product(Base):
    __tablename__ = "products"

    id = Column(Integer, primary_key=True)

    name = Column(
        String(150),
        unique=True,
        nullable=False
    )

    sku = Column(
        String(80),
        unique=True,
        nullable=True
    )

    quantity = Column(
        Integer,
        default=0
    )

    min_stock = Column(
        Integer,
        default=5
    )

    purchase_price = Column(
        Numeric(12, 2),
        default=0
    )

    wholesale_price = Column(
        Numeric(12, 2),
        default=0
    )

    retailer_price = Column(
        Numeric(12, 2),
        default=0
    )


class Customer(Base):
    __tablename__ = "customers"

    id = Column(Integer, primary_key=True)

    name = Column(
        String(150),
        nullable=True
    )

    phone = Column(
        String(30),
        nullable=True
    )

    address = Column(
        Text,
        nullable=True
    )


class Invoice(Base):
    __tablename__ = "invoices"

    id = Column(Integer, primary_key=True)

    invoice_no = Column(
        String(50),
        unique=True,
        nullable=False
    )

    # Offline bill duplicate protection
    client_bill_id = Column(
        String(100),
        unique=True,
        nullable=True,
        index=True
    )

    customer_id = Column(
        Integer,
        ForeignKey("customers.id"),
        nullable=True
    )

    subtotal = Column(
        Numeric(12, 2),
        default=0
    )

    discount = Column(
        Numeric(12, 2),
        default=0
    )

    total = Column(
        Numeric(12, 2),
        default=0
    )

    payment_mode = Column(
        String(30),
        default="Cash"
    )

    paid = Column(
        Numeric(12, 2),
        default=0
    )

    due = Column(
        Numeric(12, 2),
        default=0
    )

    created_at = Column(
        DateTime,
        default=datetime.utcnow
    )

    customer = relationship("Customer")

    items = relationship(
        "InvoiceItem",
        cascade="all, delete-orphan"
    )


class InvoiceItem(Base):
    __tablename__ = "invoice_items"

    id = Column(Integer, primary_key=True)

    invoice_id = Column(
        Integer,
        ForeignKey("invoices.id")
    )

    product_id = Column(
        Integer,
        ForeignKey("products.id"),
        nullable=True
    )

    product_name = Column(String(150))

    quantity = Column(
        Integer,
        nullable=False
    )

    price = Column(
        Numeric(12, 2),
        nullable=False
    )

    amount = Column(
        Numeric(12, 2),
        nullable=False
    )

    product = relationship("Product")


class Purchase(Base):
    __tablename__ = "purchases"

    id = Column(Integer, primary_key=True)

    supplier = Column(String(150))

    total = Column(
        Numeric(12, 2),
        default=0
    )

    created_at = Column(
        DateTime,
        default=datetime.utcnow
    )


class StockMovement(Base):
    __tablename__ = "stock_movements"

    id = Column(Integer, primary_key=True)

    product_id = Column(
        Integer,
        ForeignKey("products.id")
    )

    movement_type = Column(String(30))

    quantity = Column(Integer)

    note = Column(String(250))

    created_at = Column(
        DateTime,
        default=datetime.utcnow
    )

    product = relationship("Product")


class Staff(Base):

    __tablename__ = "staff"

    id = Column(Integer, primary_key=True)
    name = Column(String(150), nullable=False)
    phone = Column(String(30), nullable=True)
    role = Column(String(50), default="Staff")
    username = Column(String(100), unique=True, nullable=True)
    password = Column(String(255), nullable=True)
    status = Column(String(30), default="Active")
    permissions = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow)


class Khatabook(Base):

    __tablename__ = "khatabook"

    id = Column(Integer, primary_key=True)
    name = Column(String(150), nullable=False)
    phone = Column(String(30), nullable=True)
    address = Column(Text, nullable=True)
    customer_id = Column(Integer, ForeignKey("customers.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow)

    customer = relationship("Customer")
    entries = relationship(
        "KhatabookEntry",
        back_populates="khatabook",
        cascade="all, delete-orphan",
        order_by="KhatabookEntry.date.desc()"
    )


class KhatabookEntry(Base):

    __tablename__ = "khatabook_entries"

    id = Column(Integer, primary_key=True)
    khatabook_id = Column(Integer, ForeignKey("khatabook.id", ondelete="CASCADE"), nullable=False)
    customer_id = Column(Integer, ForeignKey("customers.id"), nullable=True)
    type = Column(String(30), nullable=False)
    amount = Column(Numeric(12, 2), nullable=False, default=0)
    note = Column(Text, nullable=True)
    date = Column(DateTime, default=datetime.utcnow)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow)
    sync_status = Column(String(30), default="synced")

    khatabook = relationship("Khatabook", back_populates="entries")
    customer = relationship("Customer")


# =========================================================
# CREATE TABLES + MIGRATIONS
# =========================================================

Base.metadata.create_all(engine)


def run_migrations():
    # Existing databases are created with Base.metadata.create_all().
    # Add the older offline bill column only when it is missing.
    try:
        with engine.begin() as connection:
            if engine.dialect.name == "postgresql":
                connection.execute(text("ALTER TABLE invoices ADD COLUMN IF NOT EXISTS client_bill_id VARCHAR(100)"))
                connection.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS ix_invoices_client_bill_id ON invoices (client_bill_id)"))
            elif engine.dialect.name == "sqlite":
                columns = [row[1] for row in connection.execute(text("PRAGMA table_info(invoices)"))]
                if "client_bill_id" not in columns:
                    connection.execute(text("ALTER TABLE invoices ADD COLUMN client_bill_id VARCHAR(100)"))
                connection.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS ix_invoices_client_bill_id ON invoices (client_bill_id)"))
    except Exception:
        # Never prevent the application from starting because an optional migration failed.
        pass


run_migrations()


# =========================================================
# FASTAPI
# =========================================================

app = FastAPI(
    title="Sawariya Confectionary Billing"
)


# =========================================================
# SESSION
# =========================================================

app.add_middleware(
    SessionMiddleware,
    secret_key=os.getenv(
        "SECRET_KEY",
        "change-this-secret"
    ),
    max_age=60 * 60 * 24 * 7
)


# =========================================================
# STATIC FILES
# =========================================================

app.mount(
    "/static",
    StaticFiles(directory="static"),
    name="static"
)


# =========================================================
# PWA FILES
# =========================================================

@app.get("/manifest.json")
def manifest():
    return FileResponse(
        "static/manifest.json",
        media_type="application/manifest+json"
    )


@app.get("/service-worker.js")
def service_worker():
    return FileResponse(
        "static/service-worker.js",
        media_type="application/javascript"
    )


# =========================================================
# TEMPLATES
# =========================================================

templates = Jinja2Templates(
    directory="templates"
)

templates.env.filters["ist_time"] = utc_to_ist
templates.env.filters["ist_time_text"] = lambda dt: utc_to_ist(dt).strftime("%d-%m-%Y %H:%M") if dt else ""


# =========================================================
# USERS
# =========================================================

USERS = {
    "admin": "admin123",
    "staff": "staff123"
}


# =========================================================
# HELPERS
# =========================================================

def db():
    return SessionLocal()


def login_required(request: Request):
    return request.session.get("username")


def money(value):
    return float(value or 0)


# =========================================================
# HOME
# =========================================================

@app.get("/", response_class=HTMLResponse)
def home(request: Request):
    if not login_required(request):
        return RedirectResponse(
            "/login",
            status_code=303
        )

    return RedirectResponse(
        "/dashboard",
        status_code=303
    )


# =========================================================
# LOGIN PAGE
# =========================================================

@app.get("/login", response_class=HTMLResponse)
def login_page(request: Request):
    return templates.TemplateResponse(
        request=request,
        name="login.html",
        context={}
    )


# =========================================================
# LOGIN
# =========================================================

@app.post("/login", response_class=HTMLResponse)
def login(
    request: Request,
    username: str = Form(...),
    password: str = Form(...)
):
    if USERS.get(username) == password:
        request.session.clear()
        request.session["username"] = username

        return RedirectResponse(
            "/dashboard",
            status_code=303
        )

    return templates.TemplateResponse(
        request=request,
        name="login.html",
        context={
            "error": "Invalid username or password"
        }
    )


# =========================================================
# LOGOUT
# =========================================================

@app.get("/logout")
def logout(request: Request):
    request.session.clear()

    return RedirectResponse(
        "/login",
        status_code=303
    )


# =========================================================
# DASHBOARD
# =========================================================

@app.get("/dashboard", response_class=HTMLResponse)
def dashboard(request: Request):
    username = login_required(request)

    if not username:
        return RedirectResponse(
            "/login",
            status_code=303
        )

    d = db()

    try:
        today = datetime.now(IST).date()

        start_utc, end_utc = ist_day_to_utc_range(
            today
        )

        sales = (
            d.query(
                func.coalesce(
                    func.sum(Invoice.total),
                    0
                )
            )
            .filter(Invoice.created_at >= start_utc)
            .filter(Invoice.created_at < end_utc)
            .scalar()
            or 0
        )

        bills = (
            d.query(func.count(Invoice.id))
            .filter(Invoice.created_at >= start_utc)
            .filter(Invoice.created_at < end_utc)
            .scalar()
            or 0
        )

        stock = (
            d.query(
                func.coalesce(
                    func.sum(Product.quantity),
                    0
                )
            )
            .scalar()
            or 0
        )

        low = (
            d.query(Product)
            .filter(
                Product.quantity <= Product.min_stock
            )
            .count()
        )

        products = (
            d.query(Product)
            .order_by(Product.name)
            .all()
        )

        return templates.TemplateResponse(
            request=request,
            name="dashboard.html",
            context={
                "username": username,
                "sales": sales,
                "bills": bills,
                "stock": stock,
                "low": low,
                "products": products
            }
        )

    finally:
        d.close()


# =========================================================
# PRODUCTS PAGE
# =========================================================

@app.get("/products", response_class=HTMLResponse)
def products_page(request: Request):
    username = login_required(request)

    if not username:
        return RedirectResponse(
            "/login",
            status_code=303
        )

    d = db()

    try:
        products = (
            d.query(Product)
            .order_by(Product.name)
            .all()
        )

        return templates.TemplateResponse(
            request=request,
            name="products.html",
            context={
                "username": username,
                "products": products
            }
        )

    finally:
        d.close()


# =========================================================
# ADD PRODUCT
# =========================================================

@app.post("/products/add")
def add_product(
    request: Request,
    name: str = Form(...),
    sku: str = Form(""),
    quantity: int = Form(0),
    min_stock: int = Form(5),
    purchase_price: float = Form(0),
    wholesale_price: float = Form(0),
    retailer_price: float = Form(0)
):
    if not login_required(request):
        return RedirectResponse(
            "/login",
            status_code=303
        )

    clean_name = name.strip()
    clean_sku = sku.strip()

    if not clean_name:
        return RedirectResponse(
            "/products?error=empty",
            status_code=303
        )

    d = db()

    try:
        existing_product = (
            d.query(Product)
            .filter(
                func.lower(Product.name)
                == clean_name.lower()
            )
            .first()
        )

        if existing_product:
            return RedirectResponse(
                "/products?error=product_exists",
                status_code=303
            )

        if clean_sku:
            existing_sku = (
                d.query(Product)
                .filter(
                    func.lower(Product.sku)
                    == clean_sku.lower()
                )
                .first()
            )

            if existing_sku:
                return RedirectResponse(
                    "/products?error=sku_exists",
                    status_code=303
                )

        product = Product(
            name=clean_name,
            sku=clean_sku or None,
            quantity=max(quantity, 0),
            min_stock=max(min_stock, 0),
            purchase_price=max(purchase_price, 0),
            wholesale_price=max(wholesale_price, 0),
            retailer_price=max(retailer_price, 0)
        )

        d.add(product)
        d.commit()

    except IntegrityError:
        d.rollback()

        return RedirectResponse(
            "/products?error=duplicate",
            status_code=303
        )

    except Exception:
        d.rollback()

        return RedirectResponse(
            "/products?error=server",
            status_code=303
        )

    finally:
        d.close()

    return RedirectResponse(
        "/products?success=added",
        status_code=303
    )


# =========================================================
# EDIT PRODUCT PAGE
# =========================================================

@app.get(
    "/products/{pid}/edit",
    response_class=HTMLResponse
)
def edit_product(
    request: Request,
    pid: int
):
    username = login_required(request)

    if not username:
        return RedirectResponse(
            "/login",
            status_code=303
        )

    d = db()

    try:
        product = d.get(Product, pid)

        if not product:
            return RedirectResponse(
                "/products",
                status_code=303
            )

        return templates.TemplateResponse(
            request=request,
            name="product_edit.html",
            context={
                "username": username,
                "p": product
            }
        )

    finally:
        d.close()


# =========================================================
# UPDATE PRODUCT
# =========================================================

@app.post("/products/{pid}/update")
def update_product(
    request: Request,
    pid: int,
    name: str = Form(...),
    sku: str = Form(""),
    quantity: int = Form(0),
    min_stock: int = Form(5),
    purchase_price: float = Form(0),
    wholesale_price: float = Form(0),
    retailer_price: float = Form(0)
):
    if not login_required(request):
        return RedirectResponse(
            "/login",
            status_code=303
        )

    clean_name = name.strip()
    clean_sku = sku.strip()

    if not clean_name:
        return RedirectResponse(
            f"/products/{pid}/edit?error=empty",
            status_code=303
        )

    d = db()

    try:
        product = d.get(Product, pid)

        if not product:
            return RedirectResponse(
                "/products",
                status_code=303
            )

        duplicate_name = (
            d.query(Product)
            .filter(
                func.lower(Product.name)
                == clean_name.lower()
            )
            .filter(Product.id != pid)
            .first()
        )

        if duplicate_name:
            return RedirectResponse(
                f"/products/{pid}/edit?error=product_exists",
                status_code=303
            )

        if clean_sku:
            duplicate_sku = (
                d.query(Product)
                .filter(
                    func.lower(Product.sku)
                    == clean_sku.lower()
                )
                .filter(Product.id != pid)
                .first()
            )

            if duplicate_sku:
                return RedirectResponse(
                    f"/products/{pid}/edit?error=sku_exists",
                    status_code=303
                )

        old_quantity = product.quantity or 0
        new_quantity = max(quantity, 0)

        product.name = clean_name
        product.sku = clean_sku or None
        product.quantity = new_quantity
        product.min_stock = max(min_stock, 0)
        product.purchase_price = max(purchase_price, 0)
        product.wholesale_price = max(wholesale_price, 0)
        product.retailer_price = max(retailer_price, 0)

        if old_quantity != new_quantity:
            difference = new_quantity - old_quantity

            d.add(
                StockMovement(
                    product_id=pid,
                    movement_type="Adjustment",
                    quantity=difference,
                    note="Product edit"
                )
            )

        d.commit()

    except IntegrityError:
        d.rollback()

        return RedirectResponse(
            f"/products/{pid}/edit?error=duplicate",
            status_code=303
        )

    except Exception:
        d.rollback()

        return RedirectResponse(
            f"/products/{pid}/edit?error=server",
            status_code=303
        )

    finally:
        d.close()

    return RedirectResponse(
        "/products?success=updated",
        status_code=303
    )


# =========================================================
# DELETE PRODUCT
# =========================================================

@app.post("/products/{pid}/delete")
def delete_product(
    request: Request,
    pid: int
):
    if not login_required(request):
        return RedirectResponse(
            "/login",
            status_code=303
        )

    d = db()

    try:
        product = d.get(Product, pid)

        if not product:
            return RedirectResponse(
                "/products",
                status_code=303
            )

        invoice_item_exists = (
            d.query(InvoiceItem.id)
            .filter(InvoiceItem.product_id == pid)
            .first()
        )

        if invoice_item_exists:
            return RedirectResponse(
                "/products?error=used_in_invoice",
                status_code=303
            )

        d.query(StockMovement).filter(
            StockMovement.product_id == pid
        ).delete(
            synchronize_session=False
        )

        d.delete(product)
        d.commit()

    except IntegrityError:
        d.rollback()

        return RedirectResponse(
            "/products?error=delete_failed",
            status_code=303
        )

    except Exception:
        d.rollback()

        return RedirectResponse(
            "/products?error=server",
            status_code=303
        )

    finally:
        d.close()

    return RedirectResponse(
        "/products?success=deleted",
        status_code=303
    )


# =========================================================
# PRODUCT SEARCH API
# ONLINE + OFFLINE PRODUCT DOWNLOAD
# =========================================================

@app.get("/api/products")
def api_products(
    request: Request,
    q: str = ""
):
    if not login_required(request):
        return JSONResponse(
            {
                "error": "unauthorized"
            },
            status_code=401
        )

    d = db()

    try:
        clean_q = (q or "").strip()

        query = d.query(Product)

        if clean_q:
            search_value = f"%{clean_q}%"

            query = query.filter(
                Product.name.ilike(search_value)
                |
                Product.sku.ilike(search_value)
            )

            query = query.limit(50)

        products = (
            query
            .order_by(Product.name)
            .all()
        )

        output = []

        for product in products:
            output.append(
                {
                    "id": product.id,
                    "name": product.name,
                    "sku": product.sku or "",
                    "code": product.sku or "",
                    "stock": product.quantity or 0,
                    "purchase": money(
                        product.purchase_price
                    ),
                    "wholesale": money(
                        product.wholesale_price
                    ),
                    "retail": money(
                        product.retailer_price
                    )
                }
            )

        return output

    finally:
        d.close()


# =========================================================
# BILLING PAGE
# =========================================================

@app.get("/billing", response_class=HTMLResponse)
def billing(request: Request):
    username = login_required(request)

    if not username:
        return RedirectResponse(
            "/login",
            status_code=303
        )

    d = db()

    try:
        customers = (
            d.query(Customer)
            .order_by(Customer.name)
            .all()
        )

        products = (
            d.query(Product)
            .order_by(Product.name)
            .all()
        )

        # Never pass SQLAlchemy objects through Jinja's |tojson filter.
        # The billing page needs a plain JSON-safe catalog for offline search.
        product_catalog = [
            {
                "id": product.id,
                "name": product.name or "",
                "sku": product.sku or "",
                "stock": int(product.quantity or 0),
                "purchase": float(product.purchase_price or 0),
                "wholesale": float(product.wholesale_price or 0),
                "retail": float(product.retailer_price or 0),
            }
            for product in products
        ]

        return templates.TemplateResponse(
            request=request,
            name="billing.html",
            context={
                "username": username,
                "customers": customers,
                "products": product_catalog
            }
        )

    finally:
        d.close()


# =========================================================
# SAVE BILL
# ONLINE + OFFLINE SYNC SUPPORT
# =========================================================

@app.post("/billing/save")
async def save_bill(request: Request):
    if not login_required(request):
        return JSONResponse(
            {
                "error": "unauthorized"
            },
            status_code=401
        )

    try:
        data = await request.json()

    except Exception:
        return JSONResponse(
            {
                "error": "Invalid JSON data"
            },
            status_code=400
        )

    # Offline duplicate protection
    client_bill_id = str(
        data.get(
            "client_bill_id",
            ""
        )
        or ""
    ).strip()

    # Quick duplicate check
    if client_bill_id:
        d = db()

        try:
            existing_invoice = (
                d.query(Invoice)
                .filter(
                    Invoice.client_bill_id
                    == client_bill_id
                )
                .first()
            )

            if existing_invoice:
                return {
                    "ok": True,
                    "already_saved": True,
                    "invoice_id": existing_invoice.id,
                    "invoice_no":
                        existing_invoice.invoice_no,
                    "total":
                        float(
                            existing_invoice.total
                            or 0
                        ),
                    "due":
                        float(
                            existing_invoice.due
                            or 0
                        )
                }

        finally:
            d.close()

    items = data.get("items", [])

    if not items:
        return JSONResponse(
            {
                "error": "No products selected"
            },
            status_code=400
        )

    try:
        discount = Decimal(
            str(
                data.get(
                    "discount",
                    0
                )
                or 0
            )
        )

        if discount < 0:
            discount = Decimal("0")

        payment = str(
            data.get(
                "payment_mode",
                "Cash"
            )
            or "Cash"
        ).strip()

        paid = Decimal(
            str(
                data.get(
                    "paid",
                    0
                )
                or 0
            )
        )

        if paid < 0:
            paid = Decimal("0")

    except Exception:
        return JSONResponse(
            {
                "error": "Invalid billing values"
            },
            status_code=400
        )

    customer = data.get("customer") or {}

    if not isinstance(customer, dict):
        customer = {}

    d = db()

    subtotal = Decimal("0")
    clean = []

    try:
        # Double duplicate check for simultaneous requests
        if client_bill_id:
            existing_invoice = (
                d.query(Invoice)
                .filter(
                    Invoice.client_bill_id
                    == client_bill_id
                )
                .first()
            )

            if existing_invoice:
                return {
                    "ok": True,
                    "already_saved": True,
                    "invoice_id": existing_invoice.id,
                    "invoice_no":
                        existing_invoice.invoice_no,
                    "total":
                        float(
                            existing_invoice.total
                            or 0
                        ),
                    "due":
                        float(
                            existing_invoice.due
                            or 0
                        )
                }

        # Validate products and stock
        for item in items:
            product_id = int(
                item.get("product_id")
            )

            qty = int(
                item.get("quantity")
            )

            product = d.get(
                Product,
                product_id
            )

            if not product:
                raise ValueError(
                    "Invalid product"
                )

            if qty <= 0:
                raise ValueError(
                    "Invalid quantity"
                )

            available_stock = (
                product.quantity
                or 0
            )

            if available_stock < qty:
                raise ValueError(
                    f"Insufficient stock: "
                    f"{product.name} "
                    f"({available_stock} available)"
                )

            # Billing uses wholesale price
            price = Decimal(
                str(
                    product.wholesale_price
                    or 0
                )
            )

            if price < 0:
                price = Decimal("0")

            amount = price * qty

            subtotal += amount

            clean.append(
                (
                    product,
                    qty,
                    price,
                    amount
                )
            )

        if discount > subtotal:
            discount = subtotal

        total = subtotal - discount
        paid = min(paid, total)
        due = total - paid

        # Customer
        customer_id = None

        customer_name = str(
            customer.get("name")
            or ""
        ).strip()

        customer_phone = str(
            customer.get("phone")
            or ""
        ).strip()

        customer_address = str(
            customer.get("address")
            or ""
        ).strip()

        if (
            customer_name
            or customer_phone
            or customer_address
        ):
            new_customer = Customer(
                name=(
                    customer_name
                    or "Walk-in Customer"
                ),
                phone=(
                    customer_phone
                    or None
                ),
                address=(
                    customer_address
                    or None
                )
            )

            d.add(new_customer)
            d.flush()

            customer_id = new_customer.id

        invoice_no = (
            "INV-"
            + datetime.utcnow().strftime(
                "%Y%m%d%H%M%S%f"
            )[:-3]
        )

        invoice = Invoice(
            invoice_no=invoice_no,
            client_bill_id=(
                client_bill_id
                or None
            ),
            customer_id=customer_id,
            subtotal=subtotal,
            discount=discount,
            total=total,
            payment_mode=payment,
            paid=paid,
            due=due
        )

        d.add(invoice)
        d.flush()

        # Save items + update stock
        for (
            product,
            qty,
            price,
            amount
        ) in clean:

            product.quantity = (
                (product.quantity or 0)
                - qty
            )

            invoice_item = InvoiceItem(
                invoice_id=invoice.id,
                product_id=product.id,
                product_name=product.name,
                quantity=qty,
                price=price,
                amount=amount
            )

            d.add(invoice_item)

            d.add(
                StockMovement(
                    product_id=product.id,
                    movement_type="Sale",
                    quantity=-qty,
                    note=invoice_no
                )
            )

        d.commit()

        return {
            "ok": True,
            "already_saved": False,
            "invoice_id": invoice.id,
            "invoice_no": invoice_no,
            "total": float(total),
            "due": float(due)
        }

    except IntegrityError:
        d.rollback()

        if client_bill_id:
            try:
                existing_invoice = (
                    d.query(Invoice)
                    .filter(
                        Invoice.client_bill_id
                        == client_bill_id
                    )
                    .first()
                )

                if existing_invoice:
                    return {
                        "ok": True,
                        "already_saved": True,
                        "invoice_no":
                            existing_invoice.invoice_no,
                        "total":
                            float(
                                existing_invoice.total
                                or 0
                            ),
                        "due":
                            float(
                                existing_invoice.due
                                or 0
                            )
                    }

            except Exception:
                pass

        return JSONResponse(
            {
                "error": "Duplicate invoice"
            },
            status_code=400
        )

    except Exception as e:
        d.rollback()

        return JSONResponse(
            {
                "error": str(e)
            },
            status_code=400
        )

    finally:
        d.close()


# =========================================================
# CUSTOMERS PAGE
# =========================================================

@app.get("/customers", response_class=HTMLResponse)
def customers(request: Request):
    username = login_required(request)

    if not username:
        return RedirectResponse(
            "/login",
            status_code=303
        )

    d = db()

    try:
        customers_list = (
            d.query(Customer)
            .order_by(Customer.name)
            .all()
        )

        return templates.TemplateResponse(
            request=request,
            name="customers.html",
            context={
                "customers": customers_list,
                "username": username
            }
        )

    finally:
        d.close()


# =========================================================
# ADD CUSTOMER
# =========================================================

@app.post("/customers/add")
def add_customer(
    request: Request,
    name: str = Form(""),
    phone: str = Form(""),
    address: str = Form("")
):
    if not login_required(request):
        return RedirectResponse(
            "/login",
            status_code=303
        )

    d = db()

    try:
        d.add(
            Customer(
                name=name.strip() or None,
                phone=phone.strip() or None,
                address=address.strip() or None
            )
        )

        d.commit()

    except Exception:
        d.rollback()

        return RedirectResponse(
            "/customers?error=server",
            status_code=303
        )

    finally:
        d.close()

    return RedirectResponse(
        "/customers?success=added",
        status_code=303
    )


# =========================================================
# CUSTOMER EDIT / DELETE
# =========================================================

@app.get("/customers/{customer_id}/edit", response_class=HTMLResponse)
def edit_customer(request: Request, customer_id: int):
    username = login_required(request)
    if not username:
        return RedirectResponse("/login", status_code=303)

    d = db()
    try:
        customer = d.get(Customer, customer_id)
        if not customer:
            return RedirectResponse("/customers?error=not_found", status_code=303)
        return templates.TemplateResponse(
            request=request,
            name="customer_edit.html",
            context={"customer": customer, "username": username}
        )
    finally:
        d.close()


@app.post("/customers/{customer_id}/update")
def update_customer(
    request: Request,
    customer_id: int,
    name: str = Form(""),
    phone: str = Form(""),
    address: str = Form("")
):
    if not login_required(request):
        return RedirectResponse("/login", status_code=303)

    clean_name = name.strip()
    if not clean_name:
        return RedirectResponse(f"/customers/{customer_id}/edit?error=name", status_code=303)

    d = db()
    try:
        customer = d.get(Customer, customer_id)
        if not customer:
            return RedirectResponse("/customers?error=not_found", status_code=303)
        customer.name = clean_name
        customer.phone = phone.strip() or None
        customer.address = address.strip() or None
        d.commit()
        return RedirectResponse("/customers?success=updated", status_code=303)
    except Exception:
        d.rollback()
        return RedirectResponse(f"/customers/{customer_id}/edit?error=server", status_code=303)
    finally:
        d.close()


@app.post("/customers/{customer_id}/delete")
def delete_customer(request: Request, customer_id: int):
    if not login_required(request):
        return RedirectResponse("/login", status_code=303)

    d = db()
    try:
        customer = d.get(Customer, customer_id)
        if not customer:
            return RedirectResponse("/customers?error=not_found", status_code=303)
        # Existing invoices keep their customer relationship nullable.
        d.query(Invoice).filter(Invoice.customer_id == customer_id).update(
            {Invoice.customer_id: None}, synchronize_session=False
        )
        d.delete(customer)
        d.commit()
        return RedirectResponse("/customers?success=deleted", status_code=303)
    except Exception:
        d.rollback()
        return RedirectResponse("/customers?error=server", status_code=303)
    finally:
        d.close()


@app.get("/api/customers")
def api_customers(request: Request, q: str = ""):
    if not login_required(request):
        return JSONResponse({"error": "unauthorized"}, status_code=401)
    d = db()
    try:
        query = d.query(Customer)
        search = (q or "").strip()
        if search:
            pattern = f"%{search}%"
            query = query.filter(
                Customer.name.ilike(pattern)
                | Customer.phone.ilike(pattern)
                | Customer.address.ilike(pattern)
            )
        return [
            {"id": c.id, "name": c.name or "", "phone": c.phone or "", "address": c.address or ""}
            for c in query.order_by(Customer.name).all()
        ]
    finally:
        d.close()


# =========================================================
# STOCK PAGE
# =========================================================

@app.get("/stock", response_class=HTMLResponse)
def stock(request: Request):
    username = login_required(request)

    if not username:
        return RedirectResponse(
            "/login",
            status_code=303
        )

    d = db()

    try:
        products = (
            d.query(Product)
            .order_by(Product.name)
            .all()
        )

        return templates.TemplateResponse(
            request=request,
            name="stock.html",
            context={
                "products": products,
                "username": username
            }
        )

    finally:
        d.close()


# =========================================================
# REPORTS
# =========================================================

@app.get("/reports", response_class=HTMLResponse)
def reports(
    request: Request,
    date: str = ""
):
    username = login_required(request)

    if not username:
        return RedirectResponse(
            "/login",
            status_code=303
        )

    report_date = (
        date
        or datetime.now(IST).strftime(
            "%Y-%m-%d"
        )
    )

    try:
        selected = datetime.strptime(
            report_date,
            "%Y-%m-%d"
        ).date()

    except ValueError:
        selected = datetime.now(IST).date()

        report_date = selected.strftime(
            "%Y-%m-%d"
        )

    start_utc, end_utc = ist_day_to_utc_range(
        selected
    )

    d = db()

    try:
        invoices = (
            d.query(Invoice)
            .options(
                joinedload(Invoice.customer),
                joinedload(Invoice.items).joinedload(
                    InvoiceItem.product
                )
            )
            .filter(
                Invoice.created_at >= start_utc
            )
            .filter(
                Invoice.created_at < end_utc
            )
            .order_by(
                Invoice.created_at.desc()
            )
            .all()
        )

        sales = Decimal("0")
        paid = Decimal("0")
        due = Decimal("0")
        net_profit = Decimal("0")

        for invoice in invoices:
            invoice_total = Decimal(
                str(
                    invoice.total
                    or 0
                )
            )

            sales += invoice_total

            paid += Decimal(
                str(
                    invoice.paid
                    or 0
                )
            )

            due += Decimal(
                str(
                    invoice.due
                    or 0
                )
            )

            invoice_profit = Decimal("0")

            for item in invoice.items:
                selling_price = Decimal(
                    str(
                        item.price
                        or 0
                    )
                )

                purchase_price = Decimal("0")

                if item.product:
                    purchase_price = Decimal(
                        str(
                            item.product.purchase_price
                            or 0
                        )
                    )

                quantity = Decimal(
                    str(
                        item.quantity
                        or 0
                    )
                )

                item_profit = (
                    selling_price
                    - purchase_price
                ) * quantity

                invoice_profit += item_profit

            discount = Decimal(
                str(
                    invoice.discount
                    or 0
                )
            )

            invoice_profit -= discount

            if invoice_profit < 0:
                invoice_profit = Decimal("0")

            # Temporary value for template use
            invoice.net_profit = invoice_profit

            net_profit += invoice_profit

        summary = {
            "bills": len(invoices),
            "sales": sales,
            "paid": paid,
            "due": due,
            "net_profit": net_profit
        }

        return templates.TemplateResponse(
            request=request,
            name="reports.html",
            context={
                "invoices": invoices,
                "username": username,
                "report_date": report_date,
                "summary": summary
            }
        )

    finally:
        d.close()


# =========================================================
# STAFF MANAGEMENT
# =========================================================

@app.get("/staff", response_class=HTMLResponse)
def staff_page(request: Request):
    username = login_required(request)
    if not username:
        return RedirectResponse("/login", status_code=303)

    d = db()
    try:
        staff_list = d.query(Staff).order_by(Staff.name).all()
        return templates.TemplateResponse(
            request=request,
            name="staff.html",
            context={"username": username, "staff": staff_list, "staff_list": staff_list}
        )
    finally:
        d.close()


def staff_dict(member):
    return {
        "id": member.id,
        "name": member.name or "",
        "phone": member.phone or "",
        "role": member.role or "Staff",
        "username": member.username or "",
        "password": member.password or "",
        "status": member.status or "Active",
        "permissions": member.permissions or "",
        "created_at": utc_to_ist(member.created_at).isoformat() if member.created_at else None,
        "updated_at": utc_to_ist(member.updated_at).isoformat() if member.updated_at else None,
    }


@app.get("/api/staff")
def api_staff(request: Request, q: str = ""):
    if not login_required(request):
        return JSONResponse({"error": "unauthorized"}, status_code=401)
    d = db()
    try:
        query = d.query(Staff)
        search = (q or "").strip()
        if search:
            pattern = f"%{search}%"
            query = query.filter(
                Staff.name.ilike(pattern)
                | Staff.phone.ilike(pattern)
                | Staff.role.ilike(pattern)
                | Staff.username.ilike(pattern)
            )
        return [staff_dict(x) for x in query.order_by(Staff.name).all()]
    finally:
        d.close()


@app.post("/api/staff")
async def api_staff_create(request: Request):
    if not login_required(request):
        return JSONResponse({"error": "unauthorized"}, status_code=401)
    try:
        data = await request.json()
    except Exception:
        return JSONResponse({"error": "Invalid JSON data"}, status_code=400)

    name = str(data.get("name") or "").strip()
    if not name:
        return JSONResponse({"error": "Staff name is required"}, status_code=400)

    d = db()
    try:
        username = str(data.get("username") or "").strip() or None
        if username and d.query(Staff).filter(func.lower(Staff.username) == username.lower()).first():
            return JSONResponse({"error": "Username already exists"}, status_code=409)

        member = Staff(
            name=name,
            phone=str(data.get("phone") or "").strip() or None,
            role=str(data.get("role") or "Staff").strip() or "Staff",
            username=username,
            password=str(data.get("password") or "").strip() or None,
            status=str(data.get("status") or "Active").strip() or "Active",
            permissions=str(data.get("permissions") or "").strip() or None,
        )
        d.add(member)
        d.commit()
        d.refresh(member)
        return {"ok": True, "staff": staff_dict(member)}
    except IntegrityError:
        d.rollback()
        return JSONResponse({"error": "Staff already exists"}, status_code=409)
    except Exception as e:
        d.rollback()
        return JSONResponse({"error": str(e)}, status_code=400)
    finally:
        d.close()


@app.put("/api/staff/{staff_id}")
async def api_staff_update(request: Request, staff_id: int):
    if not login_required(request):
        return JSONResponse({"error": "unauthorized"}, status_code=401)
    try:
        data = await request.json()
    except Exception:
        return JSONResponse({"error": "Invalid JSON data"}, status_code=400)

    d = db()
    try:
        member = d.get(Staff, staff_id)
        if not member:
            return JSONResponse({"error": "Staff not found"}, status_code=404)

        name = str(data.get("name", member.name) or "").strip()
        if not name:
            return JSONResponse({"error": "Staff name is required"}, status_code=400)

        username = str(data.get("username", member.username or "") or "").strip() or None
        if username:
            duplicate = (
                d.query(Staff)
                .filter(func.lower(Staff.username) == username.lower())
                .filter(Staff.id != staff_id)
                .first()
            )
            if duplicate:
                return JSONResponse({"error": "Username already exists"}, status_code=409)

        member.name = name
        member.phone = str(data.get("phone", member.phone or "") or "").strip() or None
        member.role = str(data.get("role", member.role or "Staff") or "Staff").strip() or "Staff"
        member.username = username
        if "password" in data:
            password = str(data.get("password") or "").strip()
            if password:
                member.password = password
        member.status = str(data.get("status", member.status or "Active") or "Active").strip() or "Active"
        member.permissions = str(data.get("permissions", member.permissions or "") or "").strip() or None
        member.updated_at = datetime.utcnow()
        d.commit()
        d.refresh(member)
        return {"ok": True, "staff": staff_dict(member)}
    except IntegrityError:
        d.rollback()
        return JSONResponse({"error": "Username already exists"}, status_code=409)
    except Exception as e:
        d.rollback()
        return JSONResponse({"error": str(e)}, status_code=400)
    finally:
        d.close()


@app.delete("/api/staff/{staff_id}")
def api_staff_delete(request: Request, staff_id: int):
    if not login_required(request):
        return JSONResponse({"error": "unauthorized"}, status_code=401)
    d = db()
    try:
        member = d.get(Staff, staff_id)
        if not member:
            return JSONResponse({"error": "Staff not found"}, status_code=404)
        d.delete(member)
        d.commit()
        return {"ok": True, "deleted": staff_id}
    except Exception as e:
        d.rollback()
        return JSONResponse({"error": str(e)}, status_code=400)
    finally:
        d.close()


# =========================================================
# KHATABOOK MANAGEMENT
# =========================================================

@app.get("/khatabook", response_class=HTMLResponse)
def khatabook_page(request: Request):
    username = login_required(request)
    if not username:
        return RedirectResponse("/login", status_code=303)

    d = db()
    try:
        customers_list = d.query(Khatabook).order_by(Khatabook.name).all()
        return templates.TemplateResponse(
            request=request,
            name="khatabook.html",
            context={
                "username": username,
                "khatabook": customers_list,
                "khatabook_list": customers_list,
                "customers": customers_list,
            }
        )
    finally:
        d.close()


def normalize_entry_type(value):
    value = str(value or "credit").strip().lower()
    if value in {"debit", "take", "received", "you_give", "give_to_customer"}:
        return "debit"
    return "credit"


def khata_customer_dict(customer, d=None):
    entries = list(customer.entries or [])
    you_will_get = Decimal("0")
    you_will_give = Decimal("0")
    for entry in entries:
        amount = Decimal(str(entry.amount or 0))
        if normalize_entry_type(entry.type) == "credit":
            you_will_get += amount
        else:
            you_will_give += amount
    balance = you_will_get - you_will_give
    return {
        "id": customer.id,
        "name": customer.name or "",
        "phone": customer.phone or "",
        "address": customer.address or "",
        "customer_id": customer.customer_id,
        "you_will_get": float(you_will_get),
        "you_will_give": float(you_will_give),
        "balance": float(balance),
        "updated_at": utc_to_ist(customer.updated_at).isoformat() if customer.updated_at else None,
    }


def khata_entry_dict(entry):
    return {
        "id": entry.id,
        "khatabook_id": entry.khatabook_id,
        "customer_id": entry.customer_id,
        "type": normalize_entry_type(entry.type),
        "amount": float(entry.amount or 0),
        "note": entry.note or "",
        "date": utc_to_ist(entry.date).isoformat() if entry.date else None,
        "created_at": utc_to_ist(entry.created_at).isoformat() if entry.created_at else None,
        "updated_at": utc_to_ist(entry.updated_at).isoformat() if entry.updated_at else None,
        "sync_status": entry.sync_status or "synced",
    }


@app.get("/api/khatabook")
def api_khatabook(request: Request, q: str = ""):
    if not login_required(request):
        return JSONResponse({"error": "unauthorized"}, status_code=401)
    d = db()
    try:
        query = d.query(Khatabook).options(joinedload(Khatabook.entries))
        search = (q or "").strip()
        if search:
            pattern = f"%{search}%"
            query = query.filter(
                Khatabook.name.ilike(pattern)
                | Khatabook.phone.ilike(pattern)
            )
        return [khata_customer_dict(x) for x in query.order_by(Khatabook.name).all()]
    finally:
        d.close()


@app.post("/api/khatabook")
async def api_khatabook_create(request: Request):
    if not login_required(request):
        return JSONResponse({"error": "unauthorized"}, status_code=401)
    try:
        data = await request.json()
    except Exception:
        return JSONResponse({"error": "Invalid JSON data"}, status_code=400)

    name = str(data.get("name") or "").strip()
    if not name:
        return JSONResponse({"error": "Customer name is required"}, status_code=400)

    d = db()
    try:
        customer_id = data.get("customer_id")
        try:
            customer_id = int(customer_id) if customer_id is not None else None
        except (TypeError, ValueError):
            customer_id = None

        khata = Khatabook(
            name=name,
            phone=str(data.get("phone") or "").strip() or None,
            address=str(data.get("address") or "").strip() or None,
            customer_id=customer_id,
        )
        d.add(khata)
        d.commit()
        d.refresh(khata)
        return {"ok": True, "customer": khata_customer_dict(khata)}
    except Exception as e:
        d.rollback()
        return JSONResponse({"error": str(e)}, status_code=400)
    finally:
        d.close()


@app.put("/api/khatabook/{khatabook_id}")
async def api_khatabook_update(request: Request, khatabook_id: int):
    if not login_required(request):
        return JSONResponse({"error": "unauthorized"}, status_code=401)
    try:
        data = await request.json()
    except Exception:
        return JSONResponse({"error": "Invalid JSON data"}, status_code=400)

    d = db()
    try:
        khata = d.get(Khatabook, khatabook_id)
        if not khata:
            return JSONResponse({"error": "Khatabook customer not found"}, status_code=404)

        khata.name = str(data.get("name", khata.name) or "").strip()
        if not khata.name:
            return JSONResponse({"error": "Customer name is required"}, status_code=400)
        khata.phone = str(data.get("phone", khata.phone or "") or "").strip() or None
        khata.address = str(data.get("address", khata.address or "") or "").strip() or None
        if "customer_id" in data:
            try:
                khata.customer_id = int(data.get("customer_id")) if data.get("customer_id") is not None else None
            except (TypeError, ValueError):
                khata.customer_id = None
        khata.updated_at = datetime.utcnow()
        d.commit()
        d.refresh(khata)
        return {"ok": True, "customer": khata_customer_dict(khata)}
    except Exception as e:
        d.rollback()
        return JSONResponse({"error": str(e)}, status_code=400)
    finally:
        d.close()


@app.delete("/api/khatabook/{khatabook_id}")
def api_khatabook_delete(request: Request, khatabook_id: int):
    if not login_required(request):
        return JSONResponse({"error": "unauthorized"}, status_code=401)
    d = db()
    try:
        khata = d.get(Khatabook, khatabook_id)
        if not khata:
            return JSONResponse({"error": "Khatabook customer not found"}, status_code=404)
        d.delete(khata)
        d.commit()
        return {"ok": True, "deleted": khatabook_id}
    except Exception as e:
        d.rollback()
        return JSONResponse({"error": str(e)}, status_code=400)
    finally:
        d.close()


@app.get("/api/khatabook/entries")
def api_khatabook_entries(request: Request, khatabook_id: int = 0, customer_id: int = 0):
    if not login_required(request):
        return JSONResponse({"error": "unauthorized"}, status_code=401)
    d = db()
    try:
        query = d.query(KhatabookEntry)
        if khatabook_id:
            query = query.filter(KhatabookEntry.khatabook_id == khatabook_id)
        elif customer_id:
            query = query.filter(KhatabookEntry.customer_id == customer_id)
        return [khata_entry_dict(x) for x in query.order_by(KhatabookEntry.date.desc(), KhatabookEntry.id.desc()).all()]
    finally:
        d.close()


@app.get("/api/khatabook/entries/{customer_id}")
def api_khatabook_entries_customer(request: Request, customer_id: int):
    return api_khatabook_entries(request, customer_id=customer_id)


@app.post("/api/khatabook/entries")
async def api_khatabook_entry_create(request: Request):
    if not login_required(request):
        return JSONResponse({"error": "unauthorized"}, status_code=401)
    try:
        data = await request.json()
    except Exception:
        return JSONResponse({"error": "Invalid JSON data"}, status_code=400)

    d = db()
    try:
        try:
            khatabook_id = int(data.get("khatabook_id") or data.get("customer_id"))
        except (TypeError, ValueError):
            return JSONResponse({"error": "Invalid khatabook customer"}, status_code=400)

        khata = d.get(Khatabook, khatabook_id)
        if not khata:
            return JSONResponse({"error": "Khatabook customer not found"}, status_code=404)

        try:
            amount = Decimal(str(data.get("amount") or 0))
        except Exception:
            return JSONResponse({"error": "Invalid amount"}, status_code=400)
        if amount <= 0:
            return JSONResponse({"error": "Amount must be greater than zero"}, status_code=400)

        entry_date = datetime.utcnow()
        raw_date = data.get("date")
        if raw_date:
            try:
                raw = str(raw_date).replace("Z", "+00:00")
                parsed = datetime.fromisoformat(raw)
                if parsed.tzinfo:
                    entry_date = parsed.astimezone(timezone.utc).replace(tzinfo=None)
                else:
                    entry_date = parsed
            except Exception:
                pass

        entry = KhatabookEntry(
            khatabook_id=khata.id,
            customer_id=khata.customer_id,
            type=normalize_entry_type(data.get("type")),
            amount=amount,
            note=str(data.get("note") or "").strip() or None,
            date=entry_date,
            sync_status="synced",
        )
        khata.updated_at = datetime.utcnow()
        d.add(entry)
        d.commit()
        d.refresh(entry)
        return {"ok": True, "entry": khata_entry_dict(entry)}
    except Exception as e:
        d.rollback()
        return JSONResponse({"error": str(e)}, status_code=400)
    finally:
        d.close()


@app.put("/api/khatabook/entries/{entry_id}")
async def api_khatabook_entry_update(request: Request, entry_id: int):
    if not login_required(request):
        return JSONResponse({"error": "unauthorized"}, status_code=401)
    try:
        data = await request.json()
    except Exception:
        return JSONResponse({"error": "Invalid JSON data"}, status_code=400)

    d = db()
    try:
        entry = d.get(KhatabookEntry, entry_id)
        if not entry:
            return JSONResponse({"error": "Entry not found"}, status_code=404)
        if "type" in data:
            entry.type = normalize_entry_type(data.get("type"))
        if "amount" in data:
            amount = Decimal(str(data.get("amount") or 0))
            if amount <= 0:
                return JSONResponse({"error": "Amount must be greater than zero"}, status_code=400)
            entry.amount = amount
        if "note" in data:
            entry.note = str(data.get("note") or "").strip() or None
        if "date" in data and data.get("date"):
            try:
                parsed = datetime.fromisoformat(str(data.get("date")).replace("Z", "+00:00"))
                entry.date = parsed.astimezone(timezone.utc).replace(tzinfo=None) if parsed.tzinfo else parsed
            except Exception:
                pass
        entry.updated_at = datetime.utcnow()
        d.commit()
        d.refresh(entry)
        return {"ok": True, "entry": khata_entry_dict(entry)}
    except Exception as e:
        d.rollback()
        return JSONResponse({"error": str(e)}, status_code=400)
    finally:
        d.close()


@app.delete("/api/khatabook/entries/{entry_id}")
def api_khatabook_entry_delete(request: Request, entry_id: int):
    if not login_required(request):
        return JSONResponse({"error": "unauthorized"}, status_code=401)
    d = db()
    try:
        entry = d.get(KhatabookEntry, entry_id)
        if not entry:
            return JSONResponse({"error": "Entry not found"}, status_code=404)
        d.delete(entry)
        d.commit()
        return {"ok": True, "deleted": entry_id}
    except Exception as e:
        d.rollback()
        return JSONResponse({"error": str(e)}, status_code=400)
    finally:
        d.close()


# =========================================================
# INVOICE PAGE
# =========================================================

@app.get("/invoice/{invoice_id}", response_class=HTMLResponse)
def invoice_page(request: Request, invoice_id: int):
    username = login_required(request)
    if not username:
        return RedirectResponse("/login", status_code=303)

    d = db()
    try:
        invoice = (
            d.query(Invoice)
            .options(
                joinedload(Invoice.customer),
                joinedload(Invoice.items)
            )
            .filter(Invoice.id == invoice_id)
            .first()
        )
        if not invoice:
            return RedirectResponse("/reports", status_code=303)

        return templates.TemplateResponse(
            request=request,
            name="invoice.html",
            context={"invoice": invoice, "username": username}
        )
    finally:
        d.close()


# =========================================================
# SHARE INVOICE ON WHATSAPP
# =========================================================

@app.get("/invoice/{invoice_id}/whatsapp")
def share_invoice_whatsapp(
    request: Request,
    invoice_id: int
):
    if not login_required(request):
        return RedirectResponse(
            "/login",
            status_code=303
        )

    d = db()

    try:
        invoice = (
            d.query(Invoice)
            .options(
                joinedload(Invoice.customer),
                joinedload(Invoice.items)
            )
            .filter(
                Invoice.id == invoice_id
            )
            .first()
        )

        if not invoice:
            return RedirectResponse(
                "/reports",
                status_code=303
            )

        phone = ""

        if invoice.customer:
            phone = (
                invoice.customer.phone
                or ""
            )

        phone = (
            phone
            .replace(" ", "")
            .replace("-", "")
            .replace("+", "")
        )

        if phone and len(phone) == 10:
            phone = "91" + phone

        customer_name = "Walk-in Customer"

        if (
            invoice.customer
            and invoice.customer.name
        ):
            customer_name = (
                invoice.customer.name
            )

        created_time = utc_to_ist(
            invoice.created_at
        )

        date_text = ""

        if created_time:
            date_text = (
                created_time.strftime(
                    "%d-%m-%Y %H:%M"
                )
            )

        message = (
            "🧾 *SAWARIYA CONFECTIONARY*\n"
            "------------------------------\n\n"
            f"*Invoice:* {invoice.invoice_no}\n"
            f"*Date:* {date_text}\n\n"
            f"*Customer:* {customer_name}\n"
        )

        message += (
            "\n*ITEMS*\n"
            "------------------------------\n"
        )

        for item in invoice.items:
            product_name = (
                item.product_name
                or "Product"
            )

            qty = item.quantity or 0

            price = Decimal(
                str(item.price or 0)
            )

            amount = Decimal(
                str(item.amount or 0)
            )

            message += (
                f"{product_name}\n"
                f"{qty} x ₹{price:.2f}"
                f" = ₹{amount:.2f}\n\n"
            )

        message += (
            "------------------------------\n"
            f"*TOTAL: ₹"
            f"{Decimal(str(invoice.total or 0)):.2f}"
            f"*\n\n"
            "Thank you! 🙏"
        )

        encoded_message = quote(message)

        if phone:
            whatsapp_url = (
                f"https://wa.me/{phone}"
                f"?text={encoded_message}"
            )
        else:
            whatsapp_url = (
                "https://wa.me/"
                f"?text={encoded_message}"
            )

        return RedirectResponse(
            whatsapp_url,
            status_code=303
        )

    finally:
        d.close()


# =========================================================
# =========================================================
# LANGUAGE PAGE
# =========================================================

@app.get("/language", response_class=HTMLResponse)
def language_page(request: Request):
    username = login_required(request)
    if not username:
        return RedirectResponse("/login", status_code=303)
    return templates.TemplateResponse(
        request=request,
        name="language.html",
        context={"username": username}
    )


# HEALTH / STATUS
# =========================================================

@app.get("/health")
def health():
    return {"ok": True, "database": DATABASE_MODE}


@app.get("/api/status")
def api_status(request: Request):
    if not login_required(request):
        return JSONResponse({"error": "unauthorized"}, status_code=401)
    return {"ok": True, "database": DATABASE_MODE}
