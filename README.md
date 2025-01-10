# BESA - Browser Extension for Smart Assistance

BESA helps you understand complex text by providing instant, AI-powered explanations when you select text on any webpage.

## Features
- Instant text explanations
- Smart page summarization
- Movable explanation window
- Privacy-focused design
- No user tracking

## Permissions Explained

### Storage Permission
The storage permission is required for:
1. Saving user preferences (toggle state for the extension)
2. Temporarily storing selected text for processing
3. Maintaining extension state between page reloads
4. Managing the floating button position
5. Caching recent explanations to reduce API calls

All stored data is:
- Temporary and cleared when the extension is closed
- Never contains personal information
- Only contains user-selected text and preferences
- Automatically managed with size limits
- Not shared with third parties

### Remote Code (API) Usage
Our extension uses a secure API endpoint (https://app.trybesa.com) for text processing because:
1. AI models require significant computational resources not available in browser
2. Models need to be regularly updated to improve accuracy
3. Processing complex language tasks locally would impact browser performance
4. Centralized API allows us to monitor and prevent misuse
5. Updates to explanation algorithms can be deployed without extension updates

Security measures for API usage:
- HTTPS-only connections
- Rate limiting to prevent abuse
- No user identification data transmitted
- Minimal data transfer (only selected text)
- Immediate response disposal

## Version
1.0.0

## Support
For support, please contact: hello@trybesa.com 