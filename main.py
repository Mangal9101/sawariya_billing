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
    DateTime, ForeignKey, Text, func, text
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

DATABASE_URL = os.getenv("DATABASE_URL")

if not DATABASE_URL:
    raise RuntimeError(
        "DATABASE_URL is not set. "
        "Please add PostgreSQL DATABASE_URL in Render Environment."
    )

if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace(
        "postgres://",
        "postgresql://",
        1
    )

engine = create_engine(
    DATABASE_URL,
    pool_pre_ping=True
)

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


# =========================================================
# CREATE TABLES + MIGRATIONS
# =========================================================

Base.metadata.create_all(engine)


def run_migrations():
    with engine.begin() as connection:
        connection.execute(
            text(
                """
                ALTER TABLE invoices
                ADD COLUMN IF NOT EXISTS client_bill_id VARCHAR(100)
                """
            )
        )

        connection.execute(
            text(
                """
                CREATE UNIQUE INDEX IF NOT EXISTS
                ix_invoices_client_bill_id
                ON invoices (client_bill_id)
                """
            )
        )


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
# OFFLINE SYNC / BOOTSTRAP API
# =========================================================
# These endpoints are used by the PWA to move local IndexedDB
# changes to PostgreSQL when the device comes back online.
# =========================================================

@app.get("/api/offline/bootstrap")
def offline_bootstrap(request: Request):
    """Download the current server data needed by an offline device."""
    if not login_required(request):
        return JSONResponse({"error": "unauthorized"}, status_code=401)

    d = db()
    try:
        products = d.query(Product).order_by(Product.id).all()
        customers = d.query(Customer).order_by(Customer.id).all()

        return {
            "ok": True,
            "products": [
                {
                    "id": p.id,
                    "name": p.name,
                    "sku": p.sku or "",
                    "quantity": int(p.quantity or 0),
                    "min_stock": int(p.min_stock or 0),
                    "purchase_price": float(p.purchase_price or 0),
                    "wholesale_price": float(p.wholesale_price or 0),
                    "retailer_price": float(p.retailer_price or 0),
                    "updated_at": None,
                }
                for p in products
            ],
            "customers": [
                {
                    "id": c.id,
                    "name": c.name or "",
                    "phone": c.phone or "",
                    "address": c.address or "",
                }
                for c in customers
            ],
        }
    finally:
        d.close()


