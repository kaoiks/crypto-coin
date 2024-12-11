import { Blockchain } from "./blockchain";
import { MiningNode } from "./mining-node";
import { NetworkManager } from "./network-manager";
import { Transaction, PeerMessage, TransactionStatus } from './types';
import * as readline from 'readline';
import { DigitalWallet, WalletEvent } from "./wallet";
import * as crypto from 'crypto';
import * as fs from 'fs';

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
        else if (command === 'send-transaction') {
            const walletPath = process.argv[3];
            const password = process.argv[4];
            const nodeAddress = process.argv[5];
            const recipientKeyPath = process.argv[6];
            
            if (!walletPath || !password || !nodeAddress || !recipientKeyPath) {
                console.error('Usage: npm run dev send-transaction <wallet-path> <password> <node-address> <recipient-key-file>');
                process.exit(1);
            }
        
            try {
                // Load recipient's public key from file
                let recipientAddress: string;
                try {
                    recipientAddress = fs.readFileSync(recipientKeyPath, 'utf8').trim();
                    
                    // Validate public key format
                    if (!recipientAddress.includes('-----BEGIN PUBLIC KEY-----') || 
                        !recipientAddress.includes('-----END PUBLIC KEY-----')) {
                        console.error('Invalid public key format in file. Must include BEGIN/END markers');
                        process.exit(1);
                    }
                } catch (error) {
                    console.error(`Error reading recipient key file: ${error}`);
                    process.exit(1);
                }
        
                // Create readline interface with visible input
                const rl = readline.createInterface({
                    input: process.stdin,
                    output: process.stdout
                });
        
                // Load the wallet
                const wallet = new DigitalWallet(password, walletPath);
                console.log(`\nLoaded wallet from ${walletPath}`);
                
                const currentIdentity = wallet.getCurrentIdentity();
                if (!currentIdentity) {
                    console.error('No active identity in wallet');
                    process.exit(1);
                }
        
                console.log('\nYour current wallet address:');
                console.log(currentIdentity.getPublicKey());
        
                console.log('\nRecipient address loaded from file:');
                console.log(recipientAddress);
        
                // Create network manager and connect
                const networkManager = new NetworkManager(wallet);
                
                // Setup chain sync completion handler
                let chainSynced = false;
                networkManager.getNode().on('message', async (message: PeerMessage) => {
                    if (message.type === 'CHAIN_RESPONSE' && !chainSynced) {
                        chainSynced = true;
                        
                        const blockchain = networkManager.getBlockchain();
                        const balance = blockchain.getAccountBalance(currentIdentity.getPublicKey());
                        
                        console.log('\nCurrent balance:', balance.confirmed, 'coins');
                        if (balance.pending > 0) {
                            console.log('Pending balance:', balance.pending, 'coins');
                        }
        
                        rl.question('\nEnter amount to send: ', async (amountStr) => {
                            const amount = parseFloat(amountStr);
                            
                            if (isNaN(amount) || amount <= 0) {
                                console.error('Invalid amount. Please enter a positive number.');
                                networkManager.stop();
                                rl.close();
                                process.exit(1);
                            }
        
                            if (amount > balance.confirmed) {
                                console.error('Insufficient balance for this transaction.');
                                networkManager.stop();
                                rl.close();
                                process.exit(1);
                            }
        
                            // Show confirmation prompt with transaction details
                            console.log('\nTransaction Details:');
                            console.log('-------------------');
                            console.log('From:   ', currentIdentity.getPublicKey());
                            console.log('To:     ', recipientAddress);
                            console.log('Amount: ', amount);
        
                            rl.question('\nConfirm transaction? (yes/no): ', async (answer) => {
                                if (answer.toLowerCase() === 'yes' || answer.toLowerCase() === 'y') {
                                    try {
                                        const transaction = wallet.createTransaction(recipientAddress, amount);
                                
                                        const message: PeerMessage = {
                                            type: 'TRANSACTION',
                                            payload: { transaction },
                                            sender: wallet.getWalletId(),
                                            timestamp: Date.now()
                                        };
                                
                                        networkManager.getNode().broadcastMessage(message);
                                        console.log(`\nTransaction ${transaction.id} sent to network`);
                                        
                                        // Cleanup and exit
                                        networkManager.stop();
                                        rl.close();
                                        process.exit(0);
                                    } catch (error) {
                                        console.error('Error sending transaction:', error);
                                        networkManager.stop();
                                        rl.close();
                                        process.exit(1);
                                    }
                                } else {
                                    console.log('Transaction cancelled');
                                    networkManager.stop();
                                    rl.close();
                                    process.exit(0);
                                }
                            });
                        });
                    }
                });
        
                // Connect to node and request chain
                await networkManager.connectToNode(nodeAddress);
                console.log(`\nConnected to node at ${nodeAddress}`);
                console.log('Synchronizing with blockchain...');
        
                // Set a timeout in case sync never completes
                setTimeout(() => {
                    if (!chainSynced) {
                        console.error('Timeout waiting for blockchain sync');
                        networkManager.stop();
                        rl.close();
                        process.exit(1);
                    }
                }, 10000); // 10 second timeout
        
            } catch (error) {
                console.error('Error setting up transaction:', error);
                process.exit(1);
            }
        }
        // In main.ts, modify the view-mempool command handler:

        else if (command === 'view-mempool') {
            const nodeAddress = process.argv[3];
            
            if (!nodeAddress) {
                console.error('Usage: npm run dev view-mempool <node-address>');
                process.exit(1);
            }
        
            try {
                const networkManager = new NetworkManager();
                let chainSynced = false;
        
                networkManager.getNode().on('message', async (message: PeerMessage) => {
                    if (message.type === 'CHAIN_RESPONSE' && !chainSynced) {
                        chainSynced = true;
                        
                        // Request mempool state after chain sync
                        const mempoolRequest: PeerMessage = {
                            type: 'MEMPOOL_REQUEST',
                            payload: {},
                            sender: networkManager.getNodeId(),
                            timestamp: Date.now()
                        };
        
                        networkManager.getNode().broadcastMessage(mempoolRequest);
                    }
                    
                    if (message.type === 'MEMPOOL_RESPONSE') {
                        const transactions: Transaction[] = message.payload.transactions;
                        
                        if (!transactions || transactions.length === 0) {
                            console.log('No pending transactions in mempool');
                        } else {
                            console.log('\nPending Transactions:');
                            transactions.forEach((tx: Transaction) => {
                                console.log(`\nTransaction ID: ${tx.id}`);
                                console.log(`From: ${tx.sender?.slice(0, 64)}...`);
                                console.log(`To: ${tx.recipient.slice(0, 64)}...`);
                                console.log(`Amount: ${tx.amount}`);
                                console.log(`Time: ${new Date(tx.timestamp).toLocaleString()}`);
                            });
                            console.log(`\nTotal pending transactions: ${transactions.length}`);
                        }
        
                        // Cleanup and exit
                        networkManager.stop();
                        process.exit(0);
                    }
                });
        
                // Start node and connect
                await networkManager.start(0); // Start on random port
                await networkManager.connectToPeer(nodeAddress);
                console.log(`Connected to node at ${nodeAddress}`);
        
                // Set a timeout
                setTimeout(() => {
                    console.error('Timeout waiting for mempool response');
                    networkManager.stop();
                    process.exit(1);
                }, 5000);
        
            } catch (error) {
                console.error('Error viewing mempool:', error);
                process.exit(1);
            }
        }
        
        else if (command === 'show-keys') {
            const walletPath = process.argv[3];
            const password = process.argv[4];
            
            if (!walletPath || !password) {
                console.error('Usage: npm run dev show-keys <wallet-path> <password>');
                process.exit(1);
            }
        
            try {
                // Load the wallet
                const wallet = new DigitalWallet(password, walletPath);
                console.log(`Loaded wallet from ${walletPath}`);
        
                // Get current identity
                const currentIdentity = wallet.getCurrentIdentity();
                if (!currentIdentity) {
                    console.error('No identity found in wallet');
                    process.exit(1);
                }
        
                console.log('\nWallet Keys:');
                console.log('=============');
                console.log('\nPublic Key (your address to receive coins):');
                // Print the public key exactly as stored, maintaining the format
                console.log(currentIdentity.getPublicKey());
                
                console.log('\nPrivate Key (keep this secret!):');
                // Print the private key exactly as stored, maintaining the format
                console.log(currentIdentity.getPrivateKey());
                
                process.exit(0);
            } catch (error) {
                console.error('Error displaying wallet keys:', error);
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
            console.error('  Send transaction:       npm run dev send-transaction <wallet-path> <password> <node-address> <recipient-address> <amount>');
            console.error('  View mempool:           npm run dev view-mempool <node-address>');
            console.error('  Show wallet keys:       npm run dev show-keys <wallet-path> <password>');
            process.exit(1);
        }
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
}

main().catch(console.error);