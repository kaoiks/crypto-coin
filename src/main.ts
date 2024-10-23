import { NetworkManager } from "./network-manager";
import { DigitalWallet, WalletEvent } from "./wallet";

async function main() {
    try {
        const port = parseInt(process.argv[2]) || 8000;
        const peerAddress = process.argv[3];
        
        const wallet = new DigitalWallet('very-secret-password', `wallet_${port}.json`);

        // wallet.createNewIdentity('shopping');
        // wallet.createNewIdentity('business');
    
        console.log('Available identities:');
        wallet.listIdentities().forEach(identity => {
            console.log(`- ${identity.getName() || 'unnamed'} (${identity.getId()})`);
        });

        const networkManager = new NetworkManager(wallet);
        await networkManager.start(port);
        console.log(`Network started on port ${port}`);

        if (peerAddress) {
            await networkManager.connectToPeer(peerAddress);
            console.log(`Connected to peer at ${peerAddress}`);
        }

        process.on('SIGINT', () => {
            console.log('Shutting down...');
            networkManager.stop();
            process.exit(0);
        });

    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
}

main().catch(console.error);
