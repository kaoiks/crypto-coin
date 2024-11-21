import * as crypto from 'crypto';
import { Block } from './types';

export class Blockchain {
    private chain: Block[];
    private difficulty: number;

    constructor(difficulty: number = 4) {
        this.chain = [this.createGenesisBlock()];
        this.difficulty = difficulty;
    }

    public replaceChain(newChain: Block[]): void {
        if (newChain.length <= this.chain.length) {
            throw new Error('New chain must be longer than current chain');
        }

        // Verify the new chain
        for (let i = 1; i < newChain.length; i++) {
            if (newChain[i].previousHash !== newChain[i-1].hash) {
                throw new Error('Invalid chain continuity in new chain');
            }
        }

        // Replace the chain
        this.chain = newChain;
        console.log('Chain replaced successfully');
    }

    // Add method to get difficulty
    public getDifficulty(): number {
        return this.difficulty;
    }


    // Creates the first block in the chain
    private createGenesisBlock(): Block {
        const block: Block = {
            index: 0,
            previousHash: "0".repeat(64),
            timestamp: 1700000000000, // Fixed timestamp for genesis block
            data: "Genesis Block",
            nonce: 0,
            hash: ""
        };

        block.hash = this.calculateHash(block);
        return block;
    }

    // Calculates hash for a block using its properties
    private calculateHash(block: Block): string {
        const data = JSON.stringify({
            index: block.index,
            previousHash: block.previousHash,
            timestamp: block.timestamp,
            data: block.data,
            nonce: block.nonce
        });

        return crypto.createHash('sha256').update(data).digest('hex');
    }
    
    // Creates a new block in the chain
    public createBlock(data: string): Block {
        const previousBlock = this.getLastBlock();
        const newBlock: Block = {
            index: previousBlock.index + 1,
            previousHash: previousBlock.hash,
            timestamp: Date.now(),
            data: data,
            nonce: 0,
            hash: ""
        };

        this.mineBlock(newBlock);
        this.chain.push(newBlock);
        
        return newBlock;
    }

    // Mining implementation (Proof of Work)
    private mineBlock(block: Block): void {
        const target = "0".repeat(this.difficulty);
        
        while (true) {
            block.hash = this.calculateHash(block);
            
            // Check if hash starts with required number of zeros
            if (block.hash.substring(0, this.difficulty) === target) {
                console.log(`Block mined! Hash: ${block.hash}`);
                return;
            }
            
            block.nonce++;
        }
    }

    // Gets the last block in the chain
    public getLastBlock(): Block {
        return this.chain[this.chain.length - 1];
    }

    // Validates the entire chain
    public isValid(): boolean {
        for (let i = 1; i < this.chain.length; i++) {
            const currentBlock = this.chain[i];
            const previousBlock = this.chain[i - 1];

            if (currentBlock.hash !== this.calculateHash(currentBlock)) {
                console.log('Invalid hash');
                return false;
            }

            if (currentBlock.previousHash !== previousBlock.hash) {
                console.log('Invalid chain linkage');
                return false;
            }
        }
        return true;
    }

    // Gets the entire chain
    public getChain(): Block[] {
        return this.chain;
    }
}