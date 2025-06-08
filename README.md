# Counterparty Transaction Decoder

A simple command-line tool to decode Counterparty (XCP) transactions from hexadecimal format into a readable JSON structure.

## Installation

```bash
npm install
```

## Usage

### Run with npx (locally)

```bash
npx . <transaction_hex>
```

### Run with npx (after publishing to npm)

```bash
npx xcp-decode <transaction_hex>
```

### Run with node

```bash
node index.js <transaction_hex>
```

## Create offline package

```bash
npm i && zip -r ../xcp-decode.zip . -x ".git*" -x "data*"
```
