const fs = require('fs');
const path = require('path');
const fetchAllStreamUrls = require('./fetchAllStreamUrls');

// Function to generate cache file
async function generateCache() {
  console.log('Starting to build cache file...');
  try {
    // Fetch all channel data
    const channels = await fetchAllStreamUrls();
    
    if (!channels || channels.length === 0) {
      console.error('No channels fetched. Cache generation failed!');
      process.exit(1);
    }
    
    // Filter out any null or undefined channel objects
    const validChannels = channels.filter(channel => channel && channel.id && channel.url);
    console.log(`Found ${validChannels.length} valid channels out of ${channels.length} total`);
    
    // Create cache directory if it doesn't exist
    const cacheDir = path.join(__dirname, 'cache');
    if (!fs.existsSync(cacheDir)) {
      fs.mkdirSync(cacheDir);
    }
    
    // Write the channels data to the cache file
    fs.writeFileSync(
      path.join(cacheDir, 'channels-cache.json'), 
      JSON.stringify(validChannels), 
      'utf8'
    );
    
    console.log(`Cache file successfully generated with ${validChannels.length} channels!`);
    
    // Also build the pre-processed channelsInfo for Stremio
    const defaultCountry = process.env.INCLUDE_COUNTRIES ? 
      process.env.INCLUDE_COUNTRIES.split(',')[0] : 
      'GR';
      
    const channelsWithDetails = validChannels.map(channel => ({
      id: `iptv-${channel.id}`,
      name: channel.name || `Channel ${channel.id}`,
      type: 'tv',
      genres: [defaultCountry, channel.name || `Channel ${channel.id}`],
      poster: channel.logo || null,
      posterShape: 'square',
      background: channel.logo || null,
      logo: channel.logo || null,
      streamInfo: {
        url: channel.url,
        title: 'Live Stream',
        httpReferrer: ''
      }
    }));
    
    // Write the processed channels data
    fs.writeFileSync(
      path.join(cacheDir, 'channelsInfo-cache.json'), 
      JSON.stringify(channelsWithDetails), 
      'utf8'
    );
    
    console.log(`Processed channelsInfo cache file generated!`);
  } catch (error) {
    console.error('Error generating cache:', error);
    process.exit(1);
  }
}

// Run the cache generation
generateCache();