import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export interface SearchKeywords {
  primary: string[];
  secondary: string[];
  context: string;
}

export class IntelligentSearchEngine {
  async extractSearchKeywords(userQuery: string): Promise<SearchKeywords> {
    // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
    const prompt = `Extract the most relevant search keywords from this IT support question. Focus on technical terms, software names, and core concepts that would appear in knowledge base articles.

User Question: "${userQuery}"

Provide keywords in JSON format:
{
  "primary": ["main technical terms", "software names", "key actions"],
  "secondary": ["related terms", "synonyms", "common variations"],
  "context": "brief description of what the user is trying to accomplish"
}

Examples:
- "How do I reset my password?" → primary: ["password", "reset", "change"], secondary: ["login", "account", "credentials"]
- "Excel won't open files" → primary: ["excel", "open", "files"], secondary: ["microsoft", "spreadsheet", "documents"]
- "VPN connection keeps dropping" → primary: ["vpn", "connection", "disconnect"], secondary: ["network", "remote", "access"]`;

    try {
      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
        temperature: 0.1,
        max_tokens: 300,
      });

      const result = response.choices[0].message.content;
      if (!result) {
        throw new Error('No response from OpenAI');
      }

      return JSON.parse(result);
    } catch (error) {
      console.error('Keyword extraction failed:', error);
      // Fallback to simple word extraction
      return this.fallbackKeywordExtraction(userQuery);
    }
  }

  private fallbackKeywordExtraction(userQuery: string): SearchKeywords {
    // Remove common words and extract meaningful terms
    const stopWords = ['how', 'do', 'i', 'can', 'to', 'the', 'a', 'an', 'is', 'are', 'was', 'were', 'my', 'me', 'you', 'your', 'it', 'this', 'that', 'with', 'for', 'on', 'at', 'by', 'from', 'of', 'in', 'and', 'or', 'but'];
    
    const words = userQuery.toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 2 && !stopWords.includes(word));

    const primary = words.slice(0, 3);
    const secondary = words.slice(3, 6);

    return {
      primary,
      secondary,
      context: `User asking about: ${userQuery}`
    };
  }

  async searchWithIntelligence(userQuery: string, client: any): Promise<any[]> {
    // Extract intelligent keywords
    const keywords = await this.extractSearchKeywords(userQuery);
    
    // Build comprehensive search query
    const allKeywords = [...keywords.primary, ...keywords.secondary];
    const searchConditions = allKeywords.map((_, index) => 
      `(LOWER(kbproduct) LIKE $${index + 1} OR LOWER(content) LIKE $${index + 1})`
    ).join(' OR ');

    const searchParams = allKeywords.map(keyword => `%${keyword.toLowerCase()}%`);

    // Advanced search with relevance scoring
    const searchQuery = `
      SELECT article_id, title, url, kbproduct, content, last_updated,
        (
          CASE 
            ${keywords.primary.map((_, index) => 
              `WHEN LOWER(kbproduct) LIKE $${index + 1} THEN ${10 - index}`
            ).join(' ')}
            ${keywords.primary.map((_, index) => 
              `WHEN LOWER(content) LIKE $${index + 1} THEN ${7 - index}`
            ).join(' ')}
            ${keywords.secondary.map((_, index) => 
              `WHEN LOWER(kbproduct) LIKE $${index + keywords.primary.length + 1} THEN ${3 - index}`
            ).join(' ')}
            ${keywords.secondary.map((_, index) => 
              `WHEN LOWER(content) LIKE $${index + keywords.primary.length + 1} THEN ${2 - index}`
            ).join(' ')}
            ELSE 0
          END
        ) as relevance_score
      FROM knowledge_base_articles 
      WHERE (${searchConditions})
        AND is_active = true
      ORDER BY relevance_score DESC, last_updated DESC
      LIMIT 5
    `;

    try {
      const result = await client.query(searchQuery, searchParams);
      console.log(`Intelligent search for "${userQuery}" found ${result.rows.length} articles using keywords:`, keywords);
      return result.rows;
    } catch (error) {
      console.error('Intelligent search failed, falling back to simple search:', error);
      
      // Fallback to simple search with primary keywords only
      const simplePattern = `%${keywords.primary[0] || userQuery.split(' ')[0]}%`;
      const fallbackResult = await client.query(`
        SELECT article_id, title, url, kbproduct, content, last_updated
        FROM knowledge_base_articles 
        WHERE (LOWER(kbproduct) LIKE $1 OR LOWER(content) LIKE $1)
          AND is_active = true
        ORDER BY 
          CASE 
            WHEN LOWER(kbproduct) LIKE $1 THEN 1
            WHEN LOWER(content) LIKE $1 THEN 2
            ELSE 3
          END
        LIMIT 5
      `, [simplePattern]);
      
      return fallbackResult.rows;
    }
  }
}

export const intelligentSearchEngine = new IntelligentSearchEngine();