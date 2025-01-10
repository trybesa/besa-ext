// Handle extension reload
chrome.runtime.onInstalled.addListener(() => {
    chrome.storage.local.clear();
});

// Handle extension icon click
chrome.action.onClicked.addListener((tab) => {
    try {
        if (chrome.sidePanel && chrome.sidePanel.open) {
            chrome.sidePanel.open({ windowId: tab.windowId });
        }
    } catch (error) {
        console.error('Error opening side panel:', error);
    }
});

// Improved message handling
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "getExplanation") {
        handleExplanationRequest(request.selectedText, request.query)
            .then(response => {
                if (chrome.runtime.lastError) {
                    sendResponse({ 
                        success: false, 
                        error: 'Extension context invalid. Please refresh the page.' 
                    });
                    return;
                }
                sendResponse(response);
            })
            .catch(error => {
                console.error('API Error:', error);
                sendResponse({ 
                    success: false, 
                    error: error.message 
                });
            });
        return true;
    } else if (request.action === 'ping') {
        sendResponse({ success: true });
        return true;
    }
});

// Separate function to handle API calls
async function handleExplanationRequest(selectedText, query, retryCount = 0) {
    const maxRetries = 3;
    const apiUrl = 'https://app.trybesa.com/extension-backend/api-call';

    try {
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'Origin': chrome.runtime.getURL(''),
                'X-Requested-With': 'XMLHttpRequest'
            },
            credentials: 'include',
            body: JSON.stringify({
                page_data: selectedText,
                query: query,
                extension_id: chrome.runtime.id
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('API Error Response:', errorText);
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        if (!data || !data.answer) {
            throw new Error('Invalid response format from API');
        }

        return { success: true, data: data };
    } catch (error) {
        console.error('API Error:', error);
        
        // Handle specific error types
        if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
            console.log('Network error detected, retrying...');
        }
        
        if (retryCount < maxRetries) {
            // Exponential backoff
            const waitTime = Math.pow(2, retryCount) * 1000;
            console.log(`Retrying in ${waitTime}ms...`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
            return handleExplanationRequest(selectedText, query, retryCount + 1);
        }
        
        throw new Error('Failed after multiple attempts. Please check your internet connection and try again.');
    }
}

// Function to notify popup of content update
async function notifyPopup(data) {
    try {
        await chrome.runtime.sendMessage({
            action: "contentScraped",
            data: data
        });
        console.log('Notified popup of new content');
    } catch (error) {
        console.log('No popup to notify');
    }
}

// Function to inject content script
async function injectContentScript(tabId) {
    try {
        // Get the tab info to check the URL
        const tab = await chrome.tabs.get(tabId);
        
        // Check if we have permission for this URL
        const hasPermission = await chrome.permissions.contains({
            origins: [new URL(tab.url).origin + '/*']
        });

        if (!hasPermission) {
            console.log('Requesting permission for:', tab.url);
            const granted = await chrome.permissions.request({
                origins: [new URL(tab.url).origin + '/*']
            });
            
            if (!granted) {
                throw new Error('Permission not granted for: ' + tab.url);
            }
        }

        // Proceed with injection
        await chrome.scripting.executeScript({
            target: { tabId: tabId },
            files: ['contentScript.js']
        });
        
        // Also inject CSS
        await chrome.scripting.insertCSS({
            target: { tabId: tabId },
            files: ['styles.css']
        });
        
        console.log('Content script and CSS injected successfully');
        return true;
    } catch (error) {
        console.error('Error injecting content script:', error);
        return false;
    }
}

// Function to ensure content script is injected
async function ensureContentScriptInjected(tabId) {
    try {
        // Try sending a test message first
        await chrome.tabs.sendMessage(tabId, { action: 'ping' });
        return true; // Content script is already injected
    } catch (error) {
        // If message fails, inject the content script
        return await injectContentScript(tabId);
    }
}

// Function to handle page scraping
async function scrapeAndStorePage(tabId, url) {
    if (!url || url.startsWith('chrome://') || url.startsWith('chrome-extension://')) {
        console.log('Skipping unsupported URL:', url);
        return;
    }

    try {
        console.log('Scraping page:', url);
        
        // Ensure content script is injected
        const isInjected = await ensureContentScriptInjected(tabId);
        if (!isInjected) {
            console.error('Failed to inject content script');
            return;
        }

        // Send message to content script to scrape the page
        try {
            const response = await chrome.tabs.sendMessage(tabId, {
                action: "scrapePageContent",
                url: url
            });

            if (response && response.success) {
                console.log('Successfully scraped page:', url);
                
                // Store the current page data
                const pageData = {
                    [`page_${url}`]: {
                        content: response.content,
                        title: response.title,
                        url: url,
                        timestamp: Date.now()
                    }
                };

                await chrome.storage.local.set(pageData);
                console.log('Stored page data:', pageData);

                // Notify popup
                await notifyPopup(pageData[`page_${url}`]);
            } else {
                console.error('Failed to scrape page:', url, response);
            }
        } catch (error) {
            console.error('Error sending message to content script:', error);
            // Try re-injecting content script and retry once
            if (await injectContentScript(tabId)) {
                await scrapeAndStorePage(tabId, url);
            }
        }
    } catch (error) {
        console.error('Error in scrapeAndStorePage:', error);
    }
}

// Handle tab updates (URL changes)
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete' && tab.url) {
        console.log('Tab updated, scraping content:', tab.url);
        scrapeAndStorePage(tabId, tab.url);
    }
});

// Handle tab switching
chrome.tabs.onActivated.addListener(async (activeInfo) => {
    try {
        const tab = await chrome.tabs.get(activeInfo.tabId);
        if (tab.url) {
            console.log('Tab activated, scraping content:', tab.url);
            await scrapeAndStorePage(activeInfo.tabId, tab.url);
        }
    } catch (error) {
        console.error('Error handling tab activation:', error);
    }
});

// Improved error handling for storage operations
async function clearStorage() {
    try {
        await chrome.storage.local.clear();
        console.log('Storage cleared successfully');
    } catch (error) {
        console.error('Error clearing storage:', error);
        // If context is invalid, don't throw
        if (!error.message.includes('Extension context invalidated')) {
            throw error;
        }
    }
}

// Handle popup open/close with better error handling
chrome.runtime.onConnect.addListener((port) => {
    console.log('Popup connected');
    
    // When popup opens, scrape current tab
    chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
        if (tabs[0] && tabs[0].url) {
            try {
                await scrapeAndStorePage(tabs[0].id, tabs[0].url);
            } catch (error) {
                console.error('Error during initial scrape:', error);
            }
        }
    });
    
    // When popup closes
    port.onDisconnect.addListener(async () => {
        console.log('Popup disconnected');
        try {
            await clearStorage();
        } catch (error) {
            console.error('Error during popup disconnect:', error);
        }
    });
}); 