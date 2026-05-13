require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { scrapeShopeeReviews } = require('./scraper');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({
    origin: process.env.FRONTEND_URL || '*'
}));
app.use(express.json());

// Health check
app.get('/', (req, res) => {
    res.json({ status: 'ok', message: 'Shopee Review Scraper API' });
});

// Main endpoint
app.post('/api/scrape', async (req, res) => {
    const { url } = req.body;

    if (!url) {
        return res.status(400).json({ error: 'URL wajib diisi' });
    }

    // Validasi URL Shopee
    if (!url.includes('shopee.co.id') && !url.includes('shope.ee')) {
        return res.status(400).json({ error: 'Hanya mendukung URL Shopee Indonesia' });
    }

    try {
        const result = await scrapeShopeeReviews(url);
        res.json({ success: true, data: result });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message || 'Gagal mengambil data' });
    }
});

app.listen(PORT, () => {
    console.log(`Server berjalan di port ${PORT}`);
});