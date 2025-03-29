export interface PeerMessage {
    type: 'TRANSACTION' | 'BLOCK' | 'PEER_DISCOVERY' | 'CHAIN_REQUEST' | 'CHAIN_RESPONSE';
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
