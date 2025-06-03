import * as bitcoin from 'bitcoinjs-lib';
import * as crypto from 'crypto';
import { bech32m } from 'bech32';

function reverseBuffer(buffer) {
    return Buffer.from(buffer).reverse();
}

function calculateTxid(tx) {
    // Create a new transaction without witness data
    const txWithoutWitness = new bitcoin.Transaction();
    txWithoutWitness.version = tx.version;
    txWithoutWitness.locktime = tx.locktime;
    
    // Copy inputs without witness data
    txWithoutWitness.ins = tx.ins.map(input => ({
        hash: input.hash,
        index: input.index,
        sequence: input.sequence,
        script: input.script,
        witness: [] // Empty witness array
    }));
    
    // Copy outputs
    txWithoutWitness.outs = tx.outs;
    
    // Get the transaction buffer without witness data
    const txBuffer = txWithoutWitness.toBuffer();
    
    // Calculate double SHA256
    const hash = crypto.createHash('sha256').update(txBuffer).digest();
    const doubleHash = crypto.createHash('sha256').update(hash).digest();
    
    // Reverse the bytes for display
    return reverseBuffer(doubleHash).toString('hex');
}

function decodeOutputScript(script) {
    try {
        // Check if it's a P2PKH script (OP_DUP OP_HASH160 <20 bytes> OP_EQUALVERIFY OP_CHECKSIG)
        if (script.length === 25 && 
            script[0] === 0x76 && // OP_DUP
            script[1] === 0xa9 && // OP_HASH160
            script[2] === 0x14 && // 20 bytes
            script[23] === 0x88 && // OP_EQUALVERIFY
            script[24] === 0xac) { // OP_CHECKSIG
            
            // Extract the public key hash (20 bytes after OP_HASH160)
            const pubKeyHash = script.slice(3, 23);
            
            // Create P2PKH address
            const address = bitcoin.address.toBase58Check(pubKeyHash, 0x00); // 0x00 is mainnet
            
            return {
                type: 'P2PKH',
                address: address,
                script: script.toString('hex')
            };
        }
        
        // Check if it's a P2SH script (OP_HASH160 <20 bytes> OP_EQUAL)
        if (script.length === 23 && 
            script[0] === 0xa9 && // OP_HASH160
            script[1] === 0x14 && // 20 bytes
            script[22] === 0x87) { // OP_EQUAL
            
            // Extract the script hash (20 bytes after OP_HASH160)
            const scriptHash = script.slice(2, 22);
            
            // Create P2SH address
            const address = bitcoin.address.toBase58Check(scriptHash, 0x05); // 0x05 is P2SH mainnet
            
            return {
                type: 'P2SH',
                address: address,
                script: script.toString('hex')
            };
        }
        
        // Check if it's a P2WPKH script (OP_0 <20 bytes>)
        if (script.length === 22 && 
            script[0] === 0x00 && // OP_0
            script[1] === 0x14) { // 20 bytes
            
            // Extract the public key hash (20 bytes after OP_0)
            const pubKeyHash = script.slice(2, 22);
            
            // Create P2WPKH address
            const address = bitcoin.address.toBech32(pubKeyHash, 0x00, 'bc'); // 0x00 is mainnet, 'bc' is mainnet prefix
            
            return {
                type: 'P2WPKH',
                address: address,
                script: script.toString('hex')
            };
        }
        
        // Check if it's a P2WSH script (OP_0 <32 bytes>)
        if (script.length === 34 && 
            script[0] === 0x00 && // OP_0
            script[1] === 0x20) { // 32 bytes
            
            // Extract the script hash (32 bytes after OP_0)
            const scriptHash = script.slice(2, 34);
            
            // Create P2WSH address
            const address = bitcoin.address.toBech32(scriptHash, 0x00, 'bc'); // 0x00 is mainnet, 'bc' is mainnet prefix
            
            return {
                type: 'P2WSH',
                address: address,
                script: script.toString('hex')
            };
        }

        // Check if it's a P2TR script (OP_1 <32 bytes>)
        if (script.length === 34 && 
            script[0] === 0x51 && // OP_1
            script[1] === 0x20) { // 32 bytes
            
            // Extract the taproot output key (32 bytes after OP_1)
            const taprootKey = script.slice(2, 34);
            
            // Create P2TR address using bech32m
            const words = bech32m.toWords(taprootKey);
            const address = bech32m.encode('bc', [0x01, ...words], 0);
            
            return {
                type: 'P2TR',
                address: address,
                script: script.toString('hex')
            };
        }
        
        // If not a recognized script type, return just the script
        return {
            type: 'unknown',
            script: script.toString('hex')
        };
    } catch (error) {
        return {
            type: 'error',
            script: script.toString('hex'),
            error: error.message
        };
    }
}

