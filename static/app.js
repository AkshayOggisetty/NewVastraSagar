// ═══════════════════════════════════════════════════════════
// VASTRA SAGAR — Frontend Logic
// ═══════════════════════════════════════════════════════════

const API = '';
let profitChart = null;
let currentPage = 1;
let currentReportView = 'daily';

// ─── INIT ────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    initTabs();
    initForm();
    initFilters();
    initReports();
    loadDashboard();
    setDefaultDate();
});

// ─── TAB SWITCHING ───────────────────────────────────────
function initTabs() {
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const tabId = btn.dataset.tab;

            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

            btn.classList.add('active');
            const section = document.getElementById(tabId);
            section.classList.add('active');

            // Reload data when switching tabs
            if (tabId === 'dashboard') loadDashboard();
            else if (tabId === 'records') loadRecords();
            else if (tabId === 'reports') loadProfitReport();
        });
    });
}

// ─── SET DEFAULT DATE ────────────────────────────────────
function setDefaultDate() {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    document.getElementById('entryDate').value = `${yyyy}-${mm}-${dd}`;
}

// ─── FORM HANDLING ───────────────────────────────────────
function initForm() {
    const form = document.getElementById('entryForm');

    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const data = {
            item_name: document.getElementById('itemName').value.trim(),
            category: document.getElementById('category').value,
            quantity: parseInt(document.getElementById('quantity').value) || 1,
            cost_price: parseFloat(document.getElementById('costPrice').value) || 0,
            selling_price: parseFloat(document.getElementById('sellingPrice').value) || 0,
            date: document.getElementById('entryDate').value,
            customer_name: document.getElementById('customerName').value.trim() || 'Walk-in',
            payment_mode: document.getElementById('paymentMode').value,
        };

        if (!data.item_name) {
            showToast('Please enter an item name', true);
            return;
        }

        try {
            const res = await fetch(`${API}/api/entries`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data),
            });

            const result = await res.json();
            if (res.ok) {
                showToast('✅ Entry added successfully!');
                form.reset();
                setDefaultDate();
                document.getElementById('quantity').value = '1';
            } else {
                showToast(result.error || 'Failed to add entry', true);
            }
        } catch (err) {
            showToast('Network error. Please try again.', true);
        }
    });

    document.getElementById('clearBtn').addEventListener('click', () => {
        setDefaultDate();
        document.getElementById('quantity').value = '1';
    });
}

// ─── DASHBOARD ───────────────────────────────────────────
async function loadDashboard() {
    try {
        const res = await fetch(`${API}/api/reports/summary`);
        const data = await res.json();

        document.getElementById('todaySales').textContent = data.today.sales;
        document.getElementById('todayRevenue').textContent = `₹${data.today.revenue.toLocaleString('en-IN')}`;
        document.getElementById('todayProfit').textContent = `₹${data.today.profit.toLocaleString('en-IN')}`;
        document.getElementById('totalProfit').textContent = `₹${data.overall.profit.toLocaleString('en-IN')}`;

        // Recent entries
        const tbody = document.getElementById('recentBody');
        if (data.recent_entries.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="empty-msg">No entries yet. Add your first sale!</td></tr>';
        } else {
            tbody.innerHTML = data.recent_entries.map(e => `
                <tr>
                    <td>${escHtml(e.item_name)}</td>
                    <td>${escHtml(e.category)}</td>
                    <td>${e.quantity}</td>
                    <td>₹${e.selling_price.toLocaleString('en-IN')}</td>
                    <td class="${e.profit >= 0 ? 'profit-positive' : 'profit-negative'}">₹${e.profit.toLocaleString('en-IN')}</td>
                    <td>${e.date}</td>
                </tr>
            `).join('');
        }
    } catch (err) {
        console.error('Dashboard error:', err);
    }
}

// ─── RECORDS ─────────────────────────────────────────────
function initFilters() {
    document.getElementById('applyFilterBtn').addEventListener('click', () => {
        currentPage = 1;
        loadRecords();
    });

    document.getElementById('searchInput').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            currentPage = 1;
            loadRecords();
        }
    });
}

