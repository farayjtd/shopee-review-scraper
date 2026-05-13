const axios = require('axios');
const { parseShopeeUrl, delay } = require('./utils');

const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Referer': 'https://shopee.co.id/',
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'id-ID,id;q=0.9',
    'x-api-source': 'pc',
    'x-shopee-language': 'id',
};

async function scrapeShopeeReviews(url) {
    const { shopId, itemId } = await parseShopeeUrl(url);
    const productData = await fetchProductDetail(shopId, itemId);
    const reviews = await fetchReviews(shopId, itemId);
    const stats = calculateStats(reviews);
    return { product: productData, reviews, stats };
}

async function fetchProductDetail(shopId, itemId) {
    const urls = [
        `https://shopee.co.id/api/v4/item/get?itemid=${itemId}&shopid=${shopId}`,
        `https://shopee.co.id/api/v2/item/get?itemid=${itemId}&shopid=${shopId}`,
        `https://shopee.co.id/api/v4/pdp/get_pc?item_id=${itemId}&shop_id=${shopId}`,
    ];

    for (const endpoint of urls) {
        try {
            const res = await axios.get(endpoint, {
                headers: HEADERS,
                timeout: 20000,
                httpsAgent: new (require('https').Agent)({ rejectUnauthorized: false }),
            });

            // v4 format
            let item = res.data?.data || res.data?.item;
            if (!item && res.data?.data?.item) item = res.data.data.item;

            if (!item || !item.name) continue;

            return {
                name: item.name,
                description: (item.description || '').slice(0, 600) + ((item.description?.length > 600) ? '...' : ''),
                price: formatPrice((item.price || item.price_min || 0) / 100000),
                priceMax: item.price_max ? formatPrice(item.price_max / 100000) : null,
                rating: item.item_rating?.rating_star?.toFixed(1) || '0',
                totalRating: item.item_rating?.rating_count?.reduce((a, b) => a + b, 0) || 0,
                ratingBreakdown: item.item_rating?.rating_count || [0, 0, 0, 0, 0],
                totalSold: item.historical_sold || item.sold || 0,
                stock: item.stock || 0,
                images: (item.images || []).slice(0, 3).map(img =>
                    img.startsWith('http') ? img : `https://down-id.img.susercontent.com/file/${img}`
                ),
                shopName: item.shop_name || '-',
                category: item.categories?.map(c => c.display_name).join(' > ') || '',
            };
        } catch (e) {
            console.warn('Gagal endpoint:', endpoint, e.message);
        }
    }

    throw new Error('Produk tidak ditemukan. Pastikan link benar dan produk masih tersedia.');
}

async function fetchReviews(shopId, itemId) {
    const allReviews = [];
    const limit = 20;

    const endpoints = [
        (offset) => `https://shopee.co.id/api/v4/product/get_ratings?itemid=${itemId}&shopid=${shopId}&limit=${limit}&offset=${offset}&type=0&filter=0`,
        (offset) => `https://shopee.co.id/api/v2/item/get_ratings?itemid=${itemId}&shopid=${shopId}&limit=${limit}&offset=${offset}&type=0&filter=0`,
    ];

    for (const makeUrl of endpoints) {
        for (let offset = 0; offset < 60; offset += limit) {
            try {
                const res = await axios.get(makeUrl(offset), {
                    headers: HEADERS,
                    timeout: 15000,
                });

                const ratings = res.data?.data?.ratings || res.data?.ratings;
                if (!ratings || ratings.length === 0) break;

                ratings.forEach(r => {
                    allReviews.push({
                        rating: r.rating_star || r.star || 5,
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

                await delay(600);
            } catch (e) {
                console.warn('Gagal fetch review offset', offset, e.message);
                break;
            }
        }

        if (allReviews.length > 0) break; // Kalau sudah dapat review, stop
    }

    return allReviews;
}

function calculateStats(reviews) {
    if (!reviews.length) return null;
    const total = reviews.length;
    const avg = (reviews.reduce((a, r) => a + r.rating, 0) / total).toFixed(2);
    const breakdown = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    reviews.forEach(r => breakdown[r.rating]++);
    const keywords = extractKeywords(reviews);
    return {
        total, avg, breakdown,
        withPhoto: reviews.filter(r => r.images.length > 0).length,
        withComment: reviews.filter(r => r.comment !== '(Tanpa komentar)').length,
        keywords,
        positive: reviews.filter(r => r.rating >= 4).length,
        negative: reviews.filter(r => r.rating <= 2).length,
        neutral: reviews.filter(r => r.rating === 3).length,
    };
}

function extractKeywords(reviews) {
    const stopWords = ['yang', 'dan', 'di', 'ke', 'dari', 'ini', 'itu', 'juga', 'ada', 'dengan', 'untuk', 'tidak', 'sudah', 'nya', 'saya', 'aja', 'bisa', 'lebih', 'tapi', 'kalau', 'beli', 'barang', 'produk', 'seller', 'penjual', 'banget', 'sangat', 'sekali', 'sama', 'atau', 'tapi', 'sudah', 'belum', 'pake', 'pakai'];
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