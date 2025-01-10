// Initialize variables
let scrapedContent = '';
let port = null;

// Function to handle content updates
async function handleContentUpdate() {
    console.log('Handling content update');
    try {
        const [currentTab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!currentTab || !currentTab.url) {
            console.log('No active tab found');
            return;
        }

        // Get stored data
        const storage = await chrome.storage.local.get(null);
        console.log('Current storage:', storage);

        // Update UI
        await updateStoredPagesCheckboxes();
    } catch (error) {
        console.error('Error handling content update:', error);
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    // Establish connection with background script
    port = chrome.runtime.connect({ name: 'popup' });
    console.log('Connected to background script');

    // Handle warning banner
    const warningBanner = document.getElementById('warning-banner');
    if (warningBanner) {
        // Check if banner was previously dismissed
        const bannerState = await chrome.storage.local.get('warningBannerDismissed');
        if (bannerState.warningBannerDismissed) {
            warningBanner.style.display = 'none';
        } else {
            // Add dismiss button
            const dismissButton = document.createElement('button');
            dismissButton.innerHTML = '×';
            dismissButton.className = 'warning-dismiss';
            dismissButton.title = 'Dismiss';
            dismissButton.onclick = async () => {
                warningBanner.style.display = 'none';
                await chrome.storage.local.set({ warningBannerDismissed: true });
            };
            warningBanner.appendChild(dismissButton);
        }
    }

    // First check if all required elements exist
    const messagesContainer = document.getElementById('messages');
    const userInput = document.getElementById('user-input');
    const sendButton = document.getElementById('send-button');
    const summarizeButton = document.getElementById('summarize-button');
    const storedPagesContainer = document.getElementById('stored-pages-container');
    const newChatButton = document.getElementById('new-chat-button');

    // Guard clause to prevent errors if elements don't exist
    if (!messagesContainer || !userInput || !sendButton || !summarizeButton) {
        console.error('Required elements not found');
        return;
    }

    // Initialize stored pages if container exists
    if (storedPagesContainer) {
        await handleContentUpdate();
        addMessage("Start a new conversation!");
    }

    // Listen for tab changes
    chrome.tabs.onActivated.addListener(async (activeInfo) => {
        console.log('Tab changed, updating content...');
        await handleContentUpdate();
    });

    // Listen for tab updates
    chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
        if (changeInfo.status === 'complete') {
            console.log('Tab updated, updating content...');
            await handleContentUpdate();
        }
    });

    // Event Listeners for summarize button
    if (summarizeButton) {
        summarizeButton.addEventListener('click', async () => {
            const summarizeMessage = "summarize the documentation";
            addMessage(summarizeMessage, true);
            try {
                const response = await getOpenAIResponse(summarizeMessage);
                addMessage(response);
            } catch (error) {
                addMessage(`Error: ${error.message}`);
            }
        });
    }

    // Event Listeners for send button and input
    if (sendButton && userInput) {
        sendButton.addEventListener('click', async () => {
            const message = userInput.value.trim();
            if (message) {
                addMessage(message, true);
                userInput.disabled = true;
                sendButton.disabled = true;
                
                try {
                    const aiResponse = await getOpenAIResponse(message);
                    addMessage(aiResponse);
                } catch (error) {
                    addMessage(`Error: ${error.message}`);
                } finally {
                    userInput.disabled = false;
                    sendButton.disabled = false;
                    userInput.value = '';
                }
            }
        });

        userInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                sendButton.click();
            }
        });
    }

    // New Chat button functionality
    if (newChatButton && messagesContainer) {
        newChatButton.addEventListener('click', () => {
            messagesContainer.innerHTML = '';
            if (userInput) userInput.value = '';
            addMessage("Start a new conversation!");
        });
    }
});

// Handle popup close
window.addEventListener('unload', () => {
    if (port) {
        port.disconnect();
    }
});

// Update the message listener for content updates
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log('Received message in popup:', request);
    if (request.action === "contentScraped") {
        console.log("Content scraped, updating UI...");
        handleContentUpdate();
    }
});

///////////////////// function to scrape the content of the website ////////////////////////
async function scrapeContent() {
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab || !tab.url) {
            console.log('No active tab or URL found');
            return { content: '', title: '', success: false };
        }

        // Skip unsupported URLs
        if (tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://')) {
            console.log('Unsupported URL type');
            return { content: '', title: '', success: false };
        }

        // Try to get content from storage first
        const storedData = await chrome.storage.local.get(`page_${tab.url}`);
        if (storedData[`page_${tab.url}`]) {
            const pageData = storedData[`page_${tab.url}`];
            return {
                content: pageData.content,
                title: pageData.title,
                success: true
            };
        }

        // If not in storage, get from content script
        return new Promise((resolve) => {
            chrome.tabs.sendMessage(tab.id, { action: "getPageContent" }, (response) => {
                if (chrome.runtime.lastError || !response) {
                    console.error('Error:', chrome.runtime.lastError);
                    resolve({ content: '', title: '', success: false });
                    return;
                }
                
                if (response.success) {
                    // Store for future use
                    chrome.storage.local.set({
                        [`page_${tab.url}`]: {
                            content: response.content,
                            title: response.title,
                            url: tab.url,
                            timestamp: Date.now()
                        }
                    });
                }
                
                resolve(response);
            });
        });

    } catch (error) {
        console.error('Scraping error:', error);
        return { content: '', title: '', success: false };
    }
}

