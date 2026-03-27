const BASE_URL = '/api';

async function fetcher<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`);
  if (!res.ok) throw new Error(`API error: ${res.statusText}`);
  return res.json();
}

export interface Employee {
  id: string;
  slackId: string;
  name: string;
  role: string;
  createdAt: string;
  currentDay: number;
  totalDays: number;
  completedTasks: number;
  totalTasks: number;
  progress: number;
}

export interface EmployeeDetail {
  user: { id: string; slackId: string; name: string; role: string };
  currentDay: number;
  totalDays: number;
  days: Array<{
    day: number;
    tasks: Array<{
      id: string;
      title: string;
      description: string;
      completed: boolean;
      completedAt: string | null;
      resources: Array<{ label: string; type: string }>;
    }>;
  }>;
  revisionCount: number;
}

export interface Stats {
  totalEmployees: number;
  activeEmployees: number;
  completedEmployees: number;
  avgProgress: number;
  totalDocuments: number;
}

export interface Document {
  id: string;
  filename: string;
  mimeType: string;
  uploadedBy: string;
  createdAt: string;
  _count: { chunks: number };
}

export const api = {
  getEmployees: () => fetcher<Employee[]>('/employees'),
  getEmployee: (slackId: string) => fetcher<EmployeeDetail>(`/employees/${slackId}`),
  getStats: () => fetcher<Stats>('/stats'),
  getDocuments: () => fetcher<Document[]>('/documents'),
};
