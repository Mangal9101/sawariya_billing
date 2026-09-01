import os
from datetime import datetime, timezone, timedelta
from decimal import Decimal
from urllib.parse import quote

from fastapi import FastAPI, Request, Form
from fastapi.responses import (
    HTMLResponse,
    RedirectResponse,
    JSONResponse,
    FileResponse
)
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates

from starlette.middleware.sessions import SessionMiddleware

from sqlalchemy import (
    create_engine,
    Column,
    Integer,
    String,
    Numeric,
    DateTime,
    ForeignKey,
    Text,
    func,
)

from sqlalchemy.orm import (
    declarative_base,
    sessionmaker,
    relationship,
    joinedload,
)

from sqlalchemy.exc import IntegrityError


# =========================================================
# INDIA TIMEZONE
# =========================================================

IST = timezone(
    timedelta(hours=5, minutes=30)
)


def utc_to_ist(dt):

    if not dt:
        return dt

    if dt.tzinfo is None:
        dt = dt.replace(
            tzinfo=timezone.utc
        )

    return dt.astimezone(IST)


def ist_day_to_utc_range(selected_date):

    start_ist = datetime.combine(
        selected_date,
        datetime.min.time()
    ).replace(
        tzinfo=IST
    )

    end_ist = start_ist + timedelta(
        days=1
    )

    start_utc = start_ist.astimezone(
        timezone.utc
    ).replace(
        tzinfo=None
    )

    end_utc = end_ist.astimezone(
        timezone.utc
    ).replace(
        tzinfo=None
    )

    return start_utc, end_utc


# =========================================================
# DATABASE
# =========================================================

# Online (Render): PostgreSQL via DATABASE_URL
# Offline/local: SQLite file next to this application.
#
# This is intentionally automatic:
# - DATABASE_URL present  -> PostgreSQL
# - DATABASE_URL missing  -> local SQLite
#
# Therefore the same FastAPI routes, templates and business logic work
# in both environments. The two databases are separate unless you add
# an explicit sync/import process.

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

DATABASE_URL = os.getenv("DATABASE_URL", "").strip()

if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

if DATABASE_URL:
    # Render/online database
    engine = create_engine(
        DATABASE_URL,
        pool_pre_ping=True,
        future=True
    )
    DATABASE_MODE = "PostgreSQL (online)"
else:
    # Local/offline database
    sqlite_path = os.getenv(
        "OFFLINE_DB_PATH",
        os.path.join(BASE_DIR, "sawariya_billing.db")
    )

    engine = create_engine(
        f"sqlite:///{sqlite_path}",
        connect_args={"check_same_thread": False},
        future=True
    )
    DATABASE_MODE = "SQLite (offline/local)"

    # SQLite does not enforce foreign keys by default.
    from sqlalchemy import event

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

    id = Column(
        Integer,
        primary_key=True
    )

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

    id = Column(
        Integer,
        primary_key=True
    )

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

    id = Column(
        Integer,
        primary_key=True
    )

    invoice_no = Column(
        String(50),
        unique=True,
        nullable=False
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

    customer = relationship(
        "Customer"
    )

    items = relationship(
        "InvoiceItem",
        cascade="all, delete-orphan"
    )


class InvoiceItem(Base):

    __tablename__ = "invoice_items"

    id = Column(
        Integer,
        primary_key=True
    )

    invoice_id = Column(
        Integer,
        ForeignKey("invoices.id")
    )

    product_id = Column(
        Integer,
        ForeignKey("products.id"),
        nullable=True
    )

    product_name = Column(
        String(150)
    )

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

    product = relationship(
        "Product"
    )


class Purchase(Base):

    __tablename__ = "purchases"

    id = Column(
        Integer,
        primary_key=True
    )

    supplier = Column(
        String(150)
    )

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

    id = Column(
        Integer,
        primary_key=True
    )

    product_id = Column(
        Integer,
        ForeignKey("products.id")
    )

    movement_type = Column(
        String(30)
    )

    quantity = Column(
        Integer
    )

    note = Column(
        String(250)
    )

    created_at = Column(
        DateTime,
        default=datetime.utcnow
    )

    product = relationship(
        "Product"
    )


# =========================================================
# CREATE TABLES
# =========================================================

Base.metadata.create_all(
    engine
)


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
    StaticFiles(
        directory=os.path.join(BASE_DIR, "static")
    ),
    name="static"
)

