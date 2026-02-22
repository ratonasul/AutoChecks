const QUEUE_KEY = 'autochecks-network-queue-v1';

type QueuedRequest = {
  id: string;
  url: string;
  method: string;
  headers?: Record<string, string>;
  body?: string;
  createdAt: number;
};

function readQueue(): QueuedRequest[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeQueue(queue: QueuedRequest[]) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

export function enqueueRequest(url: string, init?: RequestInit) {
  const queue = readQueue();
  const item: QueuedRequest = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    url,
    method: init?.method || 'GET',
    headers: (init?.headers as Record<string, string>) || undefined,
    body: typeof init?.body === 'string' ? init.body : undefined,
    createdAt: Date.now(),
  };
  queue.push(item);
  writeQueue(queue);
}

export async function flushQueuedRequests(): Promise<{ sent: number; failed: number }> {
  const queue = readQueue();
  if (queue.length === 0) return { sent: 0, failed: 0 };

  const remaining: QueuedRequest[] = [];
  let sent = 0;
  let failed = 0;

  for (const item of queue) {
    try {
      const response = await fetch(item.url, {
        method: item.method,
        headers: item.headers,
        body: item.body,
      });
      if (!response.ok) {
        failed += 1;
        remaining.push(item);
        continue;
      }
      sent += 1;
    } catch {
      failed += 1;
      remaining.push(item);
    }
  }

  writeQueue(remaining);
  return { sent, failed };
}

export function getQueuedRequestCount(): number {
  return readQueue().length;
}

