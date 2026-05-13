// Ganti dengan URL backend Render.com kamu
const API_BASE = 'https://YOUR-APP.onrender.com';

let allReviews = [];

async function startScrape() {
    const url = document.getElementById('urlInput').value.trim();
    const btn = document.getElementById('scrapeBtn');
    const btnText = document.getElementById('btnText');
    const btnLoader = document.getElementById('btnLoader');
    const errorBox = document.getElementById('errorBox');
    const results = document.getElementById('results');

    if (!url) { showError('Masukkan URL produk Shopee terlebih dahulu!'); return; }

    // Loading state
    btn.disabled = true;
    btnText.classList.add('hidden');
    btnLoader.classList.remove('hidden');
    errorBox.classList.add('hidden');
    results.classList.add('hidden');

    showLoading();

    try {
        const res = await fetch(`${API_BASE}/api/scrape`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url }),
        });

        const json = await res.json();
        if (!res.ok || !json.success) throw new Error(json.error || 'Terjadi kesalahan');

        allReviews = json.data.reviews;
        renderResults(json.data);
        results.classList.remove('hidden');

    } catch (err) {
        showError('❌ ' + (err.message || 'Gagal mengambil data. Coba lagi.'));
    } finally {
        btn.disabled = false;
        btnText.classList.remove('hidden');
        btnLoader.classList.add('hidden');
    }
}

function showLoading() {
    const results = document.getElementById('results');
    results.innerHTML = `
    <div class="card loading-box">
      <div class="loading-spinner">🛍️</div>
      <div class="loading-text">Mengambil data review dari Shopee...<br><small>Proses ini membutuhkan 10–20 detik</small></div>
    </div>`;
    results.classList.remove('hidden');
}

function showError(msg) {
    const box = document.getElementById('errorBox');
    box.textContent = msg;
    box.classList.remove('hidden');
}

function renderResults(data) {
    const { product, reviews, stats } = data;
    const results = document.getElementById('results');

    results.innerHTML = `
    <div class="card product-card" id="productCard"></div>
    <div class="card stats-card" id="statsCard"></div>
    <div class="card keywords-card" id="keywordsCard"></div>
    <div class="card reviews-card">
      <div class="card-header">
        <h2>💬 Daftar Review</h2>
        <div class="filter-row" id="filterRow"></div>
      </div>
      <div id="reviewsList"></div>
    </div>`;

    renderProduct(product);
    renderStats(stats, product);
    renderKeywords(stats?.keywords);
    renderFilterButtons();
    renderReviews(reviews);
}

function renderProduct(p) {
    if (!p) return;
    const el = document.getElementById('productCard');
    const priceStr = p.priceMax ? `${p.price} – ${p.priceMax}` : p.price;
    const imgs = (p.images || []).map(src => `<img src="${src}" alt="produk" onerror="this.style.display='none'">`).join('');

    el.innerHTML = `
    ${imgs ? `<div class="product-images">${imgs}</div>` : ''}
    <div class="product-info">
      <h2>${escHtml(p.name)}</h2>
      <div class="product-meta">
        <span class="badge badge-price">💰 ${priceStr}</span>
        <span class="badge badge-rating">⭐ ${p.rating} (${Number(p.totalRating).toLocaleString('id')} ulasan)</span>
        <span class="badge badge-sold">✅ ${Number(p.totalSold).toLocaleString('id')} terjual</span>
        <span class="badge badge-shop">🏪 ${escHtml(p.shopName)}</span>
      </div>
      ${p.category ? `<div class="product-category">📂 ${escHtml(p.category)}</div>` : ''}
      <p class="product-desc" style="margin-top:10px">${escHtml(p.description || '')}</p>
    </div>`;
}

