## Foundry

**Foundry is a blazing fast, portable and modular toolkit for Ethereum application development written in Rust.**

Foundry consists of:

-   **Forge**: Ethereum testing framework (like Truffle, Hardhat and DappTools).
-   **Cast**: Swiss army knife for interacting with EVM smart contracts, sending transactions and getting chain data.
-   **Anvil**: Local Ethereum node, akin to Ganache, Hardhat Network.
-   **Chisel**: Fast, utilitarian, and verbose solidity REPL.

## Documentation

https://book.getfoundry.sh/

## Usage

### Build

```shell
$ forge build
```

### Test

```shell
$ forge test
```

### Format

```shell
$ forge fmt
```

### Gas Snapshots

```shell
$ forge snapshot
```

### Anvil

```shell
$ anvil
```

### Deploy

```shell
$ forge script script/Counter.s.sol:CounterScript --rpc-url <your_rpc_url> --private-key <your_private_key>
```

### Cast

```shell
$ cast <subcommand>
```

### Help

```shell
$ forge --help
$ anvil --help
$ cast --help
```


## Deploy
https://aave.com/docs/resources/addresses
```shell
forge create --broadcast --private-key 0xPRIVATEKEY --rpc-url https://rpc.gnosischain.com --etherscan-api-key ETHERSCANKEY src/Uppies.sol:Uppies  --verify --constructor-args 0xb50201558B00496A145fE76f7424749556E326D8 0xeb0a051be10228213BAEb449db63719d6742F7c4  
```

deployment: https://gnosisscan.io/address/0x88c96330c65b7c4697285ba6cd1f1ed1ba60fadd

```shell
node uppiesFiller/uppiesFiller.js --privateKey 0xPRIVATEKEY
```