import os
from datetime import datetime, date
from flask import Flask, jsonify, request, send_from_directory
from flask_sqlalchemy import SQLAlchemy
from flask_migrate import Migrate
from dotenv import load_dotenv
from sqlalchemy import func, extract

load_dotenv()

app = Flask(__name__, static_folder='static', static_url_path='')

# Database config
database_url = os.environ.get('DATABASE_URL', 'sqlite:///vastrasagar.db')
# Fix for Render PostgreSQL URL (postgres:// -> postgresql://)
if database_url.startswith('postgres://'):
    database_url = database_url.replace('postgres://', 'postgresql://', 1)

app.config['SQLALCHEMY_DATABASE_URI'] = database_url
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', 'vastrasagar-secret-key-2026')

db = SQLAlchemy(app)
migrate = Migrate(app, db)

# ─── CATEGORIES ───────────────────────────────────────────────
CATEGORIES = [
    'Shirt', 'Pant', 'Short', 'Vest', 'Brief',
    'Kids Wear', 'Pancha', 'Suits', 'Women Dresses', 'Other'
]

PAYMENT_MODES = ['UPI', 'Cash', 'Card', 'Other']


# ─── MODEL ────────────────────────────────────────────────────
class SaleEntry(db.Model):
    __tablename__ = 'sale_entries'

    id = db.Column(db.Integer, primary_key=True)
    item_name = db.Column(db.String(200), nullable=False)
    category = db.Column(db.String(50), nullable=False, default='Other')
    quantity = db.Column(db.Integer, nullable=False, default=1)
    cost_price = db.Column(db.Float, nullable=False, default=0.0)
    selling_price = db.Column(db.Float, nullable=False, default=0.0)
    date = db.Column(db.Date, nullable=False, default=date.today)
    customer_name = db.Column(db.String(200), default='Walk-in')
    payment_mode = db.Column(db.String(20), default='UPI')
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'item_name': self.item_name,
            'category': self.category,
            'quantity': self.quantity,
            'cost_price': self.cost_price,
            'selling_price': self.selling_price,
            'profit': round((self.selling_price - self.cost_price) * self.quantity, 2),
            'date': self.date.strftime('%d-%m-%Y'),
            'customer_name': self.customer_name,
            'payment_mode': self.payment_mode,
        }


# ─── SERVE FRONTEND ──────────────────────────────────────────
@app.route('/', defaults={'path': ''})
@app.route('/<path:path>')
def serve(path):
    if path != "" and os.path.exists(os.path.join(app.static_folder, path)):
        return send_from_directory(app.static_folder, path)
    else:
        return send_from_directory(app.static_folder, 'index.html')


# ─── API: CATEGORIES & PAYMENT MODES ─────────────────────────
@app.route('/api/categories')
def get_categories():
    return jsonify(CATEGORIES)


@app.route('/api/payment-modes')
def get_payment_modes():
    return jsonify(PAYMENT_MODES)


# ─── API: ENTRIES CRUD ───────────────────────────────────────
@app.route('/api/entries', methods=['GET'])
def get_entries():
    page = request.args.get('page', 1, type=int)
    per_page = request.args.get('per_page', 50, type=int)
    date_from = request.args.get('date_from')
    date_to = request.args.get('date_to')
    category = request.args.get('category')
    search = request.args.get('search')

    query = SaleEntry.query

    if date_from:
        query = query.filter(SaleEntry.date >= datetime.strptime(date_from, '%Y-%m-%d').date())
    if date_to:
        query = query.filter(SaleEntry.date <= datetime.strptime(date_to, '%Y-%m-%d').date())
    if category and category != 'All':
        query = query.filter(SaleEntry.category == category)
    if search:
        query = query.filter(
            db.or_(
                SaleEntry.item_name.ilike(f'%{search}%'),
                SaleEntry.customer_name.ilike(f'%{search}%')
            )
        )

    query = query.order_by(SaleEntry.date.desc(), SaleEntry.created_at.desc())
    paginated = query.paginate(page=page, per_page=per_page, error_out=False)

    return jsonify({
        'entries': [e.to_dict() for e in paginated.items],
        'total': paginated.total,
        'pages': paginated.pages,
        'current_page': paginated.page,
    })


@app.route('/api/entries', methods=['POST'])
def create_entry():
    data = request.get_json()

    if not data.get('item_name'):
        return jsonify({'error': 'Item name is required'}), 400

    entry = SaleEntry(
        item_name=data['item_name'],
        category=data.get('category', 'Other'),
        quantity=int(data.get('quantity', 1)),
        cost_price=float(data.get('cost_price', 0)),
        selling_price=float(data.get('selling_price', 0)),
        date=datetime.strptime(data.get('date', date.today().strftime('%Y-%m-%d')), '%Y-%m-%d').date(),
        customer_name=data.get('customer_name', 'Walk-in') or 'Walk-in',
        payment_mode=data.get('payment_mode', 'UPI'),
    )

    db.session.add(entry)
    db.session.commit()

    return jsonify({'message': 'Entry added successfully', 'entry': entry.to_dict()}), 201


