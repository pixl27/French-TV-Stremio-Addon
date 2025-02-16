const axios = require('axios');

async function fetchAllStreamUrls() {
    // List of news IDs to iterate over.
    const newsIds = ['46', '16', '14', '26', '50', '82', '47', '13', '33', '22', '44', '9', '74', '36', '88', '49', '57', '60', '85', '92', '21', '58', '27', '54', '19', '56', '86', '79', '90', '89', '78', '80', '48', '23', '52', '38', '95', '15', '71', '4', '94', '39', '45', '75', '32', '76', '29', '37', '81', '40', '34', '73', '43', '59', '83', '69', '63', '72', '24', '18', '87', '42', '17', '55', '84', '35', '28', '93', '25','5'];
    const headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html',
        'Referer': 'https://french-tv.lol/',
    };

    const channels = await Promise.all(newsIds.map(async (newsId) => {
        try {
            const mainUrl = `https://french-tv.lol/index.php?newsid=${newsId}`;
            const mainResponse = await axios.get(mainUrl, { headers, timeout: 10000 });
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
            // The regex looks for an <img> having id "posterImage" and captures the src and alt.
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
            
            // Call the player URL using the extracted id.
            const playerUrl = `https://french-tv.lol/player/fsplayer.php?id=${playerId}`;
            const playerResponse = await axios.get(playerUrl, { headers, timeout: 10000 });
            const playerHtml = playerResponse.data;
            
            // Extract streamUrl from the script tag.
            const streamMatch = playerHtml.match(/var\s+streamUrl\s*=\s*"([^"]+)"/);
            if (streamMatch && streamMatch[1]) {
                const streamUrl = streamMatch[1];
                console.log(`NewsID ${newsId}: Stream URL:`, streamUrl);
                // Return an object with an id, url, logo, and name.
                return { id: newsId, url: streamUrl, logo: fullLogo, name: channelName };
            } else {
                console.error(`NewsID ${newsId}: Stream URL not found`);
            }
        } catch (error) {
            console.error(`Error fetching newsId ${newsId}:`, error.message);
        }
        return null;
    }));
    return channels.filter(ch => ch !== null);
}

module.exports = fetchAllStreamUrls;