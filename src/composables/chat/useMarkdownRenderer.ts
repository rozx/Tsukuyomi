import { marked } from 'marked';
import DOMPurify from 'dompurify';

marked.setOptions({
  breaks: true,
  gfm: true,
});

export const useMarkdownRenderer = () => {
  const renderMarkdown = (text: string): string => {
    if (!text) return '';
    try {
      const html = marked.parse(text) as string;
      return DOMPurify.sanitize(html, {
        ALLOWED_TAGS: [
          'p',
          'br',
          'strong',
          'em',
          'u',
          's',
          'code',
          'pre',
          'ul',
          'ol',
          'li',
          'h1',
          'h2',
          'h3',
          'h4',
          'h5',
          'h6',
          'blockquote',
          'a',
          'hr',
          'table',
          'thead',
          'tbody',
          'tr',
          'th',
          'td',
        ],
        ALLOWED_ATTR: ['href', 'title', 'alt', 'class'],
        ALLOW_DATA_ATTR: false,
      });
    } catch (error) {
      console.error('Markdown rendering error:', error);
      return DOMPurify.sanitize(text, { ALLOWED_TAGS: [] });
    }
  };

  return {
    renderMarkdown,
  };
};
