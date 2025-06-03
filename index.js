#!/usr/bin/env node
import { decodeTransaction } from './btc.js';

// Get the transaction hex from command line arguments
const txHex = process.argv[2];

if (!txHex) {
    console.error('Please provide a transaction hex string as an argument');
    console.error('Usage: node index.js <transaction_hex>');
    process.exit(1);
}

try {
    const decodedTx = decodeTransaction(txHex);
    console.log(JSON.stringify(decodedTx, null, 2));
} catch (error) {
    console.error(error.message);
    process.exit(1);
}
