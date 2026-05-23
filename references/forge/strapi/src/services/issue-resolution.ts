import type { Core } from '@strapi/strapi';
import { broadcast } from './websocket';

export async function checkIssueResolution(strapi: Core.Strapi, task: any) {
  // Get task with issue populated
  const fullTask = await strapi.documents('api::task.task').findOne({
    documentId: task.documentId,
    populate: ['issue'],
  });

  if (!fullTask?.issue) return;

  const issueDocumentId = fullTask.issue.documentId;

  // Get all tasks for this issue using nested relation filter
  const allTasks = await strapi.documents('api::task.task').findMany({
    filters: { issue: { documentId: { $eq: issueDocumentId } } },
  });

  if (allTasks.length === 0) return;

  const allDone = allTasks.every((t: any) => t.status === 'done');

  if (allDone) {
    await strapi.documents('api::issue.issue').update({
      documentId: issueDocumentId,
      data: { status: 'resolved' },
    });

    broadcast('issue:resolved', { documentId: issueDocumentId });
  }
}
