import OpenAI from 'openai';
// Interface for database articles
interface DatabaseArticle {
  title: string;
  content: string;
  url: string;
  lastUpdated?: Date;
}
// Interface for search results from database
interface WebSearchResult {
  title: string;
  url: string;
  excerpt: string;
  lastUpdated?: Date;
  relevanceScore: number;
}

// the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
const openai = new OpenAI({ 
  apiKey: process.env.OPENAI_API_KEY || process.env.OPENAI_KEY || 'your-openai-api-key'
});

export interface TechnicalAnalysis {
  issueDiagnosis: string;
  immediateActions: ActionItem[];
  expertRecommendations: string[];
  severity: 'low' | 'medium' | 'high' | 'critical';
  estimatedResolutionTime: string;
  followUpQuestions?: string[];
}

export interface ActionItem {
  step: string;
  description: string;
  expectedOutcome: string;
  verificationMethod: string;
  difficulty: 'easy' | 'medium' | 'advanced';
}

export interface KnowledgeBaseInsight {
  articleTitle: string;
  articleUrl: string;
  keyFinding: string;
  solution: string;
  relevanceScore: number;
  lastUpdated?: Date;
}

export interface ITSupportResponse {
  analysis: TechnicalAnalysis;
  knowledgeBaseInsights: KnowledgeBaseInsight[];
  adaptiveCardData: AdaptiveCardData;
  responseMetadata: {
    processingTime: number;
    articlesAnalyzed: number;
    confidenceScore: number;
  };
}

export interface AdaptiveCardData {
  title: string;
  subtitle: string;
  sections: AdaptiveCardSection[];
  actions: AdaptiveCardAction[];
}

export interface AdaptiveCardSection {
  type: 'diagnosis' | 'actions' | 'knowledge' | 'recommendations';
  title: string;
  content: any;
  isExpandable?: boolean;
}

export interface AdaptiveCardAction {
  type: 'button';
  title: string;
  action: string;
  style?: 'positive' | 'destructive' | 'default';
}

export class AIAnalyst {
  async analyzeIssue(
    userQuery: string,
    searchResults: WebSearchResult[],
    articleContents: DatabaseArticle[]
  ): Promise<ITSupportResponse> {
    const startTime = Date.now();

    try {
      // Generate technical analysis
      const analysis = await this.generateTechnicalAnalysis(userQuery, articleContents);
      
      // Extract knowledge base insights
      const knowledgeBaseInsights = await this.extractKnowledgeBaseInsights(
        searchResults,
        articleContents,
        userQuery
      );
      
      // Create adaptive card data
      const adaptiveCardData = this.createAdaptiveCardData(analysis, knowledgeBaseInsights);
      
      const processingTime = Date.now() - startTime;
      const confidenceScore = this.calculateConfidenceScore(analysis, knowledgeBaseInsights);

      return {
        analysis,
        knowledgeBaseInsights,
        adaptiveCardData,
        responseMetadata: {
          processingTime,
          articlesAnalyzed: articleContents.length,
          confidenceScore,
        },
      };

    } catch (error) {
      console.error('AI analysis error:', error);
      throw new Error(`AI analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async generateTechnicalAnalysis(
    userQuery: string,
    articles: any[]
  ): Promise<TechnicalAnalysis> {
    const articlesContext = articles && articles.length > 0 
      ? articles.map(article => `
Title: ${article.title || 'Untitled'}
Content: ${(article.content || '').substring(0, 1000)}...
URL: ${article.url || 'No URL'}
      `).join('\n---\n')
      : 'No relevant articles found in knowledge base.';

    const prompt = `As a senior IT support specialist, analyze this technical issue and provide comprehensive guidance.

User Issue: "${userQuery}"

Available Knowledge Base Context:
${articlesContext}

Provide a detailed technical analysis in JSON format with the following structure:
{
  "issueDiagnosis": "Expert-level technical assessment of the problem",
  "immediateActions": [
    {
      "step": "Step name",
      "description": "Detailed instructions with specific commands/actions",
      "expectedOutcome": "What should happen after this step",
      "verificationMethod": "How to confirm the step worked",
      "difficulty": "easy|medium|advanced"
    }
  ],
  "expertRecommendations": ["Professional best practices and preventive measures"],
  "severity": "low|medium|high|critical",
  "estimatedResolutionTime": "Realistic time estimate",
  "followUpQuestions": ["Questions to ask user for more context if needed"]
}

Focus on:
- Accurate technical diagnosis based on symptoms
- Step-by-step actionable solutions
- Professional troubleshooting methodology
- Best practices and preventive measures
- Clear verification steps for each action`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      temperature: 0.1,
      max_tokens: 2000,
    });

    const analysisText = response.choices[0].message.content;
    if (!analysisText) {
      throw new Error('No response from OpenAI for technical analysis');
    }

    try {
      return JSON.parse(analysisText);
    } catch (parseError) {
      console.error('Failed to parse AI analysis response:', parseError);
      throw new Error('Invalid response format from AI analysis');
    }
  }

  private async extractKnowledgeBaseInsights(
    searchResults: WebSearchResult[],
    articles: DatabaseArticle[],
    userQuery: string
  ): Promise<KnowledgeBaseInsight[]> {
    const insights: KnowledgeBaseInsight[] = [];
    
    console.log(`Extracting insights from ${searchResults.length} search results`);

    // Process search results directly since they already contain the relevant information
    for (let i = 0; i < Math.min(searchResults.length, 3); i++) {
      const searchResult = searchResults[i];

      try {
        // Create insight directly from search result without additional AI processing for faster response
        const insight: KnowledgeBaseInsight = {
          articleTitle: searchResult.title || 'Knowledge Base Article',
          articleUrl: searchResult.url,
          keyFinding: searchResult.excerpt || 'Click to view the full article for detailed instructions.',
          solution: `This article contains relevant information about: ${searchResult.title}. Please review the full article for complete troubleshooting steps.`,
          relevanceScore: searchResult.relevanceScore || 75,
          lastUpdated: searchResult.lastUpdated
        };
        
        insights.push(insight);
        console.log(`Added insight: ${insight.articleTitle}`);
        
      } catch (error) {
        console.error(`Failed to create insight from search result ${i}:`, error);
        // Continue with other articles
      }
    }

    return insights.sort((a, b) => b.relevanceScore - a.relevanceScore);
  }

  private createAdaptiveCardData(
    analysis: TechnicalAnalysis,
    insights: KnowledgeBaseInsight[]
  ): AdaptiveCardData {
    const sections: AdaptiveCardSection[] = [
      {
        type: 'diagnosis',
        title: 'Issue Diagnosed',
        content: {
          diagnosis: analysis.issueDiagnosis,
          severity: analysis.severity,
          estimatedTime: analysis.estimatedResolutionTime,
        },
      },
      {
        type: 'actions',
        title: 'Immediate Actions',
        content: {
          actions: analysis.immediateActions,
        },
      },
      {
        type: 'knowledge',
        title: 'Knowledge Base Insights',
        content: {
          insights: insights.slice(0, 3), // Top 3 insights
        },
        isExpandable: true,
      },
      {
        type: 'recommendations',
        title: 'Expert Recommendations',
        content: {
          recommendations: analysis.expertRecommendations,
        },
      },
    ];

    const actions: AdaptiveCardAction[] = [
      {
        type: 'button',
        title: 'Get Detailed Steps',
        action: 'getDetailedSteps',
        style: 'positive',
      },
      {
        type: 'button',
        title: 'More Solutions',
        action: 'moreSolutions',
        style: 'default',
      },
      {
        type: 'button',
        title: 'Follow Up',
        action: 'followUp',
        style: 'default',
      },
    ];

    return {
      title: 'IT Support Analysis',
      subtitle: `${analysis.severity.toUpperCase()} Priority • Est. ${analysis.estimatedResolutionTime}`,
      sections,
      actions,
    };
  }

  private calculateConfidenceScore(
    analysis: TechnicalAnalysis,
    insights: KnowledgeBaseInsight[]
  ): number {
    let score = 0;

    // Base score from analysis quality
    if (analysis.immediateActions.length > 0) score += 30;
    if (analysis.expertRecommendations.length > 0) score += 20;
    if (analysis.issueDiagnosis.length > 50) score += 20;

    // Score from knowledge base insights
    const avgInsightScore = insights.length > 0 
      ? insights.reduce((sum, insight) => sum + insight.relevanceScore, 0) / insights.length
      : 0;
    score += Math.min(avgInsightScore * 0.3, 30);

    return Math.min(Math.round(score), 100);
  }

  async generateDetailedSteps(
    userQuery: string,
    selectedSolution: string,
    articleContent: string
  ): Promise<string> {
    const prompt = `As a senior IT specialist, provide detailed step-by-step instructions for this solution:

User Issue: "${userQuery}"
Selected Solution: "${selectedSolution}"
Article Context: ${articleContent.substring(0, 1000)}

Provide comprehensive, numbered steps with:
- Specific commands, paths, or UI elements to click
- Expected outcomes for each step
- Verification methods
- Screenshots/visual cues where helpful
- Warning notes for critical steps
- Alternative approaches if primary method fails

Format as clear, professional technical documentation.`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.1,
      max_tokens: 1500,
    });

    return response.choices[0].message.content || 'Unable to generate detailed steps';
  }

  async generateFollowUpQuestions(
    userQuery: string,
    currentAnalysis: TechnicalAnalysis
  ): Promise<string[]> {
    const prompt = `Based on this IT support analysis, generate 3-5 relevant follow-up questions to better assist the user:

Original Issue: "${userQuery}"
Current Diagnosis: "${currentAnalysis.issueDiagnosis}"
Severity: ${currentAnalysis.severity}

Generate questions that would help:
- Narrow down the root cause
- Identify additional symptoms
- Understand user's technical environment
- Clarify implementation preferences

Return as JSON array: ["question1", "question2", ...]`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      temperature: 0.3,
      max_tokens: 300,
    });

    const responseText = response.choices[0].message.content;
    if (!responseText) return [];

    try {
      const parsed = JSON.parse(responseText);
      return Array.isArray(parsed) ? parsed : parsed.questions || [];
    } catch {
      return [];
    }
  }

  async summarizeMultipleArticles(articles: ParsedArticle[]): Promise<string> {
    if (articles.length === 0) return '';

    const articlesContent = articles.map(article => 
      `${article.title}\n${article.content.substring(0, 500)}...`
    ).join('\n---\n');

    const prompt = `Summarize the key points from these knowledge base articles into a cohesive technical overview:

${articlesContent}

Provide a structured summary covering:
- Common themes and solutions
- Key procedures mentioned across articles
- Important warnings or prerequisites
- Best practices identified

Keep it concise but comprehensive for IT support context.`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.2,
      max_tokens: 800,
    });

    return response.choices[0].message.content || 'Unable to generate summary';
  }
}

export const aiAnalyst = new AIAnalyst();
