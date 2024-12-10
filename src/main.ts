import { Blockchain } from "./blockchain";
import { MiningNode } from "./mining-node";
import { NetworkManager } from "./network-manager";
import { PeerMessage } from "./types";
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
            
            const wallet = new DigitalWallet(password, walletPath);
            console.log(`Loaded wallet from ${walletPath}`);
            
            const networkManager = new NetworkManager(wallet);
            await networkManager.connectToNode(nodeAddress);
            console.log(`Connected wallet to node at ${nodeAddress}`);
            
            console.log('Available identities:');
            wallet.listIdentities().forEach(identity => {
                console.log(`- ${identity.getName() || 'unnamed'} (${identity.getId()})`);
            });

            process.on('SIGINT', () => {
                console.log('Disconnecting wallet...');
                networkManager.stop();
                process.exit(0);
            });
        }
        else if (command === 'mining-node') {
            const port = parseInt(process.argv[3]);
            const walletPath = process.argv[4];
            const password = process.argv[5];
            const difficulty = parseInt(process.argv[6]) || 4;
            const peerAddress = process.argv[7];
            
            if (!port || !walletPath || !password) {
                console.error('Usage: npm run dev mining-node <port> <wallet-path> <password> [difficulty] [peer-address]');
                process.exit(1);
            }

            try {
                // Load the wallet first
                const wallet = new DigitalWallet(password, walletPath);
                console.log(`Loaded mining wallet from ${walletPath}`);
                console.log(`Mining rewards will go to: ${wallet.getCurrentIdentity()?.getPublicKey()}`);

                // Create and start mining node with wallet
                const miningNode = new MiningNode(difficulty);
                await miningNode.start(port);
                
                // Connect the wallet for mining rewards
                miningNode.connectMiningWallet(wallet);
                console.log(`Mining node started on port ${port} with difficulty ${difficulty}`);

                if (peerAddress) {
                    await miningNode.connectToPeer(peerAddress);
                    console.log(`Connected to peer at ${peerAddress}`);
                }
                
                process.on('SIGINT', () => {
                    console.log('Shutting down mining node...');
                    miningNode.stop();
                    process.exit(0);
                });
        
            } catch (error) {
                console.error('Error running mining node:', error);
                process.exit(1);
            }
        }
        else if (command === 'connect-mining-wallet') {
            const nodePort = parseInt(process.argv[3]);
            const walletPath = process.argv[4];
            const password = process.argv[5];
            
            if (!nodePort || !walletPath || !password) {
                console.error('Usage: npm run dev connect-mining-wallet <node-port> <wallet-path> <password>');
                process.exit(1);
            }

            try {
                // Load the wallet
                const wallet = new DigitalWallet(password, walletPath);
                console.log(`Loaded mining wallet from ${walletPath}`);

                // Connect to existing mining node
                const nodeAddress = `ws://localhost:${nodePort}`;
                const networkManager = new NetworkManager(wallet);
                await networkManager.connectToNode(nodeAddress);
                
                console.log(`Connected mining wallet to node at ${nodeAddress}`);
                console.log(`Mining rewards will go to: ${wallet.getCurrentIdentity()?.getPublicKey()}`);

                process.on('SIGINT', () => {
                    console.log('Disconnecting mining wallet...');
                    networkManager.stop();
                    process.exit(0);
                });

            } catch (error) {
                console.error('Error connecting mining wallet:', error);
                process.exit(1);
            }
        }
        else if (command === 'check-balance') {
            const walletPath = process.argv[3];
            const password = process.argv[4];
            const nodeAddress = process.argv[5];
            
            if (!walletPath || !password || !nodeAddress) {
                console.error('Usage: npm run dev check-balance <wallet-path> <password> <node-address>');
                process.exit(1);
            }
        
            try {
                // Load the wallet
                const wallet = new DigitalWallet(password, walletPath);
                console.log(`Loaded wallet from ${walletPath}`);
        
                // Create network manager
                const networkManager = new NetworkManager(wallet);
                
                // Setup chain sync completion handler
                let chainSynced = false;
                networkManager.getNode().on('message', async (message: PeerMessage) => {
                    if (message.type === 'CHAIN_RESPONSE' && !chainSynced) {
                        chainSynced = true;
                        
                        // Get blockchain from network manager after sync
                        const blockchain = networkManager.getBlockchain();
                        console.log('\nCurrent blockchain height:', blockchain.getChain().length);
        
                        // Get all identities and their balances
                        console.log('\nBalances for all identities in wallet:');
                        wallet.listIdentities().forEach(identity => {
                            const publicKey = identity.getPublicKey();
                            const balance = blockchain.getAccountBalance(publicKey);
                            const transactions = blockchain.getTransactionHistory(publicKey);
                            
                            console.log(`\nIdentity: ${identity.getName() || 'unnamed'} (${identity.getId()})`);
                            console.log(`Public Key: ${publicKey.slice(0, 64)}...`);
                            console.log(`Confirmed Balance: ${balance.confirmed} coins`);
                            if (balance.pending > 0) {
                                console.log(`Pending Balance: ${balance.pending} coins`);
                            }
        
                            if (transactions.length > 0) {
                                console.log('\nRecent transactions:');
                                transactions.slice(-5).forEach(tx => {
                                    const type = tx.isCoinbase ? 'Mined' : 
                                               tx.sender === publicKey ? 'Sent' : 'Received';
                                    const amount = tx.amount;
                                    const timestamp = new Date(tx.timestamp).toLocaleString();
                                    console.log(`- ${type} ${amount} coins at ${timestamp}`);
                                });
                            }
                        });
        
                        // Cleanup and exit after showing balances
                        networkManager.stop();
                        process.exit(0);
                    }
                });
        
                // Connect to node and request chain
                await networkManager.connectToNode(nodeAddress);
                console.log(`Connected to node at ${nodeAddress}`);
                console.log('Synchronizing with blockchain...');
        
                // Set a timeout in case sync never completes
                setTimeout(() => {
                    if (!chainSynced) {
                        console.error('Timeout waiting for blockchain sync');
                        networkManager.stop();
                        process.exit(1);
                    }
                }, 10000); // 10 second timeout
        
            } catch (error) {
                console.error('Error checking balance:', error);
                process.exit(1);
            }
        }

        else {
            console.error('Usage:');
            console.error('  Create wallet:         npm run dev create-wallet <password> <wallet-path>');
            console.error('  Start node:            npm run dev start-node <port> [peer-address]');
            console.error('  Connect wallet:         npm run dev connect-wallet <wallet-path> <password> <node-address>');
            console.error('  Start mining node:      npm run dev mining-node <port> <wallet-path> <password> [difficulty] [peer-address]');
            console.error('  Connect mining wallet:   npm run dev connect-mining-wallet <node-port> <wallet-path> <password>');
            console.error('  Check balance:          npm run dev check-balance <wallet-path> <password> <node-address>');
            process.exit(1);
        }
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
}

main().catch(console.error);