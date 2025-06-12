#!/usr/bin/env node
import { decodeTransaction } from './btc.js';
import rc4 from './rc4.js';
import * as bitcoin from 'bitcoinjs-lib';
import chalk from 'chalk';
import fs from 'fs';

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
    const counterparty = [];

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
        counterparty.push(output.script.counterparty);
    });
    return counterparty;
}

function formatAmount(amount) {
    // Parse amount to BigInt, divide by 100,000,000, and display with decimal points
    const amountBigInt = BigInt(amount);
    const divisor = 100000000n;
    const whole = amountBigInt / divisor;
    const fraction = amountBigInt % divisor;
    const fractionStr = fraction.toString().padStart(8, '0');
    return `${whole.toString()}.${fractionStr}`;
}

function parseInput(input) {
    if (!input) {
        console.error('Please provide either a transaction hex string or a file path as an argument');
        console.error('Usage: node index.js <transaction_hex_or_file_path>');
        process.exit(1);
    }
    let data, hex, signer;
    try {
        // Check if the input is a file path by trying to read it
        if (fs.existsSync(input)) {
            data = fs.readFileSync(input, 'utf8').trim();
        } else {
            data = input;
        }
    } catch (error) {
        // If file read fails, assume it's a data string
        data = input;
    }
    // Check if the data is a JSON object
    if (data.startsWith('{')) {
        const json = JSON.parse(data);
        hex = json.unsignedTx;
        
        // Loop through UTXOs and get the signer
        for (const utxo of Object.values(json.utxos || {})) {
            if (utxo.scriptPubKey) {
                // Get the address from the scriptPubKey
                const addressEncoder = utxo.scriptPubKey.startsWith('00') ? bitcoin.payments.p2wpkh : bitcoin.payments.p2pkh;
                const { address } = addressEncoder({
                    output: Buffer.from(utxo.scriptPubKey, 'hex'),
                    network: bitcoin.networks.bitcoin
                });
                signer = address;
                break;
            }
        }
    } else {
        hex = data;
    }
    return { hex, signer };
}

try {
    const data = parseInput(process.argv[2]);
    const tx = decodeTransaction(data.hex);
    const counterparty = decodeCounterpartyTransaction(tx);
    console.log(chalk.gray(JSON.stringify(tx, null, 2)));

    counterparty.forEach(c => {
        const signer = c.from || data.signer;
        console.log(chalk.gray('--------------------------------'));
        console.log(`Counterparty: ${c.type}`);
        console.log(`Asset: ${c.asset === '1' ? 'XCP' : c.asset}`);
        console.log('From: ' + (signer? chalk.blue(signer): chalk.gray('(Unsigned TX)')));
        console.log('To: ' + chalk.blue(c.to));
        console.log('Amount: ' + chalk.blue(formatAmount(c.amount)));
        console.log(chalk.gray('--------------------------------'));
    });
    console.log(data.hex);
} catch (error) {
    console.error(chalk.red(`Error: ${error.message}`));
    process.exit(1);
}
