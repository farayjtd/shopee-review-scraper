const axios = require('axios');
const { parseShopeeUrl, delay } = require('./utils');

const SHOPEE_API_BASE = 'https://shopee.co.id/api/v2';

// Header agar tidak diblokir Shopee
const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Referer': 'https://shopee.co.id/',
    'Accept': 'application/json',
    'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8',
    'x-api-source': 'pc',
    'af-ac-enc-dat': 'aa0a',
};

async function scrapeShopeeReviews(url) {
    // 1. Parse URL → ambil shopId & itemId
    const { shopId, itemId } = await parseShopeeUrl(url);

    // 2. Ambil detail produk
    const productData = await fetchProductDetail(shopId, itemId);

    // 3. Ambil review (rating 1-5, maksimal 60 review)
    const reviews = await fetchReviews(shopId, itemId);

    // 4. Hitung statistik
    const stats = calculateStats(reviews);

    return {
        product: productData,
        reviews,
        stats,
    };
}

async function fetchProductDetail(shopId, itemId) {
    const url = `https://shopee.co.id/api/v4/item/get?itemid=${itemId}&shopid=${shopId}`;
    const res = await axios.get(url, { headers: HEADERS, timeout: 15000 });
    const item = res.data?.data;

    if (!item) throw new Error('Produk tidak ditemukan');

    return {
        name: item.name,
        description: item.description?.slice(0, 500) + (item.description?.length > 500 ? '...' : ''),
        price: formatPrice(item.price / 100000),
        priceMax: item.price_max ? formatPrice(item.price_max / 100000) : null,
        rating: item.item_rating?.rating_star?.toFixed(1),
        totalRating: item.item_rating?.rating_count?.reduce((a, b) => a + b, 0),
        ratingBreakdown: item.item_rating?.rating_count, // [1★, 2★, 3★, 4★, 5★]
        totalSold: item.historical_sold,
        stock: item.stock,
        images: item.images?.slice(0, 3).map(img =>
            `https://down-id.img.susercontent.com/file/${img}`
        ),
        shopName: item.shop_name,
        category: item.categories?.map(c => c.display_name).join(' > '),
    };
}

async function fetchReviews(shopId, itemId) {
    const allReviews = [];
    const limit = 20;
    const pages = 3; // 3 halaman × 20 = 60 review

    for (let offset = 0; offset < pages * limit; offset += limit) {
        const url = `https://shopee.co.id/api/v2/item/get_ratings?itemid=${itemId}&shopid=${shopId}&limit=${limit}&offset=${offset}&type=0&filter=0`;

        try {
            const res = await axios.get(url, { headers: HEADERS, timeout: 15000 });
            const ratings = res.data?.data?.ratings;
            if (!ratings || ratings.length === 0) break;

            ratings.forEach(r => {
                allReviews.push({
                    rating: r.rating_star,
                    comment: r.comment || '(Tanpa komentar)',
                    author: r.author_username ? maskUsername(r.author_username) : 'Anonim',
                    date: r.ctime ? new Date(r.ctime * 1000).toLocaleDateString('id-ID', {
                        day: 'numeric', month: 'long', year: 'numeric'
                    }) : '-',
                    images: r.images?.map(img => `https://down-id.img.susercontent.com/file/${img}`) || [],
                    productVariant: r.product_items?.[0]?.name || null,
                    liked: r.like_count || 0,
                });
            });

            await delay(500); // Jeda antar request
        } catch (err) {
            console.warn(`Gagal fetch halaman offset ${offset}:`, err.message);
            break;
        }
    }

    return allReviews;
}

function calculateStats(reviews) {
    if (reviews.length === 0) return null;

    const total = reviews.length;
    const sum = reviews.reduce((a, r) => a + r.rating, 0);
    const avg = (sum / total).toFixed(2);

    const breakdown = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    reviews.forEach(r => breakdown[r.rating]++);

    const withPhoto = reviews.filter(r => r.images.length > 0).length;
    const withComment = reviews.filter(r => r.comment !== '(Tanpa komentar)').length;

    // Kata yang paling sering muncul (kata kunci review)
    const keywords = extractKeywords(reviews);

    return {
        total,
        avg,
        breakdown,
        withPhoto,
        withComment,
        keywords,
        positive: reviews.filter(r => r.rating >= 4).length,
        negative: reviews.filter(r => r.rating <= 2).length,
        neutral: reviews.filter(r => r.rating === 3).length,
    };
}

function extractKeywords(reviews) {
    const stopWords = ['yang', 'dan', 'di', 'ke', 'dari', 'ini', 'itu', 'juga', 'ada', 'dengan', 'untuk', 'tidak', 'sudah', 'nya', 'saya', 'aja', 'bisa', 'lebih', 'tapi', 'kalau', 'beli', 'barang', 'produk', 'seller', 'penjual'];
    const wordCount = {};

    reviews.forEach(r => {
        if (!r.comment || r.comment === '(Tanpa komentar)') return;
        const words = r.comment.toLowerCase()
            .replace(/[^a-zA-Z0-9\s]/g, '')
            .split(/\s+/)
            .filter(w => w.length > 3 && !stopWords.includes(w));

        words.forEach(w => {
            wordCount[w] = (wordCount[w] || 0) + 1;
        });
    });

    return Object.entries(wordCount)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 15)
        .map(([word, count]) => ({ word, count }));
}

function formatPrice(price) {
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(price);
}

function maskUsername(username) {
    if (username.length <= 3) return username;
    return username[0] + '*'.repeat(username.length - 2) + username[username.length - 1];
}

module.exports = { scrapeShopeeReviews };