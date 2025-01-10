// Global variables
let lastSelectedText = '';
let isFeatureEnabled = true;
let explanationContainer = null;
let isSelecting = false;

// Create master toggle
function createMasterToggle() {
    const toggleContainer = document.createElement('div');
    toggleContainer.id = 'besa-master-toggle';
    toggleContainer.innerHTML = `
        <div class="master-toggle-switch">
            <input type="checkbox" id="besa-master-toggle-input" ${isFeatureEnabled ? 'checked' : ''}>
            <label for="besa-master-toggle-input"></label>
            <span class="toggle-label">BESA Quick Explain</span>
        </div>
    `;

    document.body.appendChild(toggleContainer);

    const toggleInput = toggleContainer.querySelector('input');
    toggleInput.addEventListener('change', function() {
        isFeatureEnabled = this.checked;
        if (!isFeatureEnabled) {
            hideExplanation();
        }
        // Store the toggle state
        chrome.storage.local.set({ 'besaFeatureEnabled': isFeatureEnabled });
    });

    // Load saved state
    chrome.storage.local.get('besaFeatureEnabled', (result) => {
        if (result.hasOwnProperty('besaFeatureEnabled')) {
            isFeatureEnabled = result.besaFeatureEnabled;
            toggleInput.checked = isFeatureEnabled;
        }
    });
}

// Function to handle explanation request
async function handleExplanationRequest(text, queryType) {
    if (!explanationContainer) return;

    const contentDiv = explanationContainer.querySelector('.besa-explanation-content');
    contentDiv.innerHTML = '<div class="besa-loading">Getting explanation...</div>';

    try {
        const response = await chrome.runtime.sendMessage({
            action: "getExplanation",
            selectedText: text,
            query: getQueryPrompt(queryType)
        });

        if (response && response.success) {
            contentDiv.innerHTML = `<div class="besa-answer">${response.data.answer}</div>`;
            
            // Add active class to the clicked option
            const options = explanationContainer.querySelectorAll('.besa-hotkey-option');
            options.forEach(option => {
                if (option.dataset.query === queryType) {
                    option.classList.add('active');
                } else {
                    option.classList.remove('active');
                }
            });
        } else {
            contentDiv.innerHTML = `<div class="besa-error">${response?.error || 'Failed to get explanation'}</div>`;
        }
    } catch (error) {
        if (error.message.includes('Extension context invalidated')) {
            contentDiv.innerHTML = `<div class="besa-error">Please refresh the page to use the extension.</div>`;
        } else {
            contentDiv.innerHTML = `<div class="besa-error">Error: ${error.message}</div>`;
        }
    }
}

// Function to get query prompt based on type
function getQueryPrompt(type) {
    switch (type) {
        case 'explain':
            return "You're a content expert. Please explain this text in a simple, clear, and concise way that's easy to understand. Focus on the key points while maintaining accuracy.";
        case 'rewrite':
            return "You're a content expert. Please rewrite this text in a different way while maintaining its core meaning and context. Make it fresh and engaging while preserving the key information.";
        case 'draft':
            return "You're a professional email writer. I want you to draft a professional email using this text as the main content/message of the email. Format it properly with:\n\nSubject: [Create a relevant subject line]\n\nDear [Appropriate greeting],\n\n[Convert the text into a well-structured email body while maintaining its core message]\n\nBest regards,\n[Professional signature]\n\nMake sure the email is professional, clear, and properly formatted. Keep the original message intact but present it in a proper email format.";
        case 'code':
            return "You're a code expert and you can explain any code snippet in detail, including its purpose and functionality. Explain this code snippet in detail, including its purpose and functionality";
        case 'logs':
            return "You're a DevOps expert and I want you to analyze these logs and explain what they indicate in breif. Analyze these logs and explain what they indicate in breif";
        default:
            return "You're a content expert. Explain this in simple words";
    }
}

// Function to handle copy
function handleCopy() {
    const answerDiv = explanationContainer.querySelector('.besa-answer');
    if (answerDiv) {
        const textToCopy = answerDiv.textContent;
        navigator.clipboard.writeText(textToCopy)
            .then(() => {
                const copyBtn = explanationContainer.querySelector('.besa-copy-btn');
                copyBtn.classList.add('copied');
                copyBtn.textContent = '✓ Copied!';
                setTimeout(() => {
                    copyBtn.classList.remove('copied');
                    copyBtn.innerHTML = '📋 Copy';
                }, 2000);
            })
            .catch(err => {
                console.error('Failed to copy text:', err);
                const copyBtn = explanationContainer.querySelector('.besa-copy-btn');
                copyBtn.textContent = '❌ Failed to copy';
                setTimeout(() => {
                    copyBtn.innerHTML = '📋 Copy';
                }, 2000);
            });
    }
}

// Function to handle feedback
function handleFeedback(type) {
    console.log('Feedback:', type);
    // Implement feedback handling here if needed
}

