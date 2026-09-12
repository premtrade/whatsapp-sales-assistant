type CircuitState = 'closed' | 'open' | 'half_open';

interface CircuitBreakerStats {
  state: CircuitState;
  failures: number;
  successes: number;
  consecutiveFailures: number;
  lastFailureTime: number;
  totalCalls: number;
}

class CircuitBreaker {
  private state: CircuitState = 'closed';
  private failureCount = 0;
  private successCount = 0;
  private lastFailureTime = 0;
  private nextAttempt = 0;
  private threshold: number;
  private timeout: number;
  private resetTimeout: number;
  private name: string;

  constructor(options: { threshold?: number; timeout?: number; resetTimeout?: number; name?: string } = {}) {
    this.threshold = options.threshold ?? 5;
    this.timeout = options.timeout ?? 10000;
    this.resetTimeout = options.resetTimeout ?? 30000;
    this.name = options.name ?? 'default';
  }

  async execute<T>(fn: () => Promise<T>, fallback?: () => Promise<T>): Promise<T> {
    const isOpen = this.state === 'open';

    if (isOpen) {
      if (Date.now() < this.nextAttempt) {
        if (fallback) {
          return fallback();
        }
        throw new Error(`Circuit breaker ${this.name} is OPEN`);
      }
      this.state = 'half_open';
    }

    try {
      const result = await Promise.race([
        fn(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(`${this.name} timeout after ${this.timeout}ms`)), this.timeout)
        ),
      ]);

      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      if (fallback && this.state === 'open') {
        return fallback();
      }
      throw error;
    }
  }

  private onSuccess(): void {
    this.successCount++;
    this.failureCount = 0;
    this.state = 'closed';
  }

  private onFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.failureCount >= this.threshold) {
      this.state = 'open';
      this.nextAttempt = Date.now() + this.resetTimeout;
    }
  }

  getStats(): CircuitBreakerStats {
    return {
      state: this.state,
      failures: this.failureCount,
      successes: this.successCount,
      consecutiveFailures: this.failureCount,
      lastFailureTime: this.lastFailureTime,
      totalCalls: this.successCount + this.failureCount,
    };
  }

  reset(): void {
    this.state = 'closed';
    this.failureCount = 0;
    this.successCount = 0;
    this.lastFailureTime = 0;
    this.nextAttempt = 0;
  }
}

export const groqCircuitBreaker = new CircuitBreaker({
  threshold: 5,
  timeout: 15000,
  resetTimeout: 60000,
  name: 'groq',
});

export const huggingFaceCircuitBreaker = new CircuitBreaker({
  threshold: 3,
  timeout: 20000,
  resetTimeout: 60000,
  name: 'huggingface',
});

export const wahaCircuitBreaker = new CircuitBreaker({
  threshold: 5,
  timeout: 10000,
  resetTimeout: 30000,
  name: 'waha',
});

export { CircuitBreaker, type CircuitBreakerStats };