@app.route('/api/entries/<int:entry_id>', methods=['DELETE'])
def delete_entry(entry_id):
    entry = SaleEntry.query.get_or_404(entry_id)
    db.session.delete(entry)
    db.session.commit()
    return jsonify({'message': 'Entry deleted successfully'})


# ─── API: DASHBOARD SUMMARY ──────────────────────────────────
@app.route('/api/reports/summary')
def dashboard_summary():
    today = date.today()

    # Today's stats
    today_entries = SaleEntry.query.filter(SaleEntry.date == today).all()
    today_revenue = sum(e.selling_price * e.quantity for e in today_entries)
    today_cost = sum(e.cost_price * e.quantity for e in today_entries)
    today_profit = round(today_revenue - today_cost, 2)
    today_sales = len(today_entries)

    # Overall stats
    all_entries = SaleEntry.query.all()
    total_revenue = sum(e.selling_price * e.quantity for e in all_entries)
    total_cost = sum(e.cost_price * e.quantity for e in all_entries)
    total_profit = round(total_revenue - total_cost, 2)
    total_sales = len(all_entries)

    # Recent 5 entries
    recent = SaleEntry.query.order_by(SaleEntry.date.desc(), SaleEntry.created_at.desc()).limit(5).all()

    return jsonify({
        'today': {
            'sales': today_sales,
            'revenue': round(today_revenue, 2),
            'profit': today_profit,
        },
        'overall': {
            'sales': total_sales,
            'revenue': round(total_revenue, 2),
            'profit': total_profit,
        },
        'recent_entries': [e.to_dict() for e in recent],
    })


# ─── API: PROFIT REPORTS ─────────────────────────────────────
@app.route('/api/reports/profits')
def profit_reports():
    view = request.args.get('view', 'daily')  # daily, monthly, yearly
    year = request.args.get('year', date.today().year, type=int)
    month = request.args.get('month', date.today().month, type=int)

    if view == 'daily':
        # Day-wise for a given month
        entries = SaleEntry.query.filter(
            extract('year', SaleEntry.date) == year,
            extract('month', SaleEntry.date) == month
        ).all()

        daily_data = {}
        for e in entries:
            day_key = e.date.strftime('%d-%m-%Y')
            if day_key not in daily_data:
                daily_data[day_key] = {'revenue': 0, 'cost': 0, 'profit': 0, 'sales': 0}
            daily_data[day_key]['revenue'] += e.selling_price * e.quantity
            daily_data[day_key]['cost'] += e.cost_price * e.quantity
            daily_data[day_key]['profit'] += (e.selling_price - e.cost_price) * e.quantity
            daily_data[day_key]['sales'] += 1

        # Round values
        for k in daily_data:
            daily_data[k] = {key: round(val, 2) for key, val in daily_data[k].items()}

        return jsonify({'view': 'daily', 'year': year, 'month': month, 'data': daily_data})

    elif view == 'monthly':
        # Month-wise for a given year
        entries = SaleEntry.query.filter(
            extract('year', SaleEntry.date) == year
        ).all()

        monthly_data = {}
        month_names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                       'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

        for e in entries:
            m = e.date.month
            m_key = month_names[m - 1]
            if m_key not in monthly_data:
                monthly_data[m_key] = {'revenue': 0, 'cost': 0, 'profit': 0, 'sales': 0, 'month_num': m}
            monthly_data[m_key]['revenue'] += e.selling_price * e.quantity
            monthly_data[m_key]['cost'] += e.cost_price * e.quantity
            monthly_data[m_key]['profit'] += (e.selling_price - e.cost_price) * e.quantity
            monthly_data[m_key]['sales'] += 1

        for k in monthly_data:
            monthly_data[k] = {key: round(val, 2) if isinstance(val, float) else val for key, val in monthly_data[k].items()}

        return jsonify({'view': 'monthly', 'year': year, 'data': monthly_data})

    elif view == 'yearly':
        entries = SaleEntry.query.all()

        yearly_data = {}
        for e in entries:
            y_key = str(e.date.year)
            if y_key not in yearly_data:
                yearly_data[y_key] = {'revenue': 0, 'cost': 0, 'profit': 0, 'sales': 0}
            yearly_data[y_key]['revenue'] += e.selling_price * e.quantity
            yearly_data[y_key]['cost'] += e.cost_price * e.quantity
            yearly_data[y_key]['profit'] += (e.selling_price - e.cost_price) * e.quantity
            yearly_data[y_key]['sales'] += 1

        for k in yearly_data:
            yearly_data[k] = {key: round(val, 2) for key, val in yearly_data[k].items()}

        return jsonify({'view': 'yearly', 'data': yearly_data})

    return jsonify({'error': 'Invalid view parameter'}), 400


# ─── INIT DB ─────────────────────────────────────────────────
with app.app_context():
    db.create_all()


if __name__ == '__main__':
    app.run(debug=True, port=5000)
