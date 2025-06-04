#!/usr/bin/env node
import { decodeTransaction } from './btc.js';
import rc4 from './rc4.js';
import * as bitcoin from 'bitcoinjs-lib';

function decodeAddress(address) {
    const version = address.readUInt8(0);
    if (version === 0 || version === 5) {
        return bitcoin.address.toBase58Check(address.subarray(1, 21), version);
    }
    if (version === 128) {
        return bitcoin.address.toBech32(address.subarray(1, 21), 0, 'bc');
    }
    return address.toString('hex');
}

function decodeCounterpartyTransaction(tx) {
    // Counterparty transactions are obfuscated with RC4 using the first input's txid as the key
    const key = tx.inputs[0].txid;

    tx.outputs.forEach((output, index) => {
        if (output.script.type !== 'OP_RETURN') {
            return;
        }
        const deobfuscated = Buffer.from(rc4(key, output.script.data[0]), 'hex');
        if(deobfuscated.subarray(0, 8).toString('ascii') !== 'CNTRPRTY') {
            return;
        }
        const type = deobfuscated.readInt8(8);
        if(type !== 2) {
            throw new Error('This is not a counterparty send transaction');
        }
        const data = deobfuscated.subarray(9);
        output.script.counterparty = {
            prefix: 'CNTRPRTY',
            type: 'Enhanced Send',
            asset: data.readBigInt64BE(0).toString(),
            from: tx.inputs[0].script.address || tx.inputs[0].witness?.address,
            to: decodeAddress(data.subarray(16, 37)),
            amount: data.readBigInt64BE(8).toString(),
            memo: data.subarray(37).toString('utf-8'),
        }
    });
}

// Get the transaction hex from command line arguments
const txHex = process.argv[2];

if (!txHex) {
    console.error('Please provide a transaction hex string as an argument');
    console.error('Usage: node index.js <transaction_hex>');
    process.exit(1);
}

try {
    const tx = decodeTransaction(txHex);
    decodeCounterpartyTransaction(tx);
    console.log(JSON.stringify(tx, null, 2));
} catch (error) {
    console.error(error.message);
    process.exit(1);
}