function decodeWitnessScript(witness) {
    if (witness.length === 0) return null;
    
    // For P2WPKH, witness should be [signature, pubkey]
    if (witness.length === 2) {
        const pubkey = witness[1];
        // Calculate P2WPKH address from pubkey
        const pubkeyHash = crypto.createHash('sha256').update(pubkey).digest();
        const ripemd160Hash = crypto.createHash('ripemd160').update(pubkeyHash).digest();
        const address = bitcoin.address.toBech32(ripemd160Hash, 0x00, 'bc');
        
        return {
            type: 'P2WPKH',
            signature: witness[0].toString('hex'),
            pubkey: pubkey.toString('hex'),
            address: address
        };
    }
    
    // For P2WSH, witness should be [signature(s), script]
    if (witness.length >= 2) {
        const script = witness[witness.length - 1];
        const signatures = witness.slice(0, -1).map(w => w.toString('hex'));
        
        return {
            type: 'P2WSH',
            signatures: signatures,
            redeemScript: script.toString('hex')
        };
    }
    
    return {
        type: 'unknown',
        witness: witness.map(w => w.toString('hex'))
    };
}

function decodeInputScript(script) {
    try {
        // Decompile the script into stack items
        const chunks = bitcoin.script.decompile(script);
        if (!Array.isArray(chunks)) {
            return {
                type: 'unknown',
                script: script.toString('hex')
            };
        }
        // Check if it's a P2PKH input script (signature, pubkey)
        if (chunks.length === 2 && Buffer.isBuffer(chunks[0]) && Buffer.isBuffer(chunks[1])) {
            const signature = chunks[0];
            const pubkey = chunks[1];
            // Calculate P2PKH address from pubkey
            const pubkeyHash = crypto.createHash('sha256').update(pubkey).digest();
            const ripemd160Hash = crypto.createHash('ripemd160').update(pubkeyHash).digest();
            const address = bitcoin.address.toBase58Check(ripemd160Hash, 0x00); // 0x00 is mainnet
            return {
                type: 'P2PKH',
                signature: signature.toString('hex'),
                pubkey: pubkey.toString('hex'),
                address: address
            };
        }
        // If not a recognized script type, return just the script
        return {
            type: 'unknown',
            script: script.toString('hex')
        };
    } catch (error) {
        return {
            type: 'error',
            script: script.toString('hex'),
            error: error.message
        };
    }
}

function decodeTransaction(hexString) {
    try {
        // Parse the transaction
        const tx = bitcoin.Transaction.fromHex(hexString);
        
        // Create a structured output
        const decodedTx = {
            txid: calculateTxid(tx),
            version: tx.version,
            locktime: tx.locktime,
            inputs: tx.ins.map(input => ({
                txid: reverseBuffer(input.hash).toString('hex'),
                index: input.index,
                sequence: input.sequence,
                script: decodeInputScript(input.script),
                witness: input.witness.length > 0 ? decodeWitnessScript(input.witness) : null
            })),
            outputs: tx.outs.map(output => ({
                value: output.value,
                script: decodeOutputScript(output.script)
            }))
        };

        return decodedTx;
    } catch (error) {
        throw new Error(`Failed to decode transaction: ${error.message}`);
    }
}

export { decodeTransaction };
