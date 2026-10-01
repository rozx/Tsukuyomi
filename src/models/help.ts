export interface HelpDocument {
  id: string;
  title: string;
  file: string;
  path: string;
  category: string;
  description: string;
  categoryId?: 'guides' | 'book-details' | 'release-notes';
  sectionAliases?: Record<string, string>;
}
export interface HelpHeading {
  id: string;
  text: string;
  level: number;
}
export interface HelpContent {
  doc: HelpDocument;
  markdown: string;
  headings: HelpHeading[];
}
