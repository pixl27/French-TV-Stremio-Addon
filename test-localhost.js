const axios = require('axios');

async function testLocalhost() {
    console.log('🧪 Testing localhost proxy streaming...');
    
    try {
        // Test 1: Health check
        console.log('\n📋 Step 1: Testing health endpoint...');
        const healthResponse = await axios.get('http://localhost:3001/health', { timeout: 5000 });
        console.log('✅ Health check passed:', healthResponse.data);
        
        // Test 2: Test streaming endpoint
        console.log('\n📋 Step 2: Testing streaming endpoint for channel 237...');
        const streamResponse = await axios.get('http://localhost:3001/stream/237/playlist.m3u8', { 
            timeout: 30000,
            headers: {
                'User-Agent': 'VLC/3.0.0'
            }
        });
        
        console.log('✅ Stream endpoint response:');
        console.log(`- Status: ${streamResponse.status}`);
        console.log(`- Content-Type: ${streamResponse.headers['content-type']}`);
        console.log(`- Content-Length: ${streamResponse.data.length}`);
        
        if (streamResponse.data.includes('#EXTM3U')) {
            console.log('🎯 Valid M3U8 playlist received!');
            console.log('\n📋 Playlist content preview:');
            console.log(streamResponse.data.substring(0, 500) + '...');
            
            // Count segments
            const segments = streamResponse.data.split('\n').filter(line => 
                line.trim() && !line.startsWith('#') && line.includes('.ts')
            );
            console.log(`\n📺 Found ${segments.length} segments in playlist`);
            
            if (segments.length > 0) {
                console.log(`📹 Sample segment: ${segments[0]}`);
            }
        } else {
            console.log('❌ Response is not a valid M3U8 playlist');
        }
        
        console.log('\n🎉 LOCALHOST TEST SUCCESSFUL!');
        console.log('The proxy server is working and can serve streaming playlists.');
        
    } catch (error) {
        console.error('\n❌ LOCALHOST TEST FAILED:', error.message);
        
        if (error.code === 'ECONNREFUSED') {
            console.log('💡 Server appears to be down. Let me try to start it...');
            
            // Try to start the server
            const { spawn } = require('child_process');
            console.log('🚀 Starting proxy server...');
            
            const serverProcess = spawn('node', ['stream-proxy.js'], {
                stdio: 'inherit',
                detached: true
            });
            
            console.log(`📡 Server started with PID: ${serverProcess.pid}`);
            console.log('⏳ Waiting 3 seconds for server to initialize...');
            
            // Wait and retry
            await new Promise(resolve => setTimeout(resolve, 3000));
            
            try {
                const retryResponse = await axios.get('http://localhost:3001/health', { timeout: 5000 });
                console.log('✅ Server is now running:', retryResponse.data);
            } catch (retryError) {
                console.error('❌ Server still not responding:', retryError.message);
            }
        }
    }
}

testLocalhost();