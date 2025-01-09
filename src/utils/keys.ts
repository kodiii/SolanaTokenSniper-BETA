const { Keypair } = require("@solana/web3.js");

// Generate a new keypair
const keypair = Keypair.generate();

// Print the private key as a Base64 string
console.log(
  "Private Key (Base64):",
  Buffer.from(keypair.secretKey).toString("base64")
);

// Print the public key
console.log("Public Key:", keypair.publicKey.toBase58());