# =========================================================
# PWA FILES
# =========================================================

@app.get("/manifest.json")
def manifest():

    return FileResponse(
        os.path.join(BASE_DIR, "static", "manifest.json"),
        media_type="application/manifest+json"
    )


@app.get("/service-worker.js")
def service_worker():

    return FileResponse(
        os.path.join(
            BASE_DIR,
            "static",
            "service-worker.js"
        ),
        media_type="application/javascript",
        headers={
            "Cache-Control":
                "no-cache, no-store, must-revalidate",

            "Pragma":
                "no-cache",

            "Expires":
                "0",

            "Service-Worker-Allowed":
                "/"
        }
    )

# =========================================================
# TEMPLATES
# =========================================================

templates = Jinja2Templates(
    directory=os.path.join(BASE_DIR, "templates")
)


templates.env.filters[
    "ist_time"
] = utc_to_ist

def ist_time_text(dt):
    value = utc_to_ist(dt)
    return value.strftime("%d-%m-%Y %H:%M") if value else ""

templates.env.filters[
    "ist_time_text"
] = ist_time_text


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


def login_required(
    request: Request
):
    return request.session.get(
        "username"
    )


def money(value):
    return float(
        value or 0
    )


# =========================================================
# HOME
# =========================================================

@app.get(
    "/",
    response_class=HTMLResponse
)
def home(
    request: Request
):

    if not login_required(
        request
    ):
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

@app.get(
    "/login",
    response_class=HTMLResponse
)
def login_page(
    request: Request
):

    return templates.TemplateResponse(
        request=request,
        name="login.html",
        context={}
    )


# =========================================================
# LOGIN
# =========================================================

@app.post(
    "/login",
    response_class=HTMLResponse
)
def login(
    request: Request,
    username: str = Form(...),
    password: str = Form(...)
):

    if USERS.get(
        username
    ) == password:

        request.session.clear()

        request.session[
            "username"
        ] = username

        return RedirectResponse(
            "/dashboard",
            status_code=303
        )

    return templates.TemplateResponse(
        request=request,
        name="login.html",
        context={
            "error":
                "Invalid username or password"
        }
    )


# =========================================================
# LOGOUT
# =========================================================

@app.get(
    "/logout"
)
def logout(
    request: Request
):

    request.session.clear()

    return RedirectResponse(
        "/login",
        status_code=303
    )


# =========================================================
# DASHBOARD
# =========================================================

