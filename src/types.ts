export interface PeerMessage {
    type: 'TRANSACTION' | 'BLOCK' | 'PEER_DISCOVERY';
    payload: any;
    sender: string;
    timestamp: number;
}

export interface KeyPair {
    publicKey: string;
    privateKey: string;
};

export interface Block {
    index: number;
    previousHash: string;
    timestamp: number;
    data: any;
    nonce: number;
    hash: string;
}
