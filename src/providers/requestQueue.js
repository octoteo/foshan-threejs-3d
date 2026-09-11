export class RequestQueue {
  constructor(concurrency = 4) {
    this.concurrency = Math.max(1, concurrency);
    this.active = 0;
    this.pending = [];
  }

  add(task, priority = 0) {
    return new Promise((resolve, reject) => {
      this.pending.push({ task, priority, resolve, reject });
      this.pending.sort((a, b) => a.priority - b.priority);
      this.pump();
    });
  }

  pump() {
    while (this.active < this.concurrency && this.pending.length) {
      const item = this.pending.shift();
      this.active++;
      Promise.resolve()
        .then(item.task)
        .then(item.resolve, item.reject)
        .finally(() => {
          this.active--;
          this.pump();
        });
    }
  }

  clearPending() {
    const items = this.pending.splice(0);
    for (const item of items) item.reject(new DOMException('Cancelled', 'AbortError'));
  }
}

export async function retry(task, { retries = 2, baseMs = 240 } = {}) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await task(attempt);
    } catch (error) {
      lastError = error;
      if (error?.name === 'AbortError' || attempt >= retries) break;
      await new Promise(resolve => setTimeout(resolve, baseMs * (2 ** attempt)));
    }
  }
  throw lastError;
}