// Function to handle storing scraped content
function storeScrapedContent(pageTitle, content, url) {
    if (!pageTitle || !content || !url) return;
    
    const pageData = {
        content: content,
        title: pageTitle,
        url: url,
        timestamp: Date.now()
    };

    chrome.storage.local.set({
        [`page_${url}`]: pageData
    }, () => {
        updateStoredPagesCheckboxes();
    });
}

///////////////////// OpenAI API function ////////////////////////
async function getOpenAIResponse(userMessage) {
    try {
        const checkedBoxes = document.querySelectorAll('input[type="checkbox"]:checked');
        let selectedContent = '';
        
        // Get content from all checked boxes
        for (const checkbox of checkedBoxes) {
            const url = checkbox.getAttribute('data-url');
            const stored = await chrome.storage.local.get(`page_${url}`);
            if (stored[`page_${url}`]) {
                selectedContent += `${stored[`page_${url}`].content}\n\n`;
            }
        }

        // If no boxes checked, get current page
        if (!selectedContent) {
            const currentPage = await scrapeContent();
            if (currentPage.success) {
                selectedContent = currentPage.content;
            } else {
                selectedContent = "no data";
            }
        }

        // Send message to background script for API call
        return new Promise((resolve, reject) => {
            chrome.runtime.sendMessage({
                action: "getExplanation",
                selectedText: selectedContent,
                query: userMessage
            }, response => {
                if (chrome.runtime.lastError) {
                    reject(new Error(chrome.runtime.lastError.message));
                    return;
                }
                
                if (!response || !response.success) {
                    reject(new Error(response?.error || 'Failed to get explanation'));
                    return;
                }
                
                resolve(response.data.answer);
            });
        });
    } catch (error) {
        console.error('OpenAI API Error:', error);
        throw error;
    }
}

// Define addMessage in the global scope
function addMessage(text, isUser = false) {
    const messagesContainer = document.getElementById('messages');
    if (!messagesContainer) return;

    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${isUser ? 'user-message' : 'bot-message'}`;
    
    const textContainer = document.createElement('div');
    textContainer.textContent = text;
    messageDiv.appendChild(textContainer);
    
    messagesContainer.appendChild(messageDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// Function to update stored pages checkboxes
async function updateStoredPagesCheckboxes() {
    const container = document.getElementById('stored-pages-container');
    if (!container) {
        console.error('Stored pages container not found');
        return;
    }

    try {
        // Get current tab first
        const [currentTab] = await chrome.tabs.query({ active: true, currentWindow: true });
        console.log('Current tab:', currentTab);

        // Get all stored data
        const storage = await chrome.storage.local.get(null);
        console.log('All stored data:', storage);
        
        // Clear existing content
        container.innerHTML = '';

        // Get all pages and sort by timestamp
        const pages = Object.entries(storage)
            .filter(([key, data]) => key.startsWith('page_') && data.content && data.title)
            .sort(([, a], [, b]) => b.timestamp - a.timestamp);

        console.log('Filtered pages:', pages);

        if (pages.length === 0) {
            // Try to get current page content
            console.log('No stored pages, fetching current page...');
            const currentContent = await getActiveTabContent();
            if (currentContent && currentContent.success) {
                console.log('Got current page content:', currentContent);
                await chrome.storage.local.set({
                    [`page_${currentContent.url}`]: {
                        content: currentContent.content,
                        title: currentContent.title,
                        url: currentContent.url,
                        timestamp: Date.now()
                    }
                });
                await updateStoredPagesCheckboxes();
                return;
            }

            const message = document.createElement('div');
            message.className = 'no-pages-message';
            message.textContent = 'No stored pages yet';
            container.appendChild(message);
            return;
        }

        for (const [key, pageData] of pages) {
            const checkboxDiv = document.createElement('div');
            checkboxDiv.className = 'checkbox-container';

            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.id = `checkbox-${key}`;
            checkbox.setAttribute('data-url', pageData.url);
            
            // Check if this is the current page
            if (currentTab && currentTab.url === pageData.url) {
                checkbox.checked = true;
            }

            const label = document.createElement('label');
            label.htmlFor = checkbox.id;
            label.title = pageData.url;
            label.textContent = pageData.title || 'Untitled Page';

            checkboxDiv.appendChild(checkbox);
            checkboxDiv.appendChild(label);
            container.appendChild(checkboxDiv);
        }
    } catch (error) {
        console.error('Error updating checkboxes:', error);
        const errorMessage = document.createElement('div');
        errorMessage.className = 'error-message';
        errorMessage.textContent = 'Error loading stored pages';
        container.appendChild(errorMessage);
    }
}

// Function to get active tab content
async function getActiveTabContent() {
    try {
        // Get the active tab
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab || !tab.url) {
            console.log('No active tab or URL found');
            return null;
        }

        // Skip chrome:// and chrome-extension:// URLs
        if (tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://')) {
            console.log('Unsupported URL type');
            return null;
        }

        // Get content from content script
        return new Promise((resolve) => {
            chrome.tabs.sendMessage(tab.id, { action: "getPageContent" }, (response) => {
                if (chrome.runtime.lastError) {
                    console.error('Error:', chrome.runtime.lastError);
                    resolve(null);
                    return;
                }
                
                console.log('Got page content response:', response);
                resolve(response);
            });
        });
    } catch (error) {
        console.error('Error getting tab content:', error);
        return null;
    }
}