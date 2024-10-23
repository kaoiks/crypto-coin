import { KeyPair } from "./types";

export class StoredIdentity {
    private id: string;
    private keyPair: KeyPair;
    private name?: string;
    private createdAt: number;
    private lastUsed?: number;

    constructor(id: string, keyPair: KeyPair, name?: string, createdAt: number = Date.now(), lastUsed?: number) {
        this.id = id;
        this.keyPair = keyPair;
        this.name = name;
        this.createdAt = createdAt;
        this.lastUsed = lastUsed;
    }

    getPublicKey(): string {
        return this.keyPair.publicKey;
    }

    getPrivateKey(): string {
        return this.keyPair.privateKey;
    }

    getName(): string | undefined {
        return this.name;
    }

    getCreatedAt(): number {
        return this.createdAt;
    }
    
    getId(): string {
        return this.id;
    }

}