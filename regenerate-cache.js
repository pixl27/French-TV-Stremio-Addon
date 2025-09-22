const fs = require('fs');
const fetchAllStreamUrls = require('./fetchAllStreamUrls');

async function regenerateCache() {
    console.log('🔄 Regenerating cache with new proxy URLs...');
    
    try {
        // Delete old cache files if they exist
        if (fs.existsSync('./cache/channels-cache.json')) {
            fs.unlinkSync('./cache/channels-cache.json');
            console.log('✅ Deleted old channels-cache.json');
        }
        
        if (fs.existsSync('./cache/channelsInfo-cache.json')) {
            fs.unlinkSync('./cache/channelsInfo-cache.json');
            console.log('✅ Deleted old channelsInfo-cache.json');
        }
        
        // Force fresh fetch - this will create new cache with proxy URLs
        console.log('🚀 Fetching fresh channel data...');
        const channels = await fetchAllStreamUrls();
        
        console.log(`✅ Cache regenerated with ${channels.length} channels`);
        console.log('📺 Sample channels with new URLs:');
        
        channels.slice(0, 5).forEach(channel => {
            console.log(`- ${channel.name}: ${channel.url}`);
        });
        
        console.log('🎯 Cache regeneration complete!');
        
    } catch (error) {
        console.error('❌ Error regenerating cache:', error.message);
    }
}

regenerateCache();