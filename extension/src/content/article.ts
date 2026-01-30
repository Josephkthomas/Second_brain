// Article content script - extracts content from web pages

export interface ArticleData {
  type: 'article';
  url: string;
  title: string;
  content: string;
  selectedText: string | null;
  author: string | null;
  publishedDate: string | null;
  siteName: string | null;
  wordCount: number;
}

// Get meta tag content by property or name
function getMetaContent(name: string): string | null {
  const meta =
    document.querySelector(`meta[property="${name}"]`) ||
    document.querySelector(`meta[name="${name}"]`);
  return meta?.getAttribute('content') || null;
}

// Extract the main article content using various heuristics
function extractMainContent(): string {
  // Priority order for content extraction
  const contentSelectors = [
    'article',
    '[role="main"]',
    'main',
    '.post-content',
    '.article-content',
    '.entry-content',
    '.content',
    '#content',
    '.post',
    '.article',
  ];

  for (const selector of contentSelectors) {
    const element = document.querySelector(selector);
    if (element) {
      const text = cleanText(element.textContent || '');
      if (text.length > 200) {
        return text;
      }
    }
  }

  // Fallback: get body text, excluding common non-content elements
  const body = document.body.cloneNode(true) as HTMLElement;

  // Remove elements that typically don't contain main content
  const removeSelectors = [
    'script', 'style', 'nav', 'header', 'footer',
    '.nav', '.navigation', '.sidebar', '.menu',
    '.comments', '.comment', '.advertisement', '.ad',
    '[role="navigation"]', '[role="banner"]', '[role="contentinfo"]'
  ];

  removeSelectors.forEach(selector => {
    body.querySelectorAll(selector).forEach(el => el.remove());
  });

  return cleanText(body.textContent || '');
}

// Clean and normalize text
function cleanText(text: string): string {
  return text
    .replace(/\s+/g, ' ')  // Collapse whitespace
    .replace(/\n\s*\n/g, '\n\n')  // Normalize paragraphs
    .trim()
    .slice(0, 50000);  // Limit content size
}

// Get the page title
function getTitle(): string {
  // Try Open Graph title first
  const ogTitle = getMetaContent('og:title');
  if (ogTitle) return ogTitle;

  // Try the first h1
  const h1 = document.querySelector('h1');
  if (h1?.textContent?.trim()) {
    return h1.textContent.trim();
  }

  // Fall back to document title
  return document.title;
}

// Get selected text if any
function getSelectedText(): string | null {
  const selection = window.getSelection();
  const text = selection?.toString().trim();
  return text && text.length > 0 ? text : null;
}

// Count words in text
function countWords(text: string): number {
  return text.split(/\s+/).filter(word => word.length > 0).length;
}

// Check if current page is YouTube
function isYouTubePage(): boolean {
  return window.location.hostname.includes('youtube.com') &&
         window.location.pathname.includes('/watch');
}

// Get all article data
function getArticleData(): ArticleData {
  const selectedText = getSelectedText();
  const fullContent = extractMainContent();
  const content = selectedText || fullContent;

  return {
    type: 'article',
    url: window.location.href,
    title: getTitle(),
    content,
    selectedText,
    author: getMetaContent('author') || getMetaContent('article:author'),
    publishedDate: getMetaContent('article:published_time') || getMetaContent('date'),
    siteName: getMetaContent('og:site_name') || window.location.hostname,
    wordCount: countWords(content),
  };
}

// Listen for messages from the popup or background script
chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  // Don't respond if this is a YouTube video page (let youtube.ts handle it)
  if (isYouTubePage()) {
    return;
  }

  if (request.action === 'getArticleData') {
    try {
      const data = getArticleData();
      sendResponse(data);
    } catch (error) {
      console.error('Error getting article data:', error);
      sendResponse(null);
    }
    return true;
  }

  if (request.action === 'getPageType') {
    sendResponse({
      type: 'article',
      isYouTube: false
    });
    return true;
  }

  if (request.action === 'getSelectedText') {
    sendResponse({ selectedText: getSelectedText() });
    return true;
  }
});

// Log when content script loads (only if not YouTube)
if (!isYouTubePage()) {
  console.log('Synapse: Article content script loaded');
}
