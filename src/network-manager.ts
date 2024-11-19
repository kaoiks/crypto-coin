// network-manager.ts
import { DigitalWallet, WalletEvent } from './wallet';
import { P2PNode } from './node';
import { PeerMessage } from './types';
import WebSocket from 'ws';

export class NetworkManager {
    private wallet: DigitalWallet;
    private socket: WebSocket | null = null;
    private currentNodeAddress: string | null = null;

    constructor(wallet: DigitalWallet) {
        this.wallet = wallet;
    }

    public async connectToNode(nodeAddress: string): Promise<void> {
        try {
            if (this.socket) {
                this.socket.close();
                this.socket = null;
            }

            this.socket = new WebSocket(nodeAddress);
            
            return new Promise((resolve, reject) => {
                if (!this.socket) {
                    reject(new Error('Socket not initialized'));
                    return;
                }

                this.socket.on('open', () => {
                    this.currentNodeAddress = nodeAddress;
                    this.setupConnection();
                    resolve();
                });

                this.socket.on('error', () => {
                    reject(new Error(`Failed to connect to node at ${nodeAddress}`));
                });

                // Set connection timeout
                setTimeout(() => {
                    if (this.socket) {
                        this.socket.close();
                    }
                    reject(new Error(`Connection timeout to node at ${nodeAddress}`));
                }, 5000);
            });
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            throw new Error(`Failed to connect to node: ${errorMessage}`);
        }
    }

    private setupConnection(): void {
        if (!this.socket) {
            throw new Error('Socket not initialized');
        }

        this.socket.on('message', (data: WebSocket.RawData) => {
            try {
                const message = JSON.parse(data.toString());
                this.handleMessage(message);
            } catch (error) {
                console.error('Error handling message:', error);
            }
        });

        this.socket.on('close', () => {
            this.currentNodeAddress = null;
            this.socket = null;
            console.log('Disconnected from node');
        });

        // Send wallet registration
        this.sendMessage({
            type: 'WALLET_REGISTRATION',
            payload: {
                walletId: this.wallet.getWalletId(),
                identity: this.wallet.getCurrentIdentity().getId()
            },
            sender: this.wallet.getWalletId(),
            timestamp: Date.now()
        });
    }

    private handleMessage(message: PeerMessage): void {
        // Handle incoming messages from the node
        console.log('Received message from node:', message);
    }

    private sendMessage(message: PeerMessage): void {
        if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
            throw new Error('Not connected to any node');
        }

        this.socket.send(JSON.stringify(message));
    }

    public async stop(): Promise<void> {
        if (this.socket) {
            this.socket.close();
            this.socket = null;
            this.currentNodeAddress = null;
        }
    }

    public isConnected(): boolean {
        return this.socket !== null && this.socket.readyState === WebSocket.OPEN;
    }

    public getCurrentNodeAddress(): string | null {
        return this.currentNodeAddress;
    }
}