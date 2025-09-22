const axios = require('axios');

async function testAuthUrlResponse() {
    const authUrl = 'https://iptv2.french-live.lol/auth/237.m3u8?token=DH48HSUUvh-R8zLP8ojKlS88ojdSF0VrbdmM39vbKn-WPE6BnUByf_X_zrapGCnDPGTqeMQKoPuDj-m0q17uN49uB6B-WSV5FqsCfo8Z5vq3_mQ25WhbmtzFtAk7u-tq6xP_2y9FZRgcNa4ixt2ke8DKhZEBmKAQFB3RmqH-_ejmfTa2gbijo2Sxgc1t-krw_NLmMdzHKAj5LgHQgDj8y9ykpLIdiPiFKOMxWleIhi7s1EAwnBhPuetJP7Z9h3F5N4vsOQbU_IYde_BgPBTmayYWnvsCqeU2Z-VHnvSQZqfOtW-Gev0L5T5dIfxzhoUwRMHncK4OcWp3l7_tBqHWZla7XolrnGkXo9XbcXthE00yFn_Hea19pW6Rt6eGS23do5zMknZcJ7hhQTLOiE_vHusuHpKjyqMvIIZeScqGzfq4LZwCWXCoGODUacspiUvKXDfQ6U9gB6uahP7siM1iYquqGTdVXsrG94zq0DPeA0DlXGRIfuRpeah4FD0MMashQVcKisegRZyuIu5_voBKEp-KqtRa1Cnr4OpqdFHyNS1y8woX3nH_7fMmp0vAPu26amrkWWnijPRHPOD7VKgY6gEldFxOQnGBtj8ARcU_iAR250TIy92I2agwfGdMObft';
    
    try {
        console.log('🔍 Testing auth URL response...');
        console.log(`📡 URL: ${authUrl.substring(0, 100)}...`);
        
        const response = await axios.get(authUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': 'application/vnd.apple.mpegurl,text/plain,*/*',
                'Accept-Language': 'en-US,en;q=0.9',
                'Cache-Control': 'no-cache',
                'Pragma': 'no-cache'
            },
            timeout: 10000,
            responseType: 'text' // Force text response to get M3U8 content
        });
        
        console.log('\n📋 Response Info:');
        console.log(`- Status: ${response.status}`);
        console.log(`- Content-Type: ${response.headers['content-type']}`);
        console.log(`- Content-Length: ${response.headers['content-length']}`);
        console.log(`- Server: ${response.headers['server']}`);
        
        const content = response.data;
        console.log(`\n📄 Content Analysis:`);
        console.log(`- Type: ${typeof content}`);
        console.log(`- Length: ${content.length}`);
        
        // Check if it's text content
        if (typeof content === 'string') {
            console.log(`\n📝 Text Content Preview (first 1000 chars):`);
            console.log(content.substring(0, 1000));
            
            // Check if it's M3U8 format
            if (content.includes('#EXTM3U')) {
                console.log('\n🎯 M3U8 PLAYLIST DETECTED!');
                
                // Parse segments
                const lines = content.split('\n');
                const segments = [];
                
                for (const line of lines) {
                    const trimmed = line.trim();
                    if (trimmed && !trimmed.startsWith('#')) {
                        segments.push(trimmed);
                    }
                }
                
                console.log(`\n📺 Found ${segments.length} segments:`);
                segments.forEach((segment, index) => {
                    if (index < 5) { // Show first 5 segments
                        console.log(`${index + 1}. ${segment}`);
                    }
                });
                if (segments.length > 5) {
                    console.log(`... and ${segments.length - 5} more segments`);
                }
            } else {
                console.log('\n❌ Not an M3U8 playlist format');
            }
        } else {
            console.log('\n📁 Binary content detected');
            console.log(`First 100 bytes as hex: ${Buffer.from(content).subarray(0, 100).toString('hex')}`);
        }
        
    } catch (error) {
        console.error('❌ Error:', error.message);
        if (error.response) {
            console.error(`- Status: ${error.response.status}`);
            console.error(`- Headers:`, error.response.headers);
        }
    }
}

testAuthUrlResponse();