function renderStats(stats, product) {
    if (!stats) return;
    const el = document.getElementById('statsCard');
    const stars = renderStarStr(parseFloat(stats.avg));
    const total = product?.totalRating || stats.total;
    const breakdown = product?.ratingBreakdown || [];

    // bar chart dari breakdown produk (lebih akurat)
    const barsHtml = [5, 4, 3, 2, 1].map(i => {
        const count = breakdown[i - 1] || 0;
        const pct = total > 0 ? Math.round((count / total) * 100) : 0;
        return `<div class="bar-row">
      <span class="bar-label">${i}</span>
      <div class="bar-track"><div class="bar-fill" style="width:${pct}%"></div></div>
      <span class="bar-count">${count.toLocaleString('id')}</span>
    </div>`;
    }).join('');

    el.innerHTML = `
    <h2>📊 Statistik Rating</h2>
    <div class="stats-grid">
      <div>
        <div class="big-rating">${stats.avg}</div>
        <div class="stars-big">${stars}</div>
        <div class="rating-label">dari ${Number(total).toLocaleString('id')} ulasan</div>
      </div>
      <div class="bars">${barsHtml}</div>
      <div class="sentiment-boxes">
        <div class="sentiment-box sent-pos">👍 ${stats.positive} positif</div>
        <div class="sentiment-box sent-neu">😐 ${stats.neutral} netral</div>
        <div class="sentiment-box sent-neg">👎 ${stats.negative} negatif</div>
      </div>
    </div>
    <div style="margin-top:14px; font-size:0.82rem; color:var(--muted)">
      Dari ${stats.total} review yang dianalisis — ${stats.withPhoto} dengan foto, ${stats.withComment} dengan komentar
    </div>`;

    // Animasi bar setelah render
    setTimeout(() => {
        document.querySelectorAll('.bar-fill').forEach(b => {
            const w = b.style.width; b.style.width = '0';
            requestAnimationFrame(() => { b.style.width = w; });
        });
    }, 100);
}

function renderKeywords(keywords) {
    if (!keywords || keywords.length === 0) return;
    const el = document.getElementById('keywordsCard');
    const tags = keywords.map(k =>
        `<span class="keyword-tag">${escHtml(k.word)}<span class="kcount">×${k.count}</span></span>`
    ).join('');
    el.innerHTML = `<h2>🔍 Kata Kunci Review</h2><div class="keywords-wrap">${tags}</div>`;
}

function renderFilterButtons() {
    const row = document.getElementById('filterRow');
    if (!row) return;
    row.innerHTML = [0, 5, 4, 3, 2, 1].map((r, i) => {
        const label = r === 0 ? 'Semua' : '⭐'.repeat(r);
        return `<button class="filter-btn${i === 0 ? ' active' : ''}" onclick="filterReviews(${r})">${label}</button>`;
    }).join('');
}

function filterReviews(rating) {
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    event.target.classList.add('active');
    const filtered = rating === 0 ? allReviews : allReviews.filter(r => r.rating === rating);
    renderReviews(filtered);
}

function renderReviews(reviews) {
    const el = document.getElementById('reviewsList');
    if (!reviews || reviews.length === 0) {
        el.innerHTML = `<div class="empty-state">Tidak ada review untuk filter ini.</div>`;
        return;
    }

    el.innerHTML = reviews.map(r => {
        const stars = '⭐'.repeat(r.rating) + '☆'.repeat(5 - r.rating);
        const imgs = r.images.map(src =>
            `<img src="${src}" alt="review" onclick="window.open('${src}')" onerror="this.style.display='none'">`
        ).join('');
        return `
      <div class="review-item">
        <div class="review-top">
          <span class="review-author">👤 ${escHtml(r.author)}</span>
          <span class="review-stars">${stars}</span>
        </div>
        <div class="review-date">🕒 ${r.date}</div>
        ${r.productVariant ? `<div class="review-variant">Varian: ${escHtml(r.productVariant)}</div>` : ''}
        <div class="review-text">${escHtml(r.comment)}</div>
        ${imgs ? `<div class="review-imgs">${imgs}</div>` : ''}
        ${r.liked > 0 ? `<div class="review-like">👍 ${r.liked} orang merasa terbantu</div>` : ''}
      </div>`;
    }).join('');
}

function renderStarStr(rating) {
    let result = '';
    for (let i = 1; i <= 5; i++) {
        if (rating >= i) result += '⭐';
        else if (rating >= i - 0.5) result += '✨';
        else result += '☆';
    }
    return result;
}

function escHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Enter key
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('urlInput').addEventListener('keydown', e => {
        if (e.key === 'Enter') startScrape();
    });
});