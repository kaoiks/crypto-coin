// network-manager.ts
import { DigitalWallet, WalletEvent } from './wallet';
import { P2PNode } from './node';
import { PeerMessage } from './types';
import * as crypto from 'crypto';

export class NetworkManager {
    private wallet?: DigitalWallet;
    private node: P2PNode;
    private isWalletNode: boolean;
    private knownPeers: Set<string>;
    private walletConnections: Set<string>; // Track wallet connections separately

    constructor(wallet?: DigitalWallet) {
        this.wallet = wallet;
        this.isWalletNode = !!wallet;
        const nodeId = wallet ? wallet.getWalletId() : crypto.randomBytes(16).toString('hex');
        this.node = new P2PNode(nodeId);
        this.knownPeers = new Set();
        this.walletConnections = new Set();
        this.setupEventListeners();
    }

    private setupEventListeners(): void {
        this.node.on('message', (message: PeerMessage) => {
            if (message.type === 'PEER_DISCOVERY') {
                this.handlePeerDiscovery(message);
            }
        });

        this.node.on('peerConnected', async ({ peerId, address }) => {
            // Check if this is a wallet connection (port 0)
            const isWalletConnection = address.includes('localhost:0');
            
            if (isWalletConnection) {
                this.walletConnections.add(peerId);
                console.log(`Wallet connected: ${peerId}`);
            } else {
                console.log(`Peer connected: ${peerId}`);
                
                // Only broadcast if it's a regular peer (not a wallet) and we haven't processed it
                if (!this.isWalletNode && !this.knownPeers.has(peerId)) {
                    this.knownPeers.add(peerId);
                    
                    const newPeer = {
                        id: peerId,
                        address: address
                    };

                    this.node.broadcastMessage({
                        type: 'PEER_DISCOVERY',
                        payload: { peers: [newPeer] },
                        sender: this.node.getId(),
                        timestamp: Date.now()
                    });
                }
            }
            
            // Only show actual peers in the peer list, not wallets
            console.log('Current peers:', this.getPeers());
            if (this.walletConnections.size > 0) {
                console.log('Connected wallets:', Array.from(this.walletConnections));
            }
        });

        this.node.on('peerDisconnected', ({ peerId }) => {
            if (this.walletConnections.has(peerId)) {
                this.walletConnections.delete(peerId);
                console.log(`Wallet disconnected: ${peerId}`);
            } else {
                this.knownPeers.delete(peerId);
                console.log(`Peer disconnected: ${peerId}`);
            }
            console.log('Current peers:', this.getPeers());
            if (this.walletConnections.size > 0) {
                console.log('Connected wallets:', Array.from(this.walletConnections));
            }
        });
    }

    private async handlePeerDiscovery(message: PeerMessage): Promise<void> {
        if (this.isWalletNode) {
            return;
        }

        const { peers } = message.payload;
        
        for (const peer of peers) {
            // Skip wallets, known peers, and self
            if (this.knownPeers.has(peer.id) || 
                peer.id === this.node.getId() || 
                peer.address.includes('localhost:0')) {
                continue;
            }

            try {
                this.knownPeers.add(peer.id);
                await this.node.connectToPeer(peer.address);
                console.log(`Connected to discovered peer: ${peer.id} at ${peer.address}`);
            } catch (error) {
                this.knownPeers.delete(peer.id);
                console.error(`Failed to connect to discovered peer ${peer.id}:`, error);
            }
        }
    }

    public getPeers(): string[] {
        // Filter out wallet connections from peer list
        return this.node.getPeers().filter(peerId => !this.walletConnections.has(peerId));
    }

    public getConnectedWallets(): string[] {
        return Array.from(this.walletConnections);
    }

    public async start(port: number): Promise<void> {
        await this.node.start(port);
    }

    public async connectToPeer(peerAddress: string): Promise<void> {
        await this.node.connectToPeer(peerAddress);
    }

    public async connectToNode(nodeAddress: string): Promise<void> {
        if (!this.wallet) {
            throw new Error('Cannot connect to node: no wallet provided');
        }
        try {
            this.isWalletNode = true;
            await this.node.start(0);
            await this.connectToPeer(nodeAddress);
            console.log(`Wallet ${this.wallet.getWalletId()} connected to node at ${nodeAddress}`);
        } catch (error) {
            throw new Error(`Failed to connect wallet to node: ${error}`);
        }
    }

    public stop(): void {
        this.node.stop();
        this.knownPeers.clear();
        this.walletConnections.clear();
    }

    public isWalletConnected(): boolean {
        return !!this.wallet;
    }

    public getNodeId(): string {
        return this.node.getId();
    }
}