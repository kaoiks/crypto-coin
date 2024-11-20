// network-manager.ts
import { DigitalWallet, WalletEvent } from './wallet';
import { P2PNode } from './node';
import { PeerMessage } from './types';
import * as crypto from 'crypto';

export class NetworkManager {
    private wallet?: DigitalWallet;
    private node: P2PNode;
    private isWalletNode: boolean;

    constructor(wallet?: DigitalWallet) {
        this.wallet = wallet;
        this.isWalletNode = !!wallet;
        const nodeId = wallet ? wallet.getWalletId() : crypto.randomBytes(16).toString('hex');
        this.node = new P2PNode(nodeId);
        this.setupEventListeners();
    }

    private setupEventListeners(): void {
        this.node.on('message', (message: PeerMessage) => {
            if (message.type === 'PEER_DISCOVERY') {
                this.handlePeerDiscovery(message);
            }
        });

        this.node.on('peerConnected', async ({ peerId, address }) => {
            console.log(`Connected to peer: ${peerId}`);
            
            // Only broadcast peers if we're a full node, not a wallet node
            if (!this.isWalletNode) {
                const peers = this.node.getPeersWithAddresses();
                if (peers.length > 0) {
                    this.node.broadcastMessage({
                        type: 'PEER_DISCOVERY',
                        payload: { peers },
                        sender: this.node.getId(),
                        timestamp: Date.now()
                    });
                }
            }
            
            console.log('Current peers:', this.node.getPeers());
        });

        this.node.on('peerDisconnected', ({ peerId }) => {
            console.log(`Disconnected from peer: ${peerId}`);
            console.log('Current peers:', this.node.getPeers());
        });
    }

    private async handlePeerDiscovery(message: PeerMessage): Promise<void> {
        // If this is a wallet node, don't process peer discovery
        if (this.isWalletNode) {
            return;
        }

        const { peers } = message.payload;
        
        const currentPeers = new Set(this.node.getPeers());
        const newPeers = peers.filter((peer: { id: string, address: string }) => 
            // Don't connect to wallet nodes or already connected peers
            peer.id !== this.node.getId() && 
            !currentPeers.has(peer.id) && 
            !peer.address.includes('localhost:0')
        );

        for (const peer of newPeers) {
            try {
                await this.node.connectToPeer(peer.address);
                console.log(`Connected to discovered peer: ${peer.id} at ${peer.address}`);
            } catch (error) {
                console.error(`Failed to connect to discovered peer ${peer.id}:`, error);
            }
        }
    }

    public async connectToNode(nodeAddress: string): Promise<void> {
        if (!this.wallet) {
            throw new Error('Cannot connect to node: no wallet provided');
        }
        try {
            // Don't broadcast the wallet's address to other nodes
            this.isWalletNode = true;
            await this.node.start(0); // Start on a random available port
            await this.connectToPeer(nodeAddress);
            console.log(`Wallet ${this.wallet.getWalletId()} connected to node at ${nodeAddress}`);
        } catch (error) {
            throw new Error(`Failed to connect wallet to node: ${error}`);
        }
    }

    public async start(port: number): Promise<void> {
        await this.node.start(port);
    }

    public async connectToPeer(peerAddress: string): Promise<void> {
        await this.node.connectToPeer(peerAddress);
    }

    public stop(): void {
        this.node.stop();
    }

    public getPeers(): string[] {
        return this.node.getPeers();
    }

    public isWalletConnected(): boolean {
        return !!this.wallet;
    }

    public getNodeId(): string {
        return this.node.getId();
    }
}