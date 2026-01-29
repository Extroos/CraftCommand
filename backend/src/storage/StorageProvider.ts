
export interface StorageProvider<T extends { id: string }> {
    init(): void;
    findAll(): T[];
    findById(id: string): T | undefined;
    findOne(criteria: Partial<T>): T | undefined;
    create(item: T): T;
    update(id: string, updates: Partial<T>): T | null;
    delete(id: string): boolean;
}
