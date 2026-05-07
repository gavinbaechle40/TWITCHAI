export class MessageQueue {
  constructor({ concurrency = 3, maxPending = 200 } = {}) {
    this.concurrency = concurrency;
    this.maxPending = maxPending;
    this.running = 0;
    this.queue = [];
  }

  push(task) {
    if (this.queue.length >= this.maxPending) {
      return Promise.resolve({ skipped: true, reason: 'queue_full' });
    }
    return new Promise((resolve) => {
      this.queue.push({ task, resolve });
      this.drain();
    });
  }

  async drain() {
    while (this.running < this.concurrency && this.queue.length) {
      const next = this.queue.shift();
      this.running += 1;
      Promise.resolve()
        .then(next.task)
        .then((result) => next.resolve(result))
        .catch((error) => next.resolve({ error }))
        .finally(() => {
          this.running -= 1;
          this.drain();
        });
    }
  }
}

export const messageQueue = new MessageQueue({
  concurrency: Number(process.env.MESSAGE_CONCURRENCY || 3),
  maxPending: Number(process.env.MESSAGE_QUEUE_MAX_PENDING || 200)
});
