export interface WidgetConfig {
  apiKey: string;
  apiUrl: string;
  position?: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';
  theme?: Partial<WidgetTheme>;
  defaultFields?: {
    category?: string;
    reportedBy?: string;
  };
}

export interface WidgetTheme {
  primaryColor: string;
  textColor: string;
  backgroundColor: string;
  borderRadius: string;
  fontFamily: string;
}

export const DEFAULT_THEME: WidgetTheme = {
  primaryColor: '#6366f1',
  textColor: '#1f2937',
  backgroundColor: '#ffffff',
  borderRadius: '12px',
  fontFamily: 'system-ui, sans-serif',
};

export type IssueStatus =
  | 'open'
  | 'confirmed'
  | 'approved'
  | 'in_progress'
  | 'resolved'
  | 'closed'
  | 'reopen'
  | 'failed'
  | 'needs_info';

export interface Issue {
  id: number;
  documentId: string;
  title: string;
  description: string;
  status: IssueStatus;
  category?: string;
  reportedBy?: string;
  aiSummary?: string;
  comments?: Comment[];
  createdAt: string;
  updatedAt: string;
}

export interface Comment {
  id: number;
  body: string;
  author: string;
  isAI: boolean;
  createdAt: string;
}

export interface CreateIssuePayload {
  title: string;
  description: string;
  category?: string;
  reportedBy?: string;
  images?: File[];
}

export type WidgetView = 'form' | 'status' | 'chat';