// Function to show options near selection
function showOptionsNearSelection(selection) {
    if (!isFeatureEnabled) return;
    
    // If a container is already open, don't open another one
    if (document.querySelector('#besa-explanation-container')) {
        return;
    }

    const range = selection.getRangeAt(0);
    
    // Create the explanation container
    explanationContainer = document.createElement('div');
    explanationContainer.id = 'besa-explanation-container';
    document.body.appendChild(explanationContainer);

    // Calculate safe margins and positions
    const margin = 20; // Margin from viewport edges
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const containerWidth = 600; // Width from CSS

    // Center horizontally
    const leftPosition = (viewportWidth - containerWidth) / 2;
    
    // Set the container's initial position
    explanationContainer.style.position = 'fixed';
    explanationContainer.style.left = `${leftPosition}px`;
    explanationContainer.style.display = 'flex';
    explanationContainer.style.flexDirection = 'column';
    explanationContainer.style.maxHeight = `${viewportHeight - (margin * 2)}px`;
    
    // Add hotkey options
    explanationContainer.innerHTML = `
        <div class="besa-options-container">
            <div class="besa-hotkey-option" data-query="explain">
                <span class="hotkey">E</span>
                <span class="label">Explain</span>
            </div>
            <div class="besa-hotkey-option" data-query="rewrite">
                <span class="hotkey">W</span>
                <span class="label">Rewrite</span>
            </div>
            <div class="besa-hotkey-option" data-query="draft">
                <span class="hotkey">D</span>
                <span class="label">Draft Email</span>
            </div>
            <div class="besa-hotkey-option" data-query="code">
                <span class="hotkey">C</span>
                <span class="label">Code</span>
            </div>
            <div class="besa-hotkey-option" data-query="logs">
                <span class="hotkey">L</span>
                <span class="label">Logs</span>
            </div>
        </div>
        <div class="besa-explanation-content"></div>
        <div class="besa-feedback-footer">
            <button class="besa-copy-btn" title="Copy to clipboard">📋 Copy</button>
            <div class="besa-feedback-buttons">
                <button class="besa-feedback-btn" data-type="helpful">👍</button>
                <button class="besa-feedback-btn" data-type="not-helpful">👎</button>
            </div>
            <button class="besa-close-btn">✕</button>
        </div>
    `;

    // After container is added to DOM, center it vertically
    const containerHeight = explanationContainer.offsetHeight;
    const topPosition = (viewportHeight - containerHeight) / 2;
    explanationContainer.style.top = `${topPosition}px`;

    // Make the container draggable
    makeDraggable(explanationContainer);

    // Add mutation observer to handle content changes
    const observer = new MutationObserver(() => {
        const newHeight = explanationContainer.offsetHeight;
        const maxHeight = viewportHeight - (margin * 2);
        
        if (newHeight > maxHeight) {
            // If content would exceed viewport height, set max height and adjust position
            explanationContainer.style.maxHeight = `${maxHeight}px`;
            
            // Get current center point of container
            const currentCenter = parseInt(explanationContainer.style.top) + (newHeight / 2);
            
            // Calculate new top position to maintain center point
            let newTop = currentCenter - (maxHeight / 2);
            
            // Ensure container stays within viewport bounds
            newTop = Math.min(
                Math.max(margin, newTop),
                viewportHeight - maxHeight - margin
            );
            
            explanationContainer.style.top = `${newTop}px`;
        } else {
            // If content is within viewport height, center it vertically
            const currentCenter = viewportHeight / 2;
            const newTop = currentCenter - (newHeight / 2);
            explanationContainer.style.top = `${newTop}px`;
            explanationContainer.style.maxHeight = 'none';
        }
    });

    observer.observe(explanationContainer.querySelector('.besa-explanation-content'), {
        childList: true,
        subtree: true,
        characterData: true
    });

    // Prevent any click events from bubbling up from the container
    explanationContainer.addEventListener('click', (e) => {
        e.stopPropagation();
    }, true);

    // Add click handlers for hotkey options
    const options = explanationContainer.querySelectorAll('.besa-hotkey-option');
    options.forEach(option => {
        option.addEventListener('mousedown', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const query = option.dataset.query;
            handleExplanationRequest(lastSelectedText, query);
        }, true);
    });

    // Add copy button handler
    const copyBtn = explanationContainer.querySelector('.besa-copy-btn');
    copyBtn.addEventListener('mousedown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        handleCopy();
    }, true);

    // Add feedback handlers
    const feedbackBtns = explanationContainer.querySelectorAll('.besa-feedback-btn');
    feedbackBtns.forEach(btn => {
        btn.addEventListener('mousedown', (e) => {
            e.preventDefault();
            e.stopPropagation();
            handleFeedback(btn.dataset.type);
            btn.classList.add('active');
            setTimeout(() => btn.classList.remove('active'), 1000);
        }, true);
    });

    // Add close button handler
    const closeBtn = explanationContainer.querySelector('.besa-close-btn');
    closeBtn.addEventListener('mousedown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        hideExplanation();
    }, true);

    // Add click outside handler with a delay
    setTimeout(() => {
        document.addEventListener('click', handleClickOutside);
    }, 200);
}

