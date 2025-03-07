const express = require('express');
const { addonBuilder, serveHTTP } = require('stremio-addon-sdk');
const axios = require('axios');
const NodeCache = require('node-cache');
const { SocksProxyAgent } = require('socks-proxy-agent');
const { HttpProxyAgent } = require('http-proxy-agent');
const fetchAllStreamUrls = require('./fetchAllStreamUrls');

// Constants
const IPTV_CHANNELS_URL = 'https://iptv-org.github.io/api/channels.json';
const PORT = process.env.PORT || 3000;
const FETCH_INTERVAL = parseInt(process.env.FETCH_INTERVAL) || 86400000; // 1 day default
const PROXY_URL = process.env.PROXY_URL || '';
const FETCH_TIMEOUT = parseInt(process.env.FETCH_TIMEOUT) || 45000; // increased to 20 seconds
// Configuration for channel filtering.
const config = {
    includeLanguages: process.env.INCLUDE_LANGUAGES ? process.env.INCLUDE_LANGUAGES.split(',') : [],
    includeCountries: process.env.INCLUDE_COUNTRIES ? process.env.INCLUDE_COUNTRIES.split(',') : ['GR'],
    excludeLanguages: process.env.EXCLUDE_LANGUAGES ? process.env.EXCLUDE_LANGUAGES.split(',') : [],
    excludeCountries: process.env.EXCLUDE_COUNTRIES ? process.env.EXCLUDE_COUNTRIES.split(',') : [],
    excludeCategories: process.env.EXCLUDE_CATEGORIES ? process.env.EXCLUDE_CATEGORIES.split(',') : [],
};

// Express app setup
const app = express();
app.use(express.json());

// Cache setup
const cache = new NodeCache({ stdTTL: 0 });

// Addon Manifest
const manifest = {
    id: 'org.iptv',
    name: 'French TV',
    version: '0.0.2',
    description: `Watch live TV from France`,
    resources: ['catalog', 'meta', 'stream'],
    types: ['tv'],
    catalogs: config.includeCountries.map(country => ({
        type: 'tv',
        id: `iptv-channels-${country}`,
        name: `IPTV - ${country}`,
        extra: [
            {
                name: 'genre',
                isRequired: false,
                "options": [
                    "animation",
                    "business",
                    "classic",
                    "comedy",
                    "cooking",
                    "culture",
                    "documentary",
                    "education",
                    "entertainment",
                    "family",
                    "kids",
                    "legislative",
                    "lifestyle",
                    "movies",
                    "music",
                    "general",
                    "religious",
                    "news",
                    "outdoor",
                    "relax",
                    "series",
                    "science",
                    "shop",
                    "sports",
                    "travel",
                    "weather",
                    "xxx",
                    "auto"
                ]
            }
        ],
    })),
    idPrefixes: ['iptv-'],
    behaviorHints: { configurable: false, configurationRequired: false },
    logo: "https://dl.strem.io/addon-logo.png",
    icon: "https://dl.strem.io/addon-logo.png",
    background: "https://dl.strem.io/addon-background.jpg",
};

const addon = new addonBuilder(manifest);

// Helper Functions

// Convert a channel to a Stremio Meta object.
const toMeta = (channel) => ({
    id: `iptv-${channel.id}`,
    name: channel.name,
    type: 'tv',
    genres: [...(channel.categories || []), channel.country].filter(Boolean),
    poster: channel.logo,
    posterShape: 'square',
    background: channel.logo || null,
    logo: channel.logo || null,
});

// Fetch and filter channels from the iptv‑org API.
const getChannels = async () => {
    console.log("Downloading channels");
    try {
        const channelsResponse = await axios.get(IPTV_CHANNELS_URL, { timeout: FETCH_TIMEOUT });
        console.log("Finished downloading channels");
        return channelsResponse.data;
    } catch (error) {
        console.error('Error fetching channels:', error);
        if (cache.has('channels')) {
            console.log('Serving channels from cache');
            return cache.get('channels');
        }
        return null;
    }
};

// Fetch custom stream info using the external stream URL.
// Note that this returns an array with a single stream object.

const getStreamInfo = async () => {
    if (!cache.has('streams')) {
        console.log("Downloading channel streams from french-tv.lol");
        try {
            const streamsData = await fetchAllStreamUrls();
            // streamsData now is an array of channel objects [{ id, url, logo, name }, ...]
            cache.set('streams', streamsData);
        } catch (error) {
            console.error('Error fetching custom stream urls:', error);
            return [];
        }
    }
    return cache.get('streams');
};

