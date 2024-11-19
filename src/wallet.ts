import * as crypto from 'crypto';
import { EventEmitter } from 'events';
import { IdentityStore, StoredIdentity } from './identity-store';
import { SecureStorage } from './secure-storage';
import { generateId } from './cryptography';
import { NetworkManager } from './network-manager';

export class WalletEvent {
    static readonly IDENTITY_CREATED = 'IDENTITY_CREATED';
    static readonly CONNECTED_TO_NODE = 'CONNECTED_TO_NODE';
    static readonly DISCONNECTED_FROM_NODE = 'DISCONNECTED_FROM_NODE';
}

export class DigitalWallet extends EventEmitter {
    private id = crypto.randomBytes(16).toString('hex');
    private identityStore: IdentityStore;
    private currentIdentity: StoredIdentity;
    private secureStorage: SecureStorage;
    private networkManager: NetworkManager | null = null;

    constructor(password: string, storeFile: string = 'identities.json') {
        super();
        this.secureStorage = new SecureStorage(password);
        this.identityStore = new IdentityStore(storeFile, this.secureStorage);
        
        const identities = this.identityStore.getAllIdentities();
        if (identities.length === 0) {
            this.currentIdentity = this.identityStore.createNewIdentity('default');
            console.log('Created default identity for new wallet');
        } else {
            this.currentIdentity = identities[0];
            console.log('Loaded existing identity for wallet');
        }
    }

    public async connectToNode(nodeAddress: string): Promise<void> {
        try {
            if (this.networkManager) {
                await this.networkManager.stop();
            }

            this.networkManager = new NetworkManager(this);
            await this.networkManager.connectToNode(nodeAddress);
            this.emit(WalletEvent.CONNECTED_TO_NODE, { nodeAddress });
            console.log(`Wallet connected to node at ${nodeAddress}`);
        } catch (error) {
            console.error('Failed to connect to node:', error);
            throw error;
        }
    }

    public async disconnectFromNode(): Promise<void> {
        if (this.networkManager) {
            await this.networkManager.stop();
            this.networkManager = null;
            this.emit(WalletEvent.DISCONNECTED_FROM_NODE);
            console.log('Wallet disconnected from node');
        }
    }

    public isConnectedToNode(): boolean {
        return this.networkManager !== null && this.networkManager.isConnected();
    }

    public getCurrentNodeAddress(): string | null {
        return this.networkManager?.getCurrentNodeAddress() || null;
    }

    public createNewIdentity(name: string = ''): StoredIdentity {
        const identity = this.identityStore.createNewIdentity(name);
        this.emit(WalletEvent.IDENTITY_CREATED, { identity });
        return identity;
    }

    public listIdentities(): StoredIdentity[] {
        return this.identityStore.getAllIdentities();
    }

    public getWalletId(): string {
        return this.id;
    }

    public getCurrentIdentity(): StoredIdentity {
        return this.currentIdentity;
    }
}