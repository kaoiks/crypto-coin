// node.ts
import WebSocket from 'ws';
import { EventEmitter } from 'events';
import { PeerMessage } from './types';

interface PeerInfo {
    socket: WebSocket;
    address: string;
    listeningAddress: string;
}

export class P2PNode extends EventEmitter {
    private id: string;
    private server: WebSocket.Server | null;
    private peers: Map<string, PeerInfo>;
    private isActive: boolean;
    private port: number;

    constructor(nodeId: string) {
        super();
        this.id = nodeId;
        this.server = null;
        this.peers = new Map();
        this.isActive = false;
        this.port = 0;
    }

    private getListeningAddress(): string {
        return `ws://localhost:${this.port}`;
    }

    private handleConnection(socket: WebSocket, remoteAddress: string): void {
        // Send immediate handshake on new connection
        const handshake = {
            type: 'HANDSHAKE',
            payload: { 
                nodeId: this.id,
                listeningAddress: this.getListeningAddress()
            },
            sender: this.id,
            timestamp: Date.now()
        };
        socket.send(JSON.stringify(handshake));

        socket.on('message', (data: WebSocket.RawData) => {
            try {
                const message = JSON.parse(data.toString());
                if (message.type === 'HANDSHAKE') {
                    const peerId = message.payload.nodeId;
                    const peerListeningAddress = message.payload.listeningAddress;
                    
                    if (!this.peers.has(peerId)) {
                        this.peers.set(peerId, { 
                            socket, 
                            address: remoteAddress,
                            listeningAddress: peerListeningAddress 
                        });
                        this.emit('peerConnected', { peerId });
                        console.log(`Connected to peer: ${peerId} (listening at ${peerListeningAddress})`);
                        console.log('Current peers:', this.getPeers());

                        // Send peer list only after successful handshake
                        this.broadcastPeerDiscovery();
                    }
                } else {
                    this.handlePeerMessage(message);
                }
            } catch (error) {
                console.error('Error handling message:', error);
            }
        });

        socket.on('close', () => {
            this.peers.forEach((peerInfo, peerId) => {
                if (peerInfo.socket === socket) {
                    this.peers.delete(peerId);
                    this.emit('peerDisconnected', { peerId });
                    console.log(`Disconnected from peer: ${peerId}`);
                    console.log('Current peers:', this.getPeers());
                }
            });
        });
    }

    private handlePeerMessage(message: PeerMessage): void {
        if (message.type === 'PEER_DISCOVERY') {
            this.handlePeerDiscovery(message);
        }
        // Broadcast message to other peers
        this.broadcastToPeers(message, message.sender);
    }

    private handlePeerDiscovery(message: PeerMessage): void {
        const { peers } = message.payload;
        peers.forEach(async (peer: { id: string, listeningAddress: string }) => {
            if (peer.id !== this.id && !this.peers.has(peer.id)) {
                try {
                    console.log(`Attempting to connect to discovered peer at ${peer.listeningAddress}`);
                    await this.connectToPeer(peer.listeningAddress);
                } catch (error) {
                    console.error(`Failed to connect to discovered peer ${peer.id}:`, error);
                }
            }
        });
    }

    public async start(port: number): Promise<void> {
        if (this.isActive) {
            throw new Error('Node is already active');
        }

        try {
            this.port = port;
            this.server = new WebSocket.Server({ port });
            
            this.server.on('connection', (socket: WebSocket, request) => {
                const remoteAddress = request.socket.remoteAddress || 'unknown';
                const remotePort = request.socket.remotePort || 0;
                this.handleConnection(socket, `${remoteAddress}:${remotePort}`);
            });
            
            this.isActive = true;
            this.emit('started', { nodeId: this.id, port });
            console.log(`P2P server started on port ${port}`);
        } catch (error) {
            this.emit('error', error);
            throw error;
        }
    }

    public async connectToPeer(peerAddress: string): Promise<void> {
        // Don't connect if we're connecting to ourselves
        if (peerAddress === this.getListeningAddress()) {
            return;
        }

        // Don't connect if we already have a connection to this listening address
        const existingPeer = Array.from(this.peers.values()).find(peer => 
            peer.listeningAddress === peerAddress
        );
        
        if (existingPeer) {
            console.log(`Already connected to peer at ${peerAddress}`);
            return;
        }

        try {
            console.log(`Connecting to peer at ${peerAddress}`);
            const socket = new WebSocket(peerAddress);
            
            socket.on('open', () => {
                this.handleConnection(socket, peerAddress);
            });

            socket.on('error', (error) => {
                console.error(`Failed to connect to peer ${peerAddress}:`, error);
                socket.close();
            });

        } catch (error) {
            console.error(`Error connecting to peer ${peerAddress}:`, error);
            throw error;
        }
    }

    private broadcastToPeers(message: PeerMessage, excludePeerId?: string): void {
        const messageString = JSON.stringify(message);
        this.peers.forEach((peerInfo, peerId) => {
            if (peerId !== excludePeerId && peerInfo.socket.readyState === WebSocket.OPEN) {
                try {
                    peerInfo.socket.send(messageString);
                } catch (error) {
                    console.error(`Error broadcasting to peer ${peerId}:`, error);
                }
            }
        });
    }

    private broadcastPeerDiscovery(): void {
        const message: PeerMessage = {
            type: 'PEER_DISCOVERY',
            payload: {
                peers: this.getPeersWithAddresses()
            },
            sender: this.id,
            timestamp: Date.now()
        };
        this.broadcastToPeers(message);
    }

    public getPeers(): string[] {
        return Array.from(this.peers.keys());
    }

    public getPeersWithAddresses(): Array<{ id: string, listeningAddress: string }> {
        return Array.from(this.peers.entries()).map(([id, info]) => ({
            id,
            listeningAddress: info.listeningAddress
        }));
    }

    public stop(): void {
        this.isActive = false;
        this.peers.forEach((peerInfo, peerId) => {
            try {
                peerInfo.socket.close();
            } catch (error) {
                console.error(`Error closing connection to peer ${peerId}:`, error);
            }
        });
        this.peers.clear();
        
        if (this.server) {
            this.server.close();
            this.server = null;
        }
        
        this.emit('stopped', { nodeId: this.id });
        console.log('Node stopped');
    }
}