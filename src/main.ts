import { NetworkManager } from "./network-manager";
import { DigitalWallet, WalletEvent } from "./wallet";

async function main() {
    try {
        const command = process.argv[2];
        
        if (command === 'create-wallet') {
            const password = process.argv[3];
            const walletPath = process.argv[4];
            
            if (!password || !walletPath) {
                console.error('Usage: npm run dev create-wallet <password> <wallet-path>');
                process.exit(1);
            }
            
            const wallet = new DigitalWallet(password, walletPath);
            console.log(`Created new wallet at ${walletPath}`);
            
            // Create default identity
            wallet.createNewIdentity('default');
            console.log('Created default identity');
            
            console.log('Available identities:');
            wallet.listIdentities().forEach(identity => {
                console.log(`- ${identity.getName() || 'unnamed'} (${identity.getId()})`);
            });
            
            console.log(`Wallet ID: ${wallet.getWalletId()}`);
        }
        else if (command === 'start-node') {
            const port = parseInt(process.argv[3]);
            
            if (!port) {
                console.error('Usage: npm run dev start-node <port> [peer-address]');
                process.exit(1);
            }
            
            const peerAddress = process.argv[4];
            const networkManager = new NetworkManager();
            await networkManager.start(port);
            console.log(`Network node started on port ${port}`);

            if (peerAddress) {
                await networkManager.connectToPeer(peerAddress);
                console.log(`Connected to peer at ${peerAddress}`);
            }

            // Handle shutdown
            process.on('SIGINT', () => {
                console.log('Shutting down node...');
                networkManager.stop();
                process.exit(0);
            });
        }
        else if (command === 'connect-wallet') {
            const walletPath = process.argv[3];
            const password = process.argv[4];
            const nodeAddress = process.argv[5];
            
            if (!walletPath || !password || !nodeAddress) {
                console.error('Usage: npm run dev connect-wallet <wallet-path> <password> <node-address>');
                process.exit(1);
            }
            
            // Load existing wallet
            const wallet = new DigitalWallet(password, walletPath);
            console.log(`Loaded wallet from ${walletPath}`);
            
            // Connect to node
            const networkManager = new NetworkManager(wallet);
            await networkManager.connectToNode(nodeAddress);
            console.log(`Connected wallet to node at ${nodeAddress}`);
            
            console.log('Available identities:');
            wallet.listIdentities().forEach(identity => {
                console.log(`- ${identity.getName() || 'unnamed'} (${identity.getId()})`);
            });

            // Handle shutdown
            process.on('SIGINT', () => {
                console.log('Disconnecting wallet...');
                networkManager.stop();
                process.exit(0);
            });
        }
        else {
            console.error('Usage:');
            console.error('  Create wallet: npm run dev create-wallet <password> <wallet-path>');
            console.error('  Start node:    npm run dev start-node <port> [peer-address]');
            console.error('  Connect wallet: npm run dev connect-wallet <wallet-path> <password> <node-address>');
            process.exit(1);
        }
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
}

main().catch(console.error);