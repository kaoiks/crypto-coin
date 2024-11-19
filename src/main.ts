// main.ts
import { P2PNode } from "./node";
import { DigitalWallet } from "./wallet";
import { generateId } from "./cryptography";
import * as fs from 'fs';
import * as path from 'path';

async function main() {
    try {
        const args = process.argv.slice(2);
        const command = args[0];

        if (command === 'node') {
            // Start a P2P node
            const port = parseInt(args[1]) || 8000;
            const peerAddress = args[2];
            
            const node = new P2PNode(generateId());
            await node.start(port);
            console.log(`P2P node started on port ${port}`);

            if (peerAddress) {
                await node.connectToPeer(peerAddress);
                console.log(`Connected to peer at ${peerAddress}`);
            }
        } 
        else if (command === 'create-wallet') {
            const password = args[1];
            if (!password) {
                console.error('Usage: npm run dev create-wallet <password>');
                process.exit(1);
            }

            const walletId = generateId();
            const walletFile = `wallet_${walletId}.json`;
            
            const wallet = new DigitalWallet(password, walletFile);
            console.log(`Created new wallet with ID: ${walletId}`);
            console.log(`Wallet file: ${walletFile}`);
            console.log('Available identities:');
            wallet.listIdentities().forEach(identity => {
                console.log(`- ${identity.getName() || 'unnamed'} (${identity.getId()})`);
            });
        }
        else if (command === 'connect-wallet') {
            const walletFile = args[1];
            const password = args[2];
            const nodeAddress = args[3];

            if (!walletFile || !password || !nodeAddress) {
                console.error('Usage: npm run dev connect-wallet <wallet-file> <password> <node-address>');
                process.exit(1);
            }

            // Check if wallet file exists
            if (!fs.existsSync(walletFile)) {
                console.error(`Wallet file ${walletFile} not found`);
                console.error('Available wallet files:');
                fs.readdirSync('.').forEach(file => {
                    if (file.startsWith('wallet_') && file.endsWith('.json')) {
                        console.error(`- ${file}`);
                    }
                });
                process.exit(1);
            }

            const wallet = new DigitalWallet(password, walletFile);
            await wallet.connectToNode(nodeAddress);
            console.log(`Wallet connected to node at ${nodeAddress}`);
            console.log('Available identities:');
            wallet.listIdentities().forEach(identity => {
                console.log(`- ${identity.getName() || 'unnamed'} (${identity.getId()})`);
            });
        }
        else if (command === 'list-wallets') {
            console.log('Available wallet files:');
            fs.readdirSync('.').forEach(file => {
                if (file.startsWith('wallet_') && file.endsWith('.json')) {
                    console.log(`- ${file}`);
                }
            });
        }
        else {
            console.error('Usage:');
            console.error('Start node: npm run dev node <port> [peer-address]');
            console.error('Create wallet: npm run dev create-wallet <password>');
            console.error('Connect wallet: npm run dev connect-wallet <wallet-file> <password> <node-address>');
            console.error('List wallets: npm run dev list-wallets');
            process.exit(1);
        }

        process.on('SIGINT', () => {
            console.log('Shutting down...');
            process.exit(0);
        });

    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
}

main().catch(console.error);