async function loadRecords(page = currentPage) {
    currentPage = page;
    const search = document.getElementById('searchInput').value.trim();
    const category = document.getElementById('filterCategory').value;
    const dateFrom = document.getElementById('filterDateFrom').value;
    const dateTo = document.getElementById('filterDateTo').value;

    const params = new URLSearchParams({ page, per_page: 20 });
    if (search) params.append('search', search);
    if (category !== 'All') params.append('category', category);
    if (dateFrom) params.append('date_from', dateFrom);
    if (dateTo) params.append('date_to', dateTo);

    try {
        const res = await fetch(`${API}/api/entries?${params}`);
        const data = await res.json();

        const tbody = document.getElementById('recordsBody');
        if (data.entries.length === 0) {
            tbody.innerHTML = '<tr><td colspan="10" class="empty-msg">No records found</td></tr>';
        } else {
            tbody.innerHTML = data.entries.map(e => `
                <tr>
                    <td>${escHtml(e.item_name)}</td>
                    <td>${escHtml(e.category)}</td>
                    <td>${e.quantity}</td>
                    <td>₹${e.cost_price.toLocaleString('en-IN')}</td>
                    <td>₹${e.selling_price.toLocaleString('en-IN')}</td>
                    <td class="${e.profit >= 0 ? 'profit-positive' : 'profit-negative'}">₹${e.profit.toLocaleString('en-IN')}</td>
                    <td>${e.date}</td>
                    <td>${escHtml(e.customer_name)}</td>
                    <td>${escHtml(e.payment_mode)}</td>
                    <td><button class="btn btn-danger" onclick="deleteEntry(${e.id})">Delete</button></td>
                </tr>
            `).join('');
        }

        // Pagination
        renderPagination(data.pages, data.current_page);
    } catch (err) {
        console.error('Records error:', err);
    }
}

function renderPagination(totalPages, current) {
    const container = document.getElementById('paginationControls');
    if (totalPages <= 1) { container.innerHTML = ''; return; }

    let html = '';
    if (current > 1) html += `<button class="page-btn" onclick="loadRecords(${current - 1})">‹ Prev</button>`;

    const start = Math.max(1, current - 2);
    const end = Math.min(totalPages, current + 2);

    for (let i = start; i <= end; i++) {
        html += `<button class="page-btn ${i === current ? 'active' : ''}" onclick="loadRecords(${i})">${i}</button>`;
    }

    if (current < totalPages) html += `<button class="page-btn" onclick="loadRecords(${current + 1})">Next ›</button>`;

    container.innerHTML = html;
}

async function deleteEntry(id) {
    if (!confirm('Are you sure you want to delete this entry?')) return;

    try {
        const res = await fetch(`${API}/api/entries/${id}`, { method: 'DELETE' });
        if (res.ok) {
            showToast('🗑️ Entry deleted');
            loadRecords();
        } else {
            showToast('Failed to delete entry', true);
        }
    } catch (err) {
        showToast('Network error', true);
    }
}

// ─── REPORTS ─────────────────────────────────────────────
function initReports() {
    // Populate year selector
    const yearSelect = document.getElementById('reportYear');
    const currentYear = new Date().getFullYear();
    for (let y = currentYear; y >= currentYear - 5; y--) {
        const opt = document.createElement('option');
        opt.value = y;
        opt.textContent = y;
        yearSelect.appendChild(opt);
    }

    // Set current month
    document.getElementById('reportMonth').value = new Date().getMonth() + 1;

    // Report view buttons
    document.querySelectorAll('.btn-report').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.btn-report').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentReportView = btn.dataset.view;

            // Show/hide month selector
            document.getElementById('reportMonth').style.display =
                currentReportView === 'daily' ? 'inline-block' : 'none';
            document.getElementById('reportYear').style.display =
                currentReportView === 'yearly' ? 'none' : 'inline-block';

            loadProfitReport();
        });
    });

    // Reload on year/month change
    yearSelect.addEventListener('change', loadProfitReport);
    document.getElementById('reportMonth').addEventListener('change', loadProfitReport);
}

