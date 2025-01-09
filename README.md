This repository contains all the code "as is", following the "Solana Sniper Trading Bot in TypeScript" on YouTube provided by [DigitalBenjamins](https://x.com/digbenjamins).

Part 1: Snipe New Tokens from Raydium LP

[![Solana Sniper Trading Bot in TypeScript](https://img.youtube.com/vi/vsMbnsdHOIQ/0.jpg)](https://www.youtube.com/watch?v=vsMbnsdHOIQ)

Part 2: Track and sell tokens (SL/TP)

[![Solana Sniper Trading Bot in TypeScript](https://img.youtube.com/vi/4CdXLywg2O8/0.jpg)](https://www.youtube.com/watch?v=4CdXLywg2O8)

You can find the YouTube tutorial here: https://www.youtube.com/watch?v=vsMbnsdHOIQ

## Project Description

The Solana Token Sniper is a Node.js project built with TypeScript, designed to automate the buying and selling of tokens on the Solana blockchain. This script is configured to detect the creation of new liquidity pools and execute token purchases automatically.

With customizable parameters, you can tailor the strategy to suit your needs. The primary goal of this project is to educate users about the essential components required to develop a simple token sniper, offering insights into its functionality and implementation!

### Features

- Token Sniper for Raydium for the Solana blockchain
- Rug check using a third party service rugcheck.xyz
- Possibility to skip pump.fun tokens
- Auto-buy with parameters for amount, slippage and priority
- Possibility to set own RPC nodes
- Track and store tokens in local database
- Auto-sell feature using Stop Loss and Take Profit
- Utils: Solana Wallet (keypair) creator

### Prerequisites, Installation and Usage Instructions

1. Ensure [Node.js](https://nodejs.org/en) is installed on your computer.
2. Clone the repository to your local machine.
3. Navigate to the project folder and run the following command to install all dependencies: "npm i"
4. To start the sniper, run: "npm run dev"
5. To start the tracker, run: "npm run tracker"
6. Optional: To start the sniper and tracker after being compiled, run: "npm run start" and "npm run start:tracker"

### Update Log

- 06-dec-2024:11: Add rugcheck option: Exclude LP from topholders
- 02-dec-2024:16: Change Metadata RCP request to local database lookup
- 02-dec-2024:16: Expanded Rug check
- 02-dec-2024:16: Added new token tracker for rug check duplicates functionality and meta data
- 02-dec-2024:16: Added Simulation Mode to skip the actual swap
- 02-dec-2024:16: Added logsUnsubscribe before subscribing to RPC logsSubscribe method
- 02-dec-2024:16: Improved fetchTransactionDetails() error handling
- 02-dec-2024:16: Updated fetchTransactionDetails() to use retry based on count instead of time
- 02-dec-2024:16: Process transaction asynchronously and add max concurrent transactions
- 02-dec-2024:16: Revert back to native punycode as libraries are identical.
- 30-dec-2024:21: Added patch-package dev dependency to apply patches/tr46+0.0.3.patch
- 30-dec-2024:21: Added punycode.js package to resolve [issue](https://github.com/mathiasbynens/punycode.js/issues/137).
- 21-dec-2024:19: Added createSellTransaction() in transactions.ts to sell SL and TP tokens.
- 21-dec-2024:19: Added Retry logic for Swap Quote requests
- 21-dec-2024:19: Added Verbose loging option
- 18-dec-2024-22: Added tracker functionality in "src\tracker\index.ts".
- 18-dec-2024-22: Updated fetchAndSaveSwapDetails() in transactions.ts to use sqlite3.
- 18-dec-2024-22: Updated config.ts: Addded sell parameters
- 18-dec-2024-22: Added packages: luxon, sqlite, sqlite3
- 17-dec-2024-13: Added fetchAndSaveSwapDetails() in transactions.ts to track confirmed swaps.
- 17-dec-2024-13: Updated test.ts
- 17-dec-2024-13: Added JUP_HTTPS_PRICE_URI to .env.backup
- 17-dec-2024-13: Web3.js updated from 1.95.8 to 1.98.0
- 06-dec-2024-00: Initial Commit: Solana Sniper Bot

### Third Party documentation

- [Helius RPC nodes](https://docs.helius.dev)
- [Jupiter V6 Swap API](https://station.jup.ag/docs/apis/swap-api)
- [Rugcheck API](https://api.rugcheck.xyz/swagger/index.html)
- [Solana](https://solana.com/docs)
- [Solscan](https://solscan.io)

### Disclaimer

The course videos accompanying this project are provided free of charge and are intended solely for educational purposes. This software does not guarantee profitability or financial success and is not designed to generate profitable trades.

You are solely responsible for your own financial decisions. Before making any trades or investments, it is strongly recommended that you consult with a qualified financial professional.

By using this software, you acknowledge that the creators and contributors of this project shall not be held liable for any financial losses, damages, or other consequences resulting from its use. Use the software at your own risk.

The software (code in this repository) must not be used to engage in any form of market manipulation, fraud, illegal activities, or unethical behavior. The creators of this project do not endorse or support malicious use cases, such as front-running, exploiting contracts, or harming other users. Users are expected to adhere to ethical trading practices and comply with applicable laws and regulations.

The software (code in this repository) is intended solely to facilitate learning and enhance the educational experience provided by the accompanying videos. Any other use is strictly prohibited.

All trading involves risk and may not be suitable for all individuals. You should carefully consider your investment objectives, level of experience, and risk appetite before engaging in any trading activities. Past performance is not indicative of future results, and there is no guarantee that any trading strategy, algorithm or tool discussed will result in profits or avoid losses.

I am not a licensed financial advisor or a registered broker-dealer. The content shared is based solely on personal experience and knowledge and should not be relied upon as financial advice or a guarantee of success. Always conduct your own research and consult with a professional financial advisor before making any investment decisions.
