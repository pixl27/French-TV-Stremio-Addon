const axios = require('axios');

async function testStreamingUrl() {
    console.log('🧪 Testing streaming URL directly...');
    
    try {
        console.log('📡 Requesting: http://localhost:3001/stream/237/playlist.m3u8');
        
        const response = await axios.get('http://localhost:3001/stream/237/playlist.m3u8', {
            timeout: 60000, // Give it time to capture auth
            headers: {
                'User-Agent': 'VLC/3.0.0 LibVLC/3.0.0',
                'Accept': 'application/vnd.apple.mpegurl,*/*'
            }
        });
        
        console.log('\n✅ SUCCESS! Stream response received:');
        console.log(`- Status: ${response.status}`);
        console.log(`- Content-Type: ${response.headers['content-type']}`);
        console.log(`- Content-Length: ${response.data.length} chars`);
        
        if (response.data.includes('#EXTM3U')) {
            console.log('\n🎯 Valid M3U8 playlist received!');
            console.log('\n📋 Playlist content:');
            console.log(response.data);
            
            // Extract segment URLs
            const lines = response.data.split('\n');
            const segments = lines.filter(line => 
                line.trim() && !line.startsWith('#') && line.includes('segment/')
            );
            
            console.log(`\n📺 Found ${segments.length} proxy segment URLs`);
            segments.forEach((segment, i) => {
                console.log(`  ${i + 1}. ${segment}`);
            });
            
            console.log('\n🎉 STREAMING TEST SUCCESSFUL!');
            console.log('The localhost proxy is working and serving M3U8 playlists with proxy segment URLs.');
            
        } else {
            console.log('\n❌ Invalid response - not an M3U8 playlist');
            console.log('Response content:', response.data);
        }
        
    } catch (error) {
        console.error('\n❌ STREAMING TEST FAILED:', error.message);
        if (error.response) {
            console.error('Response status:', error.response.status);
            console.error('Response data:', error.response.data);
        }
    }
}

testStreamingUrl();