async function loadProfitReport() {
    const year = document.getElementById('reportYear').value;
    const month = document.getElementById('reportMonth').value;

    const params = new URLSearchParams({ view: currentReportView, year, month });

    try {
        const res = await fetch(`${API}/api/reports/profits?${params}`);
        const data = await res.json();

        const titles = {
            daily: `Daily Profit Report — ${getMonthName(parseInt(month))} ${year}`,
            monthly: `Monthly Profit Report — ${year}`,
            yearly: 'Yearly Profit Report'
        };
        document.getElementById('chartTitle').textContent = titles[currentReportView];

        const periodHeaders = { daily: 'Date', monthly: 'Month', yearly: 'Year' };
        document.getElementById('reportPeriodHeader').textContent = periodHeaders[currentReportView];

        // Build table and chart data
        const entries = Object.entries(data.data);

        // Sort entries
        if (currentReportView === 'daily') {
            entries.sort((a, b) => {
                const [dA, mA, yA] = a[0].split('-').map(Number);
                const [dB, mB, yB] = b[0].split('-').map(Number);
                return new Date(yA, mA - 1, dA) - new Date(yB, mB - 1, dB);
            });
        } else if (currentReportView === 'monthly') {
            entries.sort((a, b) => a[1].month_num - b[1].month_num);
        } else {
            entries.sort((a, b) => parseInt(a[0]) - parseInt(b[0]));
        }

        // Table
        const tbody = document.getElementById('reportBody');
        if (entries.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="empty-msg">No data for this period</td></tr>';
        } else {
            let totalRevenue = 0, totalCost = 0, totalProfit = 0, totalSales = 0;
            tbody.innerHTML = entries.map(([key, val]) => {
                totalRevenue += val.revenue;
                totalCost += val.cost;
                totalProfit += val.profit;
                totalSales += val.sales;
                return `
                    <tr>
                        <td>${key}</td>
                        <td>${val.sales}</td>
                        <td>₹${val.revenue.toLocaleString('en-IN')}</td>
                        <td>₹${val.cost.toLocaleString('en-IN')}</td>
                        <td class="${val.profit >= 0 ? 'profit-positive' : 'profit-negative'}">₹${val.profit.toLocaleString('en-IN')}</td>
                    </tr>
                `;
            }).join('') + `
                <tr style="font-weight:700; border-top:2px solid var(--accent);">
                    <td>Total</td>
                    <td>${totalSales}</td>
                    <td>₹${totalRevenue.toLocaleString('en-IN')}</td>
                    <td>₹${totalCost.toLocaleString('en-IN')}</td>
                    <td class="${totalProfit >= 0 ? 'profit-positive' : 'profit-negative'}">₹${totalProfit.toLocaleString('en-IN')}</td>
                </tr>
            `;
        }

        // Chart
        renderChart(entries);

    } catch (err) {
        console.error('Report error:', err);
    }
}

function renderChart(entries) {
    const ctx = document.getElementById('profitChart').getContext('2d');

    if (profitChart) profitChart.destroy();

    const labels = entries.map(([key]) => key);
    const profitData = entries.map(([, val]) => val.profit);
    const revenueData = entries.map(([, val]) => val.revenue);

    profitChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels,
            datasets: [
                {
                    label: 'Revenue ₹',
                    data: revenueData,
                    backgroundColor: 'rgba(143, 170, 92, 0.3)',
                    borderColor: 'rgba(143, 170, 92, 0.8)',
                    borderWidth: 1,
                    borderRadius: 4,
                    order: 2,
                },
                {
                    label: 'Profit ₹',
                    data: profitData,
                    type: 'line',
                    borderColor: '#6abf69',
                    backgroundColor: 'rgba(106, 191, 105, 0.1)',
                    borderWidth: 2,
                    pointRadius: 4,
                    pointBackgroundColor: '#6abf69',
                    fill: true,
                    tension: 0.3,
                    order: 1,
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    labels: { color: '#a8a496', font: { family: 'Inter' } }
                },
                tooltip: {
                    backgroundColor: '#2a3120',
                    titleColor: '#e8e6df',
                    bodyColor: '#a8a496',
                    borderColor: '#3a4530',
                    borderWidth: 1,
                    callbacks: {
                        label: (ctx) => `${ctx.dataset.label}: ₹${ctx.parsed.y.toLocaleString('en-IN')}`
                    }
                }
            },
            scales: {
                x: {
                    ticks: { color: '#7a7668', font: { family: 'Inter', size: 11 } },
                    grid: { color: 'rgba(58,69,48,0.3)' }
                },
                y: {
                    ticks: {
                        color: '#7a7668',
                        font: { family: 'Inter', size: 11 },
                        callback: (v) => `₹${v.toLocaleString('en-IN')}`
                    },
                    grid: { color: 'rgba(58,69,48,0.3)' }
                }
            }
        }
    });
}

// ─── UTILITIES ───────────────────────────────────────────
function showToast(message, isError = false) {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = `toast show ${isError ? 'error' : ''}`;
    setTimeout(() => { toast.className = 'toast'; }, 3000);
}

function escHtml(text) {
    const div = document.createElement('div');
    div.textContent = text || '';
    return div.innerHTML;
}

function getMonthName(num) {
    const months = ['January', 'February', 'March', 'April', 'May', 'June',
                    'July', 'August', 'September', 'October', 'November', 'December'];
    return months[num - 1] || '';
}