@app.post("/api/offline/sync")
async def offline_sync(request: Request):
    """
    Receive queued IndexedDB operations.

    Supported operations:
      - product_add
      - product_update
      - product_delete
      - customer_add
      - bill

    Every operation may contain a local_id so the browser can map its
    local record to the server record returned in `mappings`.
    """
    if not login_required(request):
        return JSONResponse({"error": "unauthorized"}, status_code=401)

    try:
        payload = await request.json()
    except Exception:
        return JSONResponse({"error": "Invalid JSON data"}, status_code=400)

    operations = payload.get("operations", [])
    if not isinstance(operations, list):
        return JSONResponse({"error": "operations must be a list"}, status_code=400)

    d = db()
    results = []
    mappings = []

    def clean_text(value):
        return str(value or "").strip()

    def as_decimal(value):
        try:
            return Decimal(str(value or 0))
        except Exception:
            return Decimal("0")

    try:
        for op in operations:
            if not isinstance(op, dict):
                continue

            op_id = clean_text(op.get("local_id"))
            op_type = clean_text(op.get("type"))
            data = op.get("data") or {}

            if op_type == "product_add":
                name = clean_text(data.get("name"))
                sku = clean_text(data.get("sku"))
                if not name:
                    raise ValueError("Product name cannot be empty")

                existing = d.query(Product).filter(
                    func.lower(Product.name) == name.lower()
                ).first()
                if existing:
                    mappings.append({
                        "local_id": op_id,
                        "entity": "product",
                        "server_id": existing.id,
                        "status": "already_exists",
                    })
                    results.append({"local_id": op_id, "ok": True})
                    continue

                if sku:
                    existing_sku = d.query(Product).filter(
                        func.lower(Product.sku) == sku.lower()
                    ).first()
                    if existing_sku:
                        mappings.append({
                            "local_id": op_id,
                            "entity": "product",
                            "server_id": existing_sku.id,
                            "status": "already_exists",
                        })
                        results.append({"local_id": op_id, "ok": True})
                        continue

                product = Product(
                    name=name,
                    sku=sku or None,
                    quantity=max(int(data.get("quantity", 0) or 0), 0),
                    min_stock=max(int(data.get("min_stock", 5) or 0), 0),
                    purchase_price=max(as_decimal(data.get("purchase_price")), Decimal("0")),
                    wholesale_price=max(as_decimal(data.get("wholesale_price")), Decimal("0")),
                    retailer_price=max(as_decimal(data.get("retailer_price")), Decimal("0")),
                )
                d.add(product)
                d.flush()

                mappings.append({
                    "local_id": op_id,
                    "entity": "product",
                    "server_id": product.id,
                    "status": "created",
                })
                results.append({"local_id": op_id, "ok": True})

            elif op_type == "product_update":
                server_id = int(data.get("server_id") or data.get("id"))
                product = d.get(Product, server_id)
                if not product:
                    raise ValueError("Product not found")

                name = clean_text(data.get("name"))
                sku = clean_text(data.get("sku"))
                if not name:
                    raise ValueError("Product name cannot be empty")

                duplicate_name = d.query(Product).filter(
                    func.lower(Product.name) == name.lower(),
                    Product.id != server_id,
                ).first()
                if duplicate_name:
                    raise ValueError("Product already exists")

                if sku:
                    duplicate_sku = d.query(Product).filter(
                        func.lower(Product.sku) == sku.lower(),
                        Product.id != server_id,
                    ).first()
                    if duplicate_sku:
                        raise ValueError("SKU already exists")

                old_quantity = int(product.quantity or 0)
                new_quantity = max(int(data.get("quantity", 0) or 0), 0)

                product.name = name
                product.sku = sku or None
                product.quantity = new_quantity
                product.min_stock = max(int(data.get("min_stock", 5) or 0), 0)
                product.purchase_price = max(as_decimal(data.get("purchase_price")), Decimal("0"))
                product.wholesale_price = max(as_decimal(data.get("wholesale_price")), Decimal("0"))
                product.retailer_price = max(as_decimal(data.get("retailer_price")), Decimal("0"))

                if old_quantity != new_quantity:
                    d.add(StockMovement(
                        product_id=server_id,
                        movement_type="Adjustment",
                        quantity=new_quantity - old_quantity,
                        note="Offline product edit",
                    ))

                results.append({"local_id": op_id, "ok": True, "server_id": server_id})

            elif op_type == "product_delete":
                server_id = int(data.get("server_id") or data.get("id"))
                product = d.get(Product, server_id)
                if product:
                    used = d.query(InvoiceItem.id).filter(
                        InvoiceItem.product_id == server_id
                    ).first()
                    if used:
                        raise ValueError("Product is already used in an invoice")

                    d.query(StockMovement).filter(
                        StockMovement.product_id == server_id
                    ).delete(synchronize_session=False)
                    d.delete(product)

                results.append({"local_id": op_id, "ok": True, "server_id": server_id})

            elif op_type == "customer_add":
                name = clean_text(data.get("name")) or "Walk-in Customer"
                phone = clean_text(data.get("phone"))
                address = clean_text(data.get("address"))

                customer = Customer(
                    name=name,
                    phone=phone or None,
                    address=address or None,
                )
                d.add(customer)
                d.flush()

                mappings.append({
                    "local_id": op_id,
                    "entity": "customer",
                    "server_id": customer.id,
                    "status": "created",
                })
                results.append({"local_id": op_id, "ok": True})

            elif op_type == "bill":
                # Bill payload follows the same shape as /billing/save.
                bill = data
                client_bill_id = clean_text(bill.get("client_bill_id"))

                if client_bill_id:
                    existing_invoice = d.query(Invoice).filter(
                        Invoice.client_bill_id == client_bill_id
                    ).first()
                    if existing_invoice:
                        results.append({
                            "local_id": op_id,
                            "ok": True,
                            "already_saved": True,
                            "server_id": existing_invoice.id,
                            "invoice_no": existing_invoice.invoice_no,
                        })
                        continue

                items = bill.get("items") or []
                if not items:
                    raise ValueError("No products selected")

                discount = max(as_decimal(bill.get("discount")), Decimal("0"))
                paid = max(as_decimal(bill.get("paid")), Decimal("0"))
                payment = clean_text(bill.get("payment_mode")) or "Cash"

                subtotal = Decimal("0")
                clean_items = []

                for item in items:
                    product_id = int(item.get("product_id"))
                    qty = int(item.get("quantity"))
                    product = d.get(Product, product_id)
                    if not product:
                        raise ValueError(f"Invalid product: {product_id}")
                    if qty <= 0:
                        raise ValueError("Invalid quantity")

                    available = int(product.quantity or 0)
                    if available < qty:
                        raise ValueError(
                            f"Insufficient stock: {product.name} ({available} available)"
                        )

                    price = max(as_decimal(product.wholesale_price), Decimal("0"))
                    amount = price * qty
                    subtotal += amount
                    clean_items.append((product, qty, price, amount))

                discount = min(discount, subtotal)
                total = subtotal - discount
                paid = min(paid, total)
                due = total - paid

                customer_data = bill.get("customer") or {}
                customer_id = None
                customer_name = clean_text(customer_data.get("name"))
                customer_phone = clean_text(customer_data.get("phone"))
                customer_address = clean_text(customer_data.get("address"))

                if customer_name or customer_phone or customer_address:
                    customer = Customer(
                        name=customer_name or "Walk-in Customer",
                        phone=customer_phone or None,
                        address=customer_address or None,
                    )
                    d.add(customer)
                    d.flush()
                    customer_id = customer.id

                invoice_no = "INV-" + datetime.utcnow().strftime("%Y%m%d%H%M%S%f")[:-3]
                invoice = Invoice(
                    invoice_no=invoice_no,
                    client_bill_id=client_bill_id or None,
                    customer_id=customer_id,
                    subtotal=subtotal,
                    discount=discount,
                    total=total,
                    payment_mode=payment,
                    paid=paid,
                    due=due,
                )
                d.add(invoice)
                d.flush()

                for product, qty, price, amount in clean_items:
                    product.quantity = int(product.quantity or 0) - qty
                    d.add(InvoiceItem(
                        invoice_id=invoice.id,
                        product_id=product.id,
                        product_name=product.name,
                        quantity=qty,
                        price=price,
                        amount=amount,
                    ))
                    d.add(StockMovement(
                        product_id=product.id,
                        movement_type="Sale",
                        quantity=-qty,
                        note=invoice_no,
                    ))

                results.append({
                    "local_id": op_id,
                    "ok": True,
                    "already_saved": False,
                    "server_id": invoice.id,
                    "invoice_no": invoice_no,
                    "total": float(total),
                    "due": float(due),
                })

            else:
                raise ValueError(f"Unsupported sync operation: {op_type}")

        d.commit()
        return {
            "ok": True,
            "results": results,
            "mappings": mappings,
        }

    except IntegrityError:
        d.rollback()
        return JSONResponse(
            {"ok": False, "error": "Duplicate or conflicting data", "results": results},
            status_code=409,
        )
    except Exception as e:
        d.rollback()
        return JSONResponse(
            {"ok": False, "error": str(e), "results": results},
            status_code=400,
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