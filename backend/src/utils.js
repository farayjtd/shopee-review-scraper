const axios = require('axios');

/**
 * Parse URL Shopee → shopId & itemId
 * Mendukung URL panjang maupun short URL (shope.ee)
 */
async function parseShopeeUrl(url) {
    let finalUrl = url.trim();

    // Resolve short URL
    if (finalUrl.includes('shope.ee')) {
        const res = await axios.get(finalUrl, {
            maxRedirects: 5,
            timeout: 10000,
            headers: { 'User-Agent': 'Mozilla/5.0' }
        });
        finalUrl = res.request.res.responseUrl || finalUrl;
    }

    // Pola 1: /product/SHOP_ID/ITEM_ID
    let match = finalUrl.match(/shopee\.co\.id\/[^/]+\/i\.(\d+)\.(\d+)/);
    if (match) return { shopId: match[1], itemId: match[2] };

    // Pola 2: ?shopid=X&itemid=Y
    const urlObj = new URL(finalUrl.startsWith('http') ? finalUrl : 'https://' + finalUrl);
    const shopId = urlObj.searchParams.get('shopid');
    const itemId = urlObj.searchParams.get('itemid');
    if (shopId && itemId) return { shopId, itemId };

    // Pola 3: path -i.SHOPID.ITEMID
    match = finalUrl.match(/i\.(\d+)\.(\d+)/);
    if (match) return { shopId: match[1], itemId: match[2] };

    throw new Error('Format URL Shopee tidak dikenali. Gunakan URL produk lengkap.');
}

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = { parseShopeeUrl, delay };