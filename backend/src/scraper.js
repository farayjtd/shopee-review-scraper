const puppeteer = require('puppeteer');
const { parseShopeeUrl, delay } = require('./utils');

async function scrapeShopeeReviews(url) {
    const { shopId, itemId } = await parseShopeeUrl(url);

    const browser = await puppeteer.launch({
        headless: 'new',
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
            '--no-first-run',
            '--no-zygote',
            '--single-process',
        ],
    });

    try {
        const page = await browser.newPage();

        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36');
        await page.setExtraHTTPHeaders({
            'Accept-Language': 'id-ID,id;q=0.9',
            'x-api-source': 'pc',
        });

        // Intercept API calls dari Shopee
        const productData = await fetchProductViaBrowser(page, shopId, itemId);
        const reviews = await fetchReviewsViaBrowser(page, shopId, itemId);
        const stats = calculateStats(reviews);

        return { product: productData, reviews, stats };
    } finally {
        await browser.close();
    }
}

async function fetchProductViaBrowser(page, shopId, itemId) {
    return new Promise(async (resolve, reject) => {
        let resolved = false;

        page.on('response', async (response) => {
            const url = response.url();
            if (resolved) return;
            if (url.includes('/api/v4/item/get') || url.includes('/api/v2/item/get')) {
                try {
                    const json = await response.json();
                    const item = json?.data || json?.item;
                    if (item?.name) {
                        resolved = true;
                        resolve({
                            name: item.name,
                            description: (item.description || '').slice(0, 600) + (item.description?.length > 600 ? '...' : ''),
                            price: formatPrice((item.price || item.price_min || 0) / 100000),
                            priceMax: item.price_max ? formatPrice(item.price_max / 100000) : null,
                            rating: item.item_rating?.rating_star?.toFixed(1) || '0',
                            totalRating: item.item_rating?.rating_count?.reduce((a, b) => a + b, 0) || 0,
                            ratingBreakdown: item.item_rating?.rating_count || [0, 0, 0, 0, 0],
                            totalSold: item.historical_sold || 0,
                            stock: item.stock || 0,
                            images: (item.images || []).slice(0, 3).map(img =>
                                img.startsWith('http') ? img : `https://down-id.img.susercontent.com/file/${img}`
                            ),
                            shopName: item.shop_name || '-',
                            category: item.categories?.map(c => c.display_name).join(' > ') || '',
                        });
                    }
                } catch (_) { }
            }
        });

        // Buka halaman produk — Shopee akan otomatis panggil API-nya sendiri
        const productUrl = `https://shopee.co.id/product/${shopId}/${itemId}`;
        await page.goto(productUrl, { waitUntil: 'networkidle2', timeout: 30000 });
        await delay(3000);

        if (!resolved) reject(new Error('Gagal mengambil data produk dari halaman Shopee.'));
    });
}

async function fetchReviewsViaBrowser(page, shopId, itemId) {
    const allReviews = [];

    return new Promise(async (resolve) => {
        const collected = new Set();

        page.on('response', async (response) => {
            const url = response.url();
            if (url.includes('get_ratings') || url.includes('get_reviews')) {
                try {
                    const json = await response.json();
                    const ratings = json?.data?.ratings || json?.ratings || [];
                    ratings.forEach(r => {
                        const key = r.cmtid || r.id || r.comment;
                        if (key && collected.has(key)) return;
                        if (key) collected.add(key);
                        allReviews.push({
                            rating: r.rating_star || 5,
                            comment: r.comment || '(Tanpa komentar)',
                            author: r.author_username ? maskUsername(r.author_username) : 'Anonim',
                            date: r.ctime ? new Date(r.ctime * 1000).toLocaleDateString('id-ID', {
                                day: 'numeric', month: 'long', year: 'numeric'
                            }) : '-',
                            images: (r.images || []).map(img =>
                                img.startsWith('http') ? img : `https://down-id.img.susercontent.com/file/${img}`
                            ),
                            productVariant: r.product_items?.[0]?.name || null,
                            liked: r.like_count || 0,
                        });
                    });
                } catch (_) { }
            }
        });

        // Scroll ke bagian review agar Shopee load review
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await delay(4000);
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight * 0.7));
        await delay(2000);

        resolve(allReviews);
    });
}

function calculateStats(reviews) {
    if (!reviews.length) return null;
    const total = reviews.length;
    const avg = (reviews.reduce((a, r) => a + r.rating, 0) / total).toFixed(2);
    const breakdown = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    reviews.forEach(r => breakdown[r.rating]++);
    return {
        total, avg, breakdown,
        withPhoto: reviews.filter(r => r.images.length > 0).length,
        withComment: reviews.filter(r => r.comment !== '(Tanpa komentar)').length,
        keywords: extractKeywords(reviews),
        positive: reviews.filter(r => r.rating >= 4).length,
        negative: reviews.filter(r => r.rating <= 2).length,
        neutral: reviews.filter(r => r.rating === 3).length,
    };
}

function extractKeywords(reviews) {
    const stopWords = ['yang', 'dan', 'di', 'ke', 'dari', 'ini', 'itu', 'juga', 'ada', 'dengan', 'untuk', 'tidak', 'sudah', 'nya', 'saya', 'aja', 'bisa', 'lebih', 'tapi', 'kalau', 'beli', 'barang', 'produk', 'seller', 'penjual', 'banget', 'sangat', 'sekali', 'sama', 'atau', 'pake', 'pakai'];
    const wordCount = {};
    reviews.forEach(r => {
        if (!r.comment || r.comment === '(Tanpa komentar)') return;
        r.comment.toLowerCase().replace(/[^a-zA-Z0-9\s]/g, '').split(/\s+/)
            .filter(w => w.length > 3 && !stopWords.includes(w))
            .forEach(w => { wordCount[w] = (wordCount[w] || 0) + 1; });
    });
    return Object.entries(wordCount).sort((a, b) => b[1] - a[1]).slice(0, 15).map(([word, count]) => ({ word, count }));
}

function formatPrice(price) {
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(price);
}

function maskUsername(u) {
    if (u.length <= 3) return u;
    return u[0] + '*'.repeat(u.length - 2) + u[u.length - 1];
}

module.exports = { scrapeShopeeReviews };