import WebSocket from 'ws';
import { EventEmitter } from 'events';
import { PeerMessage } from './types';

export class P2PNode extends EventEmitter {
    private id: string;
    private server: WebSocket.Server | null;
    private peers: Map<string, WebSocket>;
    private isActive: boolean;

    constructor(nodeId: string) {
        super();
        this.id = nodeId;
        this.server = null;
        this.peers = new Map();
        this.isActive = false;
    }

    public async start(port: number): Promise<void> {
        if (this.isActive) {
            throw new Error('Node is already active');
        }

        try {
            this.server = new WebSocket.Server({ port });
            
            this.server.on('connection', (socket: WebSocket) => {
                this.handleConnection(socket);
            });
            this.isActive = true;
            this.emit('started', { nodeId: this.id, port });
            console.log(`P2P server started on port ${port}`);
        } catch (error) {
            this.emit('error', error);
            throw error;
        }
    }

    // Handle initial connection
    private handleConnection(socket: WebSocket) {
        socket.on('message', (data: WebSocket.RawData) => {
            try {
                const message = JSON.parse(data.toString());
                if (message.type === 'HANDSHAKE') {
                    const peerId = message.payload.nodeId;
                    this.peers.set(peerId, socket);
                    this.emit('peerConnected', { peerId });
                    console.log(`Peer connected: ${peerId}`);
                } else {
                    this.emit('message', message);
                }
            } catch (error) {
                console.error('Error handling message:', error);
            }
        });

        socket.on('close', () => {
            this.peers.forEach((ws, peerId) => {
                if (ws === socket) {
                    this.peers.delete(peerId);
                    this.emit('peerDisconnected', { peerId });
                    console.log(`Peer disconnected: ${peerId}`);
                }
            });
        });

        const handshake = {
            type: 'HANDSHAKE',
            payload: { nodeId: this.id },
            sender: this.id,
            timestamp: Date.now()
        };
        socket.send(JSON.stringify(handshake));
    }
    
    // Connect to a peer
    public async connectToPeer(peerAddress: string): Promise<void> {
        try {
            const socket = new WebSocket(peerAddress);
            
            socket.on('open', () => {
                this.handleConnection(socket);
            });

            socket.on('error', (error) => {
                console.error(`Failed to connect to peer ${peerAddress}:`, error);
                this.emit('error', error);
            });

        } catch (error) {
            this.emit('error', error);
            throw error;
        }
    }

    // Broadcast a message to all connected peers
    public broadcastMessage(message: PeerMessage): void {
        if (!this.isActive) {
            throw new Error('Node is not active');
        }

        const messageString = JSON.stringify({
            ...message,
            sender: this.id,
            timestamp: Date.now()
        });

        this.peers.forEach((socket, peerId) => {
            try {
                if (socket.readyState === WebSocket.OPEN) {
                    socket.send(messageString);
                }
            } catch (error) {
                console.error(`Error broadcasting to peer ${peerId}:`, error);
                this.emit('error', { error, peerId });
            }
        });
    }

    // Stop the node
    public stop(): void {
        this.isActive = false;
        this.peers.forEach((socket, peerId) => {
            socket.close();
            console.log(`Disconnecting from peer ${peerId}`);
        });
        this.peers.clear();
        
        if (this.server) {
            this.server.close();
            this.server = null;
        }
        
        this.emit('stopped', { nodeId: this.id });
    }

    // Get a list of connected peers
    public getPeers(): string[] {
        return Array.from(this.peers.keys());
    }
}