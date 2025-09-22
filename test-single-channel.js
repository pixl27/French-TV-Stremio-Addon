const fetchAllStreamUrls = require('./fetchAllStreamUrls');

async function testSingleChannel() {
    console.log('🧪 Testing fetchAllStreamUrls with modified newsIds array (single channel)...');
    
    // Temporarily modify the function to only test one channel
    const fs = require('fs');
    const originalContent = fs.readFileSync('./fetchAllStreamUrls.js', 'utf8');
    
    // Replace the newsIds array with just one channel for testing
    const modifiedContent = originalContent.replace(
        /const newsIds = \[.*?\];/s,
        "const newsIds = ['52']; // Test with channel ID 52"
    );
    
    fs.writeFileSync('./fetchAllStreamUrls-test.js', modifiedContent);
    
    // Test the modified version
    const testFunction = require('./fetchAllStreamUrls-test');
    const results = await testFunction();
    
    console.log('\n📊 TEST RESULTS:');
    console.log(`Total channels processed: ${results.length}`);
    
    if (results.length > 0) {
        const channel = results[0];
        console.log('\n✅ SUCCESS! First channel:');
        console.log(`- NewsID: ${channel.id}`);
        console.log(`- Name: ${channel.name}`);
        console.log(`- Player ID: ${channel.playerId}`);
        console.log(`- Logo: ${channel.logo}`);
        console.log(`- Stream URL: ${channel.url.substring(0, 100)}...`);
        console.log(`- Auth Captured: ${channel.authCaptured}`);
    } else {
        console.log('\n❌ FAILED! No channels returned');
    }
    
    // Clean up test file
    fs.unlinkSync('./fetchAllStreamUrls-test.js');
}

testSingleChannel().catch(console.error);