@app.get(
    "/dashboard",
    response_class=HTMLResponse
)
def dashboard(
    request: Request
):

    username = login_required(
        request
    )

    if not username:
        return RedirectResponse(
            "/login",
            status_code=303
        )

    d = db()

    try:

        today = datetime.now(
            IST
        ).date()

        start_utc, end_utc = (
            ist_day_to_utc_range(
                today
            )
        )

        # TODAY SALES

        sales = (
            d.query(
                func.coalesce(
                    func.sum(
                        Invoice.total
                    ),
                    0
                )
            )
            .filter(
                Invoice.created_at
                >= start_utc
            )
            .filter(
                Invoice.created_at
                < end_utc
            )
            .scalar()
            or 0
        )

        # TODAY BILLS

        bills = (
            d.query(
                func.count(
                    Invoice.id
                )
            )
            .filter(
                Invoice.created_at
                >= start_utc
            )
            .filter(
                Invoice.created_at
                < end_utc
            )
            .scalar()
            or 0
        )

        # TOTAL STOCK

        stock = (
            d.query(
                func.coalesce(
                    func.sum(
                        Product.quantity
                    ),
                    0
                )
            )
            .scalar()
            or 0
        )

        # LOW STOCK

        low = (
            d.query(
                Product
            )
            .filter(
                Product.quantity
                <= Product.min_stock
            )
            .count()
        )

        products = (
            d.query(
                Product
            )
            .order_by(
                Product.name
            )
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

@app.get(
    "/products",
    response_class=HTMLResponse
)
def products_page(
    request: Request
):

    username = login_required(
        request
    )

    if not username:
        return RedirectResponse(
            "/login",
            status_code=303
        )

    d = db()

    try:

        products = (
            d.query(
                Product
            )
            .order_by(
                Product.name
            )
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

@app.post(
    "/products/add"
)
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

    if not login_required(
        request
    ):
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
            d.query(
                Product
            )
            .filter(
                func.lower(
                    Product.name
                )
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
                d.query(
                    Product
                )
                .filter(
                    func.lower(
                        Product.sku
                    )
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
            quantity=max(
                quantity,
                0
            ),
            min_stock=max(
                min_stock,
                0
            ),
            purchase_price=max(
                purchase_price,
                0
            ),
            wholesale_price=max(
                wholesale_price,
                0
            ),
            retailer_price=max(
                retailer_price,
                0
            )
        )

        d.add(
            product
        )

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

    username = login_required(
        request
    )

    if not username:
        return RedirectResponse(
            "/login",
            status_code=303
        )

    d = db()

    try:

        product = d.get(
            Product,
            pid
        )

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

@app.post(
    "/products/{pid}/update"
)
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

    if not login_required(
        request
    ):
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

        product = d.get(
            Product,
            pid
        )

        if not product:

            return RedirectResponse(
                "/products",
                status_code=303
            )

        duplicate_name = (
            d.query(
                Product
            )
            .filter(
                func.lower(
                    Product.name
                )
                == clean_name.lower()
            )
            .filter(
                Product.id != pid
            )
            .first()
        )

        if duplicate_name:

            return RedirectResponse(
                f"/products/{pid}/edit"
                f"?error=product_exists",
                status_code=303
            )

        if clean_sku:

            duplicate_sku = (
                d.query(
                    Product
                )
                .filter(
                    func.lower(
                        Product.sku
                    )
                    == clean_sku.lower()
                )
                .filter(
                    Product.id != pid
                )
                .first()
            )

            if duplicate_sku:

                return RedirectResponse(
                    f"/products/{pid}/edit"
                    f"?error=sku_exists",
                    status_code=303
                )

        old_quantity = (
            product.quantity
            or 0
        )

        new_quantity = max(
            quantity,
            0
        )

        product.name = clean_name

        product.sku = (
            clean_sku
            or None
        )

        product.quantity = new_quantity

        product.min_stock = max(
            min_stock,
            0
        )

        product.purchase_price = max(
            purchase_price,
            0
        )

        product.wholesale_price = max(
            wholesale_price,
            0
        )

        product.retailer_price = max(
            retailer_price,
            0
        )

        if old_quantity != new_quantity:

            difference = (
                new_quantity
                - old_quantity
            )

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
            f"/products/{pid}/edit"
            f"?error=duplicate",
            status_code=303
        )

    except Exception:

        d.rollback()

        return RedirectResponse(
            f"/products/{pid}/edit"
            f"?error=server",
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

@app.post(
    "/products/{pid}/delete"
)
def delete_product(
    request: Request,
    pid: int
):

    if not login_required(
        request
    ):
        return RedirectResponse(
            "/login",
            status_code=303
        )

    d = db()

    try:

        product = d.get(
            Product,
            pid
        )

        if not product:

            return RedirectResponse(
                "/products",
                status_code=303
            )

        invoice_item_exists = (
            d.query(
                InvoiceItem.id
            )
            .filter(
                InvoiceItem.product_id
                == pid
            )
            .first()
        )

        if invoice_item_exists:

            return RedirectResponse(
                "/products?error=used_in_invoice",
                status_code=303
            )

        d.query(
            StockMovement
        ).filter(
            StockMovement.product_id
            == pid
        ).delete(
            synchronize_session=False
        )

        d.delete(
            product
        )

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
# =========================================================

@app.get(
    "/api/products"
)
def api_products(
    request: Request,
    q: str = ""
):

    if not login_required(
        request
    ):

        return JSONResponse(
            {
                "error":
                    "unauthorized"
            },
            status_code=401
        )

    d = db()

    try:

        products = (
            d.query(
                Product
            )
            .filter(
                Product.name.ilike(
                    f"%{q.strip()}%"
                )
            )
            .order_by(
                Product.name
            )
            .limit(30)
            .all()
        )

        output = []

        for product in products:

            output.append(
                {
                    "id":
                        product.id,

                    "name":
                        product.name,

                    "stock":
                        product.quantity
                        or 0,

                    "purchase":
                        money(
                            product.purchase_price
                        ),

                    "wholesale":
                        money(
                            product.wholesale_price
                        ),

                    "retail":
                        money(
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

@app.get(
    "/billing",
    response_class=HTMLResponse
)
def billing(
    request: Request
):

    username = login_required(
        request
    )

    if not username:

        return RedirectResponse(
            "/login",
            status_code=303
        )

    d = db()

    try:

        customers = (
            d.query(
                Customer
            )
            .order_by(
                Customer.name
            )
            .all()
        )

        return templates.TemplateResponse(
            request=request,
            name="billing.html",
            context={
                "username": username,
                "customers": customers
            }
        )

    finally:

        d.close()


# =========================================================
# SAVE BILL
# =========================================================

@app.post(
    "/billing/save"
)
async def save_bill(
    request: Request
):

    if not login_required(
        request
    ):

        return JSONResponse(
            {
                "error":
                    "unauthorized"
            },
            status_code=401
        )

    try:

        data = await request.json()

    except Exception:

        return JSONResponse(
            {
                "error":
                    "Invalid JSON data"
            },
            status_code=400
        )

    items = data.get(
        "items",
        []
    )

    if not items:

        return JSONResponse(
            {
                "error":
                    "No products selected"
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
            discount = Decimal(
                "0"
            )

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
            paid = Decimal(
                "0"
            )

    except Exception:

        return JSONResponse(
            {
                "error":
                    "Invalid billing values"
            },
            status_code=400
        )

    customer = (
        data.get(
            "customer"
        )
        or {}
    )

    if not isinstance(
        customer,
        dict
    ):
        customer = {}

    d = db()

    subtotal = Decimal(
        "0"
    )

    clean = []

    try:

        # PRODUCTS
        #
        # Aggregate duplicate product lines before checking stock. This
        # prevents a cart containing the same product twice from selling
        # more units than are actually available.

        requested = {}

        for item in items:
            try:
                product_id = int(item.get("product_id"))
                qty = int(item.get("quantity"))
            except (TypeError, ValueError):
                raise ValueError("Invalid product or quantity")

            if qty <= 0:
                raise ValueError("Invalid quantity")

            requested[product_id] = requested.get(product_id, 0) + qty

        for product_id, qty in requested.items():

            product = d.get(Product, product_id)

            if not product:
                raise ValueError("Invalid product")

            available_stock = int(product.quantity or 0)

            if available_stock < qty:
                raise ValueError(
                    f"Insufficient stock: {product.name} "
                    f"({available_stock} available, {qty} requested)"
                )

            price = Decimal(str(product.wholesale_price or 0))

            if price < 0:
                price = Decimal("0")

            amount = price * qty
            subtotal += amount

            clean.append((product, qty, price, amount))

        # TOTAL

        if discount > subtotal:
            discount = subtotal

        total = subtotal - discount

        paid = min(paid, total)

        due = total - paid

        # CUSTOMER

        customer_id = None

        customer_name = str(
            customer.get(
                "name"
            )
            or ""
        ).strip()

        customer_phone = str(
            customer.get(
                "phone"
            )
            or ""
        ).strip()

        customer_address = str(
            customer.get(
                "address"
            )
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

            d.add(
                new_customer
            )

            d.flush()

            customer_id = (
                new_customer.id
            )

        # INVOICE NUMBER

        invoice_no = (
            "INV-"
            + datetime.utcnow().strftime(
                "%Y%m%d%H%M%S%f"
            )[:-3]
        )

        # CREATE INVOICE

        invoice = Invoice(
            invoice_no=invoice_no,
            customer_id=customer_id,
            subtotal=subtotal,
            discount=discount,
            total=total,
            payment_mode=payment,
            paid=paid,
            due=due
        )

        d.add(
            invoice
        )

        d.flush()

        # SAVE ITEMS
        # UPDATE STOCK

        for (
            product,
            qty,
            price,
            amount
        ) in clean:

            product.quantity = (
                product.quantity
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

            d.add(
                invoice_item
            )

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
            "invoice_id": invoice.id,
            "invoice_no": invoice_no,
            "total": float(total),
            "due": float(due)
        }

    except Exception as e:

        d.rollback()

        return JSONResponse(
            {
                "error":
                    str(e)
            },
            status_code=400
        )

    finally:

        d.close()


# =========================================================
# CUSTOMERS PAGE
# =========================================================

@app.get(
    "/customers",
    response_class=HTMLResponse
)
def customers(
    request: Request
):

    username = login_required(
        request
    )

    if not username:

        return RedirectResponse(
            "/login",
            status_code=303
        )

    d = db()

    try:

        customers_list = (
            d.query(
                Customer
            )
            .order_by(
                Customer.name
            )
            .all()
        )

        return templates.TemplateResponse(
            request=request,
            name="customers.html",
            context={
                "customers":
                    customers_list,
                "username":
                    username
            }
        )

    finally:

        d.close()


# =========================================================
# ADD CUSTOMER
# =========================================================

@app.post(
    "/customers/add"
)
def add_customer(
    request: Request,
    name: str = Form(""),
    phone: str = Form(""),
    address: str = Form("")
):

    if not login_required(
        request
    ):

        return RedirectResponse(
            "/login",
            status_code=303
        )

    d = db()

    try:

        d.add(
            Customer(
                name=name.strip()
                or None,

                phone=phone.strip()
                or None,

                address=address.strip()
                or None
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
        "/customers",
        status_code=303
    )


# =========================================================
# STOCK PAGE
# =========================================================

@app.get(
    "/stock",
    response_class=HTMLResponse
)
def stock(
    request: Request
):

    username = login_required(
        request
    )

    if not username:

        return RedirectResponse(
            "/login",
            status_code=303
        )

    d = db()

    try:

        products = (
            d.query(
                Product
            )
            .order_by(
                Product.name
            )
            .all()
        )

        return templates.TemplateResponse(
            request=request,
            name="stock.html",
            context={
                "products":
                    products,
                "username":
                    username
            }
        )

    finally:

        d.close()


# =========================================================
# REPORTS
# =========================================================

@app.get(
    "/reports",
    response_class=HTMLResponse
)
def reports(
    request: Request,
    date: str = ""
):

    username = login_required(
        request
    )

    if not username:

        return RedirectResponse(
            "/login",
            status_code=303
        )

    report_date = (
        date
        or datetime.now(
            IST
        ).strftime(
            "%Y-%m-%d"
        )
    )

    try:

        selected = datetime.strptime(
            report_date,
            "%Y-%m-%d"
        ).date()

    except ValueError:

        selected = datetime.now(
            IST
        ).date()

        report_date = selected.strftime(
            "%Y-%m-%d"
        )

    start_utc, end_utc = (
        ist_day_to_utc_range(
            selected
        )
    )

    d = db()

    try:

        invoices = (
            d.query(
                Invoice
            )
            .options(
                joinedload(
                    Invoice.customer
                ),
                joinedload(
                    Invoice.items
                ).joinedload(
                    InvoiceItem.product
                )
            )
            .filter(
                Invoice.created_at
                >= start_utc
            )
            .filter(
                Invoice.created_at
                < end_utc
            )
            .order_by(
                Invoice.created_at.desc()
            )
            .all()
        )

        sales = Decimal(
            "0"
        )

        paid = Decimal(
            "0"
        )

        due = Decimal(
            "0"
        )

        net_profit = Decimal(
            "0"
        )

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

            invoice_profit = Decimal(
                "0"
            )

            for item in invoice.items:

                selling_price = Decimal(
                    str(
                        item.price
                        or 0
                    )
                )

                purchase_price = Decimal(
                    "0"
                )

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

                invoice_profit += (
                    item_profit
                )

            discount = Decimal(
                str(
                    invoice.discount
                    or 0
                )
            )

            invoice_profit -= (
                discount
            )

            if invoice_profit < 0:

                invoice_profit = Decimal(
                    "0"
                )

            invoice.net_profit = (
                invoice_profit
            )

            net_profit += (
                invoice_profit
            )

        summary = {
            "bills":
                len(invoices),

            "sales":
                sales,

            "paid":
                paid,

            "due":
                due,

            "net_profit":
                net_profit
        }

        return templates.TemplateResponse(
            request=request,
            name="reports.html",
            context={
                "invoices":
                    invoices,

                "username":
                    username,

                "report_date":
                    report_date,

                "summary":
                    summary
            }
        )

    finally:

        d.close()


# =========================================================
# PRINT / VIEW INVOICE
# =========================================================

@app.get(
    "/invoice/{invoice_id}",
    response_class=HTMLResponse
)
def view_invoice(
    request: Request,
    invoice_id: int
):
    if not login_required(request):
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
            context={
                "invoice": invoice,
                "username": request.session.get("username")
            }
        )
    finally:
        d.close()


# =========================================================
# SHARE INVOICE ON WHATSAPP
# =========================================================

@app.get(
    "/invoice/{invoice_id}/whatsapp"
)
def share_invoice_whatsapp(
    request: Request,
    invoice_id: int
):

    if not login_required(
        request
    ):

        return RedirectResponse(
            "/login",
            status_code=303
        )

    d = db()

    try:

        invoice = (
            d.query(
                Invoice
            )
            .options(
                joinedload(
                    Invoice.customer
                ),
                joinedload(
                    Invoice.items
                )
            )
            .filter(
                Invoice.id
                == invoice_id
            )
            .first()
        )

        if not invoice:

            return RedirectResponse(
                "/reports",
                status_code=303
            )

        # CUSTOMER PHONE

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

        if (
            phone
            and len(phone) == 10
        ):

            phone = (
                "91"
                + phone
            )

        # CUSTOMER NAME

        customer_name = (
            "Walk-in Customer"
        )

        if (
            invoice.customer
            and invoice.customer.name
        ):

            customer_name = (
                invoice.customer.name
            )

        # DATE

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

        # MESSAGE

        message = (
            "🧾 *SAWARIYA CONFECTIONARY*\n"
            "------------------------------\n\n"
            f"*Invoice:* "
            f"{invoice.invoice_no}\n"
            f"*Date:* "
            f"{date_text}\n\n"
            f"*Customer:* "
            f"{customer_name}\n"
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

            qty = (
                item.quantity
                or 0
            )

            price = Decimal(
                str(
                    item.price
                    or 0
                )
            )

            amount = Decimal(
                str(
                    item.amount
                    or 0
                )
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

        encoded_message = quote(
            message
        )

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