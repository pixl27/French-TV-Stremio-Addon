const axios = require('axios');

async function fetchAllStreamUrls() {
    // Import p-limit dynamically.
    const { default: pLimit } = await import('p-limit');

    // List of news IDs to iterate over.
    const newsIds = ['67','96','62','46', '16', '14','64', '26', '50','104','82', '47','12','11','10','13', '33',,'7', '22', '44', '9','6', '74','41','36','31','30','88','53', '49', '57', '60', '85', '92', '21', '58', '27', '54', '19', '56', '86', '79', '90', '89', '78', '80', '48', '23', '52', '38', '95', '15', '71', '4', '94', '39', '45', '75', '32', '76', '29', '37', '81', '40', '34','51','73', '43', '59', '83', '69', '63', '72', '24', '18', '87', '42', '17', '55', '84', '35', '28', '93', '25','5'];
    const headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html',
        'Referer': 'https://french-tv.lol/',
    };

    // Reduce concurrency to lower the risk of 429 errors
    const limit = pLimit(2);

    // Helper function to implement retry logic with exponential backoff
    async function fetchWithRetry(url, options, retries = 3, initialDelay = 2000) {
        try {
            return await axios.get(url, options);
        } catch (error) {
            if (error.response && error.response.status === 429 && retries > 0) {
                console.log(`Received 429 for ${url}. Retrying after delay... (${retries} attempts left)`);
                const delay = initialDelay * (2 ** (3 - retries));
                await new Promise(resolve => setTimeout(resolve, delay));
                return fetchWithRetry(url, options, retries - 1, initialDelay);
            }
            throw error;
        }
    }

    // Process requests in smaller batches
    const batchSize = 10;
    let allChannels = [];
    
    for (let i = 0; i < newsIds.length; i += batchSize) {
        const batchIds = newsIds.slice(i, i + batchSize);
        console.log(`Processing batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(newsIds.length/batchSize)}`);
        
        const batchChannels = await Promise.all(batchIds.map((newsId) =>
            limit(async () => {
                try {
                    // Add a small random delay before each request to prevent exact simultaneous requests
                    await new Promise(resolve => setTimeout(resolve, Math.random() * 500));
                    
                    const mainUrl = `https://french-tv.lol/index.php?newsid=${newsId}`;
                    const mainResponse = await fetchWithRetry(mainUrl, { headers, timeout: 10000 });
                    const htmlResponse = mainResponse.data;
                    
                    // Extract the iframe id.
                    const idMatch = htmlResponse.match(/<iframe[^>]+src="[^"]+\?id=(\d+)"/);
                    if (!idMatch || !idMatch[1]) {
                        console.error(`ID not found for newsId ${newsId}`);
                        return null;
                    }
                    const playerId = idMatch[1];
                    console.log(`NewsID ${newsId}: Found id:`, playerId);
                    
                    // Extract the poster image src and alt from the img tag with id "posterImage"
                    const logoRegex = /<img(?=[^>]*\bid=["']posterImage["'])[^>]*\bsrc=["']([^"']+)["'][^>]*\balt=["']([^"']+)["']/i;
                    const logoMatch = htmlResponse.match(logoRegex);
                    let fullLogo = null;
                    let channelName = null;
                    if (logoMatch && logoMatch[1]) {
                        fullLogo = logoMatch[1].startsWith('/')
                            ? `https://french-tv.lol${logoMatch[1]}`
                            : logoMatch[1];
                        channelName = logoMatch[2] || "";
                        console.log(`NewsID ${newsId}: Found logo:`, fullLogo);
                        console.log(`NewsID ${newsId}: Found channel name:`, channelName);
                    } else {
                        console.error(`NewsID ${newsId}: Poster image not found`);
                    }
                    
                    // Add delay between main page fetch and player fetch
                    await new Promise(resolve => setTimeout(resolve, 500));
                    
                    // Call the player URL using the extracted id.
                    const playerUrl = `https://french-tv.lol/player/fsplayer.php?id=${playerId}`;
                    const playerResponse = await fetchWithRetry(playerUrl, { headers, timeout: 10000 });
                    const playerHtml = playerResponse.data;
                    
                    // Extract streamUrl from the script tag.
                    const streamMatch = playerHtml.match(/var\s+streamUrl\s*=\s*"([^"]+)"/);
                    if (streamMatch && streamMatch[1]) {
                        const streamUrl = streamMatch[1];
                        console.log(`NewsID ${newsId}: Stream URL:`, streamUrl);
                        return { id: newsId, url: streamUrl, logo: fullLogo, name: channelName };
                    } else {
                        console.error(`NewsID ${newsId}: Stream URL not found`);
                    }
                } catch (error) {
                    console.error(`Error fetching newsId ${newsId}:`, error.message);
                }
                return null;
            })
        ));
        
        allChannels = [...allChannels, ...batchChannels.filter(ch => ch !== null)];
        
        // Add delay between batches
        if (i + batchSize < newsIds.length) {
            console.log(`Waiting between batches to avoid rate limiting...`);
            await new Promise(resolve => setTimeout(resolve, 3000));
        }
    }
    
    return allChannels.filter(ch => ch !== null);
}

module.exports = fetchAllStreamUrls;