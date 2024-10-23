import * as fs from 'fs';
import * as path from 'path';
import { StoredIdentity } from './identity';
import { SecureStorage } from './secure-storage';
import {createKeyPair, generateId} from './cryptography';

export class IdentityStore {
    private storePath: string;
    private identities: Map<string, StoredIdentity>;
    private secureStorage: SecureStorage;

    constructor(storePath: string = 'identities.json', secureStorage: SecureStorage) {
        this.storePath = path.resolve(process.cwd(), storePath);
        this.identities = new Map();
        this.secureStorage = secureStorage;
        this.loadIdentities();
    }

    private loadIdentities(): void {
        try {
            if (fs.existsSync(this.storePath)) {
                const data = fs.readFileSync(this.storePath, 'utf8');
                const encryptedIdentities: string[] = JSON.parse(data);
                encryptedIdentities.forEach(encryptedIdentity => {
                    const identity = this.secureStorage.decryptIdentity(encryptedIdentity);
                    this.identities.set(identity.getId(), identity);
                });
                console.log(`Loaded ${this.identities.size} identities from store`);
            } else {
                console.log('Creating default identity');
                this.createNewIdentity('default');
            }
        } catch (error) {
            console.error('Error loading identities:', error);
        }
    }

    
    private saveIdentities(): void {
        try {
            const identitiesArray = Array.from(this.identities.values());
            const encryptedData = identitiesArray.map(identity => this.secureStorage.encryptIdentity(identity));
            fs.writeFileSync(this.storePath, JSON.stringify(encryptedData, null, 2));
        } catch (error) {
            console.error('Error saving identities:', error);
            throw new Error('Failed to save identities');
        }
    }

    public addIdentity(identity: StoredIdentity): void {
        this.identities.set(identity.getId(), identity);
        this.saveIdentities();
    }

    public getIdentity(id: string): StoredIdentity | undefined {
        return this.identities.get(id);
    }

    public createNewIdentity(name: string): StoredIdentity {
        let keyPair = createKeyPair();

        const identity = new StoredIdentity(generateId(), keyPair, name);
        this.addIdentity(identity);
        return identity;
    }

    public getAllIdentities(): StoredIdentity[] {
        return Array.from(this.identities.values());
    }

}
export { StoredIdentity };

