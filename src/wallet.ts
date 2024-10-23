import * as crypto from 'crypto';

import { IdentityStore, StoredIdentity } from './identity-store';
import { SecureStorage } from './secure-storage';
import { generateId } from './cryptography';

export class WalletEvent {
    static readonly IDENTITY_CREATED = 'IDENTITY_CREATED';
}

export class DigitalWallet {
    private id = crypto.randomBytes(16).toString('hex');
    private identityStore: IdentityStore;
    private currentIdentity: StoredIdentity;
    private secureStorage: SecureStorage;
    private eventListeners: Map<string, Function[]>;

    constructor(password: string, storeFile: string = 'identities.json') {
        this.secureStorage = new SecureStorage(password);
        this.identityStore = new IdentityStore(storeFile, this.secureStorage);
        this.currentIdentity = this.identityStore.getAllIdentities()[0];
        this.eventListeners = new Map();
    }

    // public createNewIdentity(name: string = ''): string {
    //     this.currentIdentity = this.identityStore.createNewIdentity(name);

    //     this.storeCurrentIdentity(name);
    //     return this.currentIdentity.getPublicKey();
    // }

    public createNewIdentity(name: string = ''): void {
        this.identityStore.createNewIdentity(name);
    }
    public listIdentities(): StoredIdentity[] {
        return this.identityStore.getAllIdentities();
    }

    public addEventListener(event: string, callback: Function) {
        if (!this.eventListeners.has(event)) {
            this.eventListeners.set(event, []);
        }
        this.eventListeners.get(event)?.push(callback);
    }

    private emitEvent(event: string, data: any) {
        const listeners = this.eventListeners.get(event) || [];
        listeners.forEach(callback => callback(data));
    }

    public getWalletId(): string {
        return this.id;
    }
    
}