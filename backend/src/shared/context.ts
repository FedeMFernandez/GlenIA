export class Context {
  private readonly registry = new Map<string, unknown>();

  public register<T>(key: string, value: T): void {
    this.registry.set(key, value);
  }

  public resolve<T>(key: string): T {
    if (!this.registry.has(key)) {
      throw new Error(`Dependency not registered for key: ${key}`);
    }
    return this.registry.get(key) as T;
  }

  public has(key: string): boolean {
    return this.registry.has(key);
  }
}
