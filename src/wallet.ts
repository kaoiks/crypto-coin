// wallet.ts
import * as crypto from 'crypto';
import { IdentityStore, StoredIdentity } from './identity-store';
import { SecureStorage } from './secure-storage';
import { generateId } from './cryptography';

export class WalletEvent {
    static readonly IDENTITY_CREATED = 'IDENTITY_CREATED';
    static readonly WALLET_LOADED = 'WALLET_LOADED';
    static readonly WALLET_CREATED = 'WALLET_CREATED';
}

export class DigitalWallet {
    private id: string;
    private identityStore: IdentityStore;
    private currentIdentity: StoredIdentity | null;
    private secureStorage: SecureStorage;
    private eventListeners: Map<string, Function[]>;
    private filePath: string;

    constructor(password: string, filePath: string) {
        // Initialize event listeners first
        this.eventListeners = new Map();
        this.filePath = filePath;
        this.secureStorage = new SecureStorage(password);
        this.currentIdentity = null;
        
        try {
            // Initialize identity store
            this.identityStore = new IdentityStore(filePath, this.secureStorage);
            const identities = this.identityStore.getAllIdentities();
            
            if (identities.length === 0) {
                // New wallet
                this.id = generateId();
                this.currentIdentity = this.identityStore.createNewIdentity('default');
                this.emit(WalletEvent.WALLET_CREATED, { id: this.id });
                console.log('Created new wallet with ID:', this.id);
            } else {
                // Existing wallet
                this.id = this.loadWalletId();
                this.currentIdentity = identities[0];
                this.emit(WalletEvent.WALLET_LOADED, { id: this.id });
                console.log('Loaded existing wallet with ID:', this.id);
            }
        } catch (error) {
            console.error('Error during wallet initialization:', error);
            throw new Error(`Failed to initialize wallet: ${error}`);
        }
    }

    private loadWalletId(): string {
        try {
            const identities = this.identityStore.getAllIdentities();
            if (identities.length > 0) {
                // Use the entire first identity ID as the wallet ID
                return identities[0].getId();
            }
            throw new Error('No identities found in wallet');
        } catch (error) {
            throw new Error(`Failed to load wallet ID: ${error}`);
        }
    }

    private emit(event: string, data: any): void {
        const listeners = this.eventListeners.get(event) || [];
        listeners.forEach(listener => {
            try {
                listener(data);
            } catch (error) {
                console.error(`Error in event listener for ${event}:`, error);
            }
        });
    }

    public addEventListener(event: string, callback: Function): void {
        if (!this.eventListeners.has(event)) {
            this.eventListeners.set(event, []);
        }
        const listeners = this.eventListeners.get(event);
        if (listeners) {
            listeners.push(callback);
        }
    }

    public removeEventListener(event: string, callback: Function): void {
        const listeners = this.eventListeners.get(event);
        if (listeners) {
            const index = listeners.indexOf(callback);
            if (index !== -1) {
                listeners.splice(index, 1);
            }
        }
    }

    public createNewIdentity(name: string = ''): void {
        try {
            const identity = this.identityStore.createNewIdentity(name);
            if (!this.currentIdentity) {
                this.currentIdentity = identity;
            }
            this.emit(WalletEvent.IDENTITY_CREATED, { identity });
            console.log(`Created new identity: ${identity.getId()} with name: ${name || 'unnamed'}`);
        } catch (error) {
            throw new Error(`Failed to create new identity: ${error}`);
        }
    }

    public listIdentities(): StoredIdentity[] {
        return this.identityStore.getAllIdentities();
    }

    public getWalletId(): string {
        return this.id;
    }

    public getFilePath(): string {
        return this.filePath;
    }

    public getCurrentIdentity(): StoredIdentity | null {
        return this.currentIdentity;
    }
}