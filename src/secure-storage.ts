import { decrypt, encrypt } from "./cryptography";
import { StoredIdentity } from "./identity";

export class SecureStorage {
    private password: string;

    constructor(password: string) {
        if (!password || password.length < 8) {
            throw new Error('Password must be at least 8 characters long');
        }
        this.password = password;
    }

    public encryptIdentity(identity: StoredIdentity): string {
        const data = JSON.stringify(identity);
        return encrypt(data, this.password);
    }

    public decryptIdentity(encryptedData: string): StoredIdentity {
        const decrypted = decrypt(encryptedData, this.password);
        let data = JSON.parse(decrypted);
        let keyPair = {'publicKey': data.keyPair.publicKey, 'privateKey': data.keyPair.privateKey};
        return new StoredIdentity(data.id, keyPair, data.name);
    }
}