// Verify stream URL by sending a HEAD request.
const verifyStreamURL = async (url, userAgent, httpReferrer) => {
    const cachedResult = cache.get(url);
    if (cachedResult !== undefined) return cachedResult;

    const effectiveUserAgent = userAgent || 'Mozilla/5.0 (Web0S; Linux/SmartTV) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/79.0.3945.79 Safari/537.36 DMOST/2.0.0 (; LGE; webOSTV; WEBOS6.3.2 03.34.95; W6_lm21a;)';
    const effectiveReferer = httpReferrer || '';

    if (effectiveUserAgent !== 'Mozilla/5.0 (Web0S; Linux/SmartTV) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/79.0.3945.79 Safari/537.36 DMOST/2.0.0 (; LGE; webOSTV; WEBOS6.3.2 03.34.95; W6_lm21a;)') {
        console.log(`Using User-Agent: ${effectiveUserAgent}`);
    }
    if (httpReferrer) {
        console.log(`Using Referer: ${effectiveReferer}`);
    }

    let axiosConfig = {
        timeout: FETCH_TIMEOUT,
        headers: {
            'User-Agent': effectiveUserAgent,
            'Accept': '*/*',
            'Referer': effectiveReferer,
        },
    };

    if (PROXY_URL) {
        axiosConfig.httpsAgent = PROXY_URL.startsWith('socks')
            ? new SocksProxyAgent(PROXY_URL)
            : new HttpProxyAgent(PROXY_URL);
    }

    try {
        const response = await axios.head(url, axiosConfig);
        const result = response.status === 200;
        cache.set(url, result);
        return result;
    } catch (error) {
        console.log(`Stream URL verification failed for ${url}:`, error.message);
        cache.set(url, false);
        return false;
    }
};

// Get all channel information and assign the same custom stream to every channel.
const getAllInfo = async () => {
    if (cache.has('channelsInfo')) return cache.get('channelsInfo');
    
    const channels = await getStreamInfo();
    if (!channels || channels.length === 0) {
        console.log('No channels fetched from french-tv.lol');
        return cache.get('channelsInfo') || [];
    }
    
    // Map each channel (from news IDs) to a Stremio meta object.
    // Here we include a default country (using the first item from config.includeCountries)
    // so that the catalog filter (e.g. "GR") will match.
    const defaultCountry = config.includeCountries[0] || '';
    const channelsWithDetails = channels.map(channel => {
        const meta = {
            id: `iptv-${channel.id}`,
            name: channel.name,
            type: 'tv',
            genres: [defaultCountry, channel.name], // include the default country
            poster: channel.logo,
            posterShape: 'square',
            background: channel.logo,
            logo: channel.logo,
            streamInfo: {
                url: channel.url,
                title: 'Live Stream',
                httpReferrer: ''
            }
        };
        return meta;
    });
    
    cache.set('channelsInfo', channelsWithDetails);
    return channelsWithDetails;
};

// Addon Handlers

addon.defineCatalogHandler(async ({ type, id, extra }) => {
    if (type === 'tv' && id.startsWith('iptv-channels-')) {
        const country = id.split('-')[2];
        const allChannels = await getAllInfo();
        let filteredChannels = allChannels.filter(channel => channel.genres.includes(country));

        if (extra && extra.genre) {
            const genres = Array.isArray(extra.genre) ? extra.genre : [extra.genre];
            filteredChannels = filteredChannels.filter(channel =>
                genres.some(genre => channel.genres.includes(genre))
            );
        }

        console.log(`Serving catalog for ${country} with ${filteredChannels.length} channels`);
        return { metas: filteredChannels };
    }
    return { metas: [] };
});

addon.defineMetaHandler(async ({ type, id }) => {
    if (type === 'tv' && id.startsWith('iptv-')) {
        const channels = await getAllInfo();
        const channel = channels.find(meta => meta.id === id);
        if (channel) return { meta: channel };
    }
    return { meta: {} };
});

addon.defineStreamHandler(async ({ type, id }) => {
    if (type === 'tv' && id.startsWith('iptv-')) {
        const channels = await getAllInfo();
        const channel = channels.find(meta => meta.id === id);
        if (channel?.streamInfo) {
            console.log("Serving stream id:", channel.id);
            return { streams: [channel.streamInfo] };
        } else {
            console.log('No matching stream found for channelID:', id);
        }
    }
    return { streams: [] };
});

// Server setup
app.get('/manifest.json', (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.json(manifest);
});

serveHTTP(addon.getInterface(), { server: app, path: '/manifest.json', port: PORT });

// Cache management
const fetchAndCacheInfo = async () => {
    try {
        const metas = await getAllInfo();
        console.log(`${metas.length} channel(s) information cached successfully`);
    } catch (error) {
        console.error('Error caching channel information:', error);
    }
};

// Initial fetch and schedule periodic updates
fetchAndCacheInfo();
setInterval(fetchAndCacheInfo, FETCH_INTERVAL);