// Function to handle keyboard shortcuts
function handleKeyboardShortcut(e) {
    if (!isFeatureEnabled || !lastSelectedText) return;

    // Only handle if no input is focused
    if (document.activeElement.tagName === 'INPUT' || 
        document.activeElement.tagName === 'TEXTAREA' ||
        document.activeElement.isContentEditable) return;

    const key = e.key.toLowerCase();
    let query = '';

    switch(key) {
        case 'e':
            query = 'explain';
            break;
        case 'w':
            query = 'rewrite';
            break;
        case 'd':
            query = 'draft';
            break;
        case 'c':
            query = 'code';
            break;
        case 'l':
            query = 'logs';
            break;
        default:
            return;
    }

    e.preventDefault();
    handleExplanationRequest(lastSelectedText, query);
}

// Function to handle text selection
function handleTextSelection(event) {
    if (!isFeatureEnabled) return;
    
    if (event.type === 'mousedown') {
        if (explanationContainer && !explanationContainer.contains(event.target)) {
            hideExplanation();
        }
        isSelecting = true;
    } else if (event.type === 'mouseup') {
        isSelecting = false;
        const selection = window.getSelection();
        const selectedText = selection.toString().trim();
        
        if (!selectedText) {
            if (explanationContainer && !explanationContainer.contains(event.target)) {
                hideExplanation();
            }
            return;
        }

        // Only show options if text is actually selected
        if (selectedText && selectedText !== lastSelectedText) {
            lastSelectedText = selectedText;
            showOptionsNearSelection(selection);
        }
    }
}

// Hide explanation
function hideExplanation() {
    if (explanationContainer) {
        document.removeEventListener('click', handleClickOutside);
        explanationContainer.remove();
        explanationContainer = null;
    }
    lastSelectedText = '';
}

// Function to handle clicks outside the explanation container
function handleClickOutside(event) {
    if (explanationContainer && !explanationContainer.contains(event.target)) {
        hideExplanation();
    }
}

// Function to make element draggable
function makeDraggable(element) {
    let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
    let isDragging = false;
    
    element.addEventListener('mousedown', dragMouseDown);

    function dragMouseDown(e) {
        // Don't initiate drag on buttons or other interactive elements
        if (e.target.tagName === 'BUTTON' || 
            e.target.closest('.besa-hotkey-option') || 
            e.target.closest('.besa-feedback-footer')) {
            return;
        }
        
        isDragging = true;
        e.preventDefault();
        pos3 = e.clientX;
        pos4 = e.clientY;
        document.addEventListener('mousemove', elementDrag);
        document.addEventListener('mouseup', closeDragElement);
        
        // Add dragging class for visual feedback
        element.classList.add('dragging');
    }

    function elementDrag(e) {
        if (!isDragging) return;
        
        e.preventDefault();
        pos1 = pos3 - e.clientX;
        pos2 = pos4 - e.clientY;
        pos3 = e.clientX;
        pos4 = e.clientY;
        
        const margin = 20; // Margin from viewport edges
        const viewportHeight = window.innerHeight;
        const viewportWidth = window.innerWidth;
        const elementHeight = element.offsetHeight;
        const elementWidth = element.offsetWidth;
        
        // Calculate new position with margins
        const newTop = element.offsetTop - pos2;
        const newLeft = element.offsetLeft - pos1;
        
        // Apply position with boundary checks
        element.style.top = `${Math.min(Math.max(margin, newTop), viewportHeight - elementHeight - margin)}px`;
        element.style.left = `${Math.min(Math.max(margin, newLeft), viewportWidth - elementWidth - margin)}px`;
    }

    function closeDragElement() {
        isDragging = false;
        document.removeEventListener('mousemove', elementDrag);
        document.removeEventListener('mouseup', closeDragElement);
        element.classList.remove('dragging');
    }
}

// Initialize
function initialize() {
    createMasterToggle();
    
    // Add event listeners
    document.addEventListener('mousedown', handleTextSelection);
    document.addEventListener('mouseup', handleTextSelection);
    document.addEventListener('keydown', handleKeyboardShortcut);
    
    // Load saved state
    chrome.storage.local.get('besaFeatureEnabled', (result) => {
        if (result.hasOwnProperty('besaFeatureEnabled')) {
            isFeatureEnabled = result.besaFeatureEnabled;
        }
    });
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize);
} else {
    initialize();
}

// Handle cleanup when extension is unloaded
window.addEventListener('beforeunload', cleanup);

// Clean up function
function cleanup() {
    hideExplanation();
    document.removeEventListener('keydown', handleKeyboardShortcut);
    document.removeEventListener('mouseup', handleTextSelection);
}

// Handle messages from background script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "scrapePageContent") {
        try {
            const content = document.body.innerText;
            const title = document.title;
            sendResponse({
                success: true,
                content: content,
                title: title
            });
        } catch (error) {
            console.error('Error scraping page:', error);
            sendResponse({
                success: false,
                error: error.message
            });
        }
    } else if (request.action === 'ping') {
        sendResponse({ success: true });
    }
    return true;
}); 