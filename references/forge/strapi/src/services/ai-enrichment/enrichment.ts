import type { Core } from '@strapi/strapi';
import { broadcast } from '../websocket';
import type { AttachmentInfo, EnrichmentResult } from './enrichment-utils';
import { callAnthropic } from './anthropic-provider';
import { callOpenAI } from './openai-provider';
import { callGemini } from './gemini-provider';

const providers: Record<string, (apiKey: string, title: string, description: string, attachments: AttachmentInfo[]) => Promise<EnrichmentResult>> = {
  anthropic: callAnthropic,
  openai: callOpenAI,
  gemini: callGemini,
};

/**
 * Resolve the API key for a given provider.
 * Priority: env var > project field (legacy).
 */
function getProviderApiKey(provider: string, project: any): string | undefined {
  const envKeys: Record<string, string> = {
    anthropic: 'ANTHROPIC_API_KEY',
    openai: 'OPENAI_API_KEY',
    gemini: 'GEMINI_API_KEY',
  };
  const envVar = envKeys[provider];
  return (envVar && process.env[envVar]) || project.providerApiKey || undefined;
}

export async function enrichIssue(strapi: Core.Strapi, issueDocumentId: string) {
  const issue = await strapi.documents('api::issue.issue').findOne({
    documentId: issueDocumentId,
    populate: ['project', 'attachments'],
  });

  if (!issue || !issue.project) {
    strapi.log.warn(`Cannot enrich issue ${issueDocumentId}: no project`);
    return;
  }

  const project = issue.project as any;
  const provider = project.defaultProvider || 'anthropic';
  const apiKey = getProviderApiKey(provider, project);

  if (!apiKey) {
    strapi.log.warn(`Cannot enrich issue ${issueDocumentId}: no ${provider} API key (set ${provider.toUpperCase()}_API_KEY env var)`);
    return;
  }

  try {
    const attachments: AttachmentInfo[] = ((issue as any).attachments || []).map((a: any) => ({
      url: a.url,
      mime: a.mime,
      name: a.name,
    }));

    const callProvider = providers[provider];
    if (!callProvider) {
      throw new Error(`Unknown provider: ${provider}`);
    }

    const result = await callProvider(apiKey, issue.title, issue.description || '', attachments);

    // Update issue with AI results (keep current status, don't transition)
    await strapi.documents('api::issue.issue').update({
      documentId: issueDocumentId,
      data: {
        aiSummary: result.aiSummary,
        aiSuggestedSolution: result.aiSuggestedSolution,
        aiAcceptanceCriteria: result.aiAcceptanceCriteria,
        aiConfidence: result.aiConfidence,
        category: result.category,
        priority: result.priority,
      },
    });

    // Post AI comment
    await strapi.documents('api::comment.comment').create({
      data: {
        body: `**AI Analysis (${provider})**\n\n**Summary:** ${result.aiSummary}\n\n**Suggested Solution:** ${result.aiSuggestedSolution}\n\n**Acceptance Criteria:**\n${(result.aiAcceptanceCriteria || []).map((c) => `- ${c}`).join('\n')}\n\n**Confidence:** ${Math.round((result.aiConfidence || 0) * 100)}%\n**Category:** ${result.category}\n**Priority:** ${result.priority}`,
        author: 'AI Assistant',
        isAI: true,
        issue: issueDocumentId,
      } as any,
    });

    broadcast('issue:updated', { documentId: issueDocumentId, ...result });
    strapi.log.info(`Issue ${issueDocumentId} AI-analyzed via ${provider}`);
  } catch (error) {
    strapi.log.error(`AI enrichment failed for issue ${issueDocumentId}: ${error}`);
    broadcast('issue:enrichment_failed', { documentId: issueDocumentId, error: String(error) });
  }
}
