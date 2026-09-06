export class VestigeContainer { [key: string]: any;
    private services = new Map<string, any>();

    register<T>(key: string, instance: T): void {
        this.services.set(key, instance);
    }

    get<T>(key: string): T {
        const service = this.services.get(key);
        if (!service) {
            throw new Error(`Service not found: ${key}`);
        }
        return service;
    }

    has(key: string): boolean {
        return this.services.has(key);
    }

    disposeAll(): void {
        for (const [key, service] of this.services.entries()) {
            if (typeof service.dispose === 'function') {
                try {
                    service.dispose();
                } catch (e) {
                    console.error(`Failed to dispose service ${key}:`, e);
                }
            }
        }
        this.services.clear();
    }
}

export const container = new VestigeContainer();
