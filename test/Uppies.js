import { network } from "hardhat";
import { expect, use } from "chai";
import { erc20Abi } from "viem";
import {abi as AavePoolAbi} from "../artifacts/contracts/interfaces/aave/IPool.sol/IPool.json"

// default network ( a fork of gnosis main chain with this repos config)
const { ethers } = await network.connect();
describe("Uppies", function () {
    /*
      * In Hardhat 3, there isn't a single global connection to a network. Instead,
      * you have a `network` object that allows you to connect to different
      * networks.
      *
      * You can create multiple network connections using `network.connect`.
      * It takes two optional parameters and returns a `NetworkConnection` object.
      *
      * Its parameters are:
      *
      * 1. The name of the network configuration to use (from `config.networks`).
      *
      * 2. The `ChainType` to use.
      *
      * Providing a `ChainType` ensures the connection is aware of the kind of
      * chain it's using, potentially affecting RPC interactions for HTTP
      * connections, and changing the simulation behavior for EDR networks.
      *
      * If you don't provide a `ChainType`, it will be inferred from the network
      * config, and default to `generic` if not specified in the config.
      *
      * Every time you call `network.connect` with an EDR network config name, a
      * new instance of EDR will be created. Each of these instances has its own
      * state and blockchain, and they have no communication with each other.
      *
      * Examples:
      *
      * - `await network.connect({network: "sepolia", chainType: "l1"})`: Connects
      *   to the `sepolia` network config, treating it as an "l1" network.
      *
      * - `await network.connect(network: "hardhatOp", chainType: "optimism"})`:
      *   Creates a new EDR instance in Optimism mode, using the `hardhatOp`
      *   network config.
      *
      * - `await network.connect()`: Creates a new EDR instance with the default
      *    network config (i.e. `hardhat`) and the `generic` chain type.
      *
      * Each network connection object has a `provider` property and other
      * network-related fields added by plugins, like `ethers` and `networkHelpers`.
      */

    it("Create a uppie", async function () {
        const provider = ethers.provider
        const [deployerWallet, userPayeeWallet,userRecipientWallet , uppieFillerWallet] = await ethers.getSigners()
        const uppiesContructArgs =  ["0xb50201558B00496A145fE76f7424749556E326D8", "0xeb0a051be10228213BAEb449db63719d6742F7c4"]
        const uppiesContract = await ethers.deployContract("Uppies",uppiesContructArgs,deployerWallet);
        const balance = await ethers.provider.getBalance("0x7Cc012990304967e15Ae04a07f5210723f15a959")
        console.log({ balance })


        //--- user creates uppie---
        const eureAddress = "0xcB444e90D8198415266c6a2724b7900fb12FC56E"
        const underlyingTokenContract = new ethers.Contract(eureAddress,erc20Abi,provider) 
        const aavPoolInstanceContract = new ethers.Contract(await uppiesContract.aavePoolInstance(),AavePoolAbi,provider) 
        
        const uppiesContractUser = uppiesContract.connect(userPayeeWallet)

        const _recipientAccount =   userRecipientWallet.address
        const _aaveTokenAddress =   await aavPoolInstanceContract.getReserveAToken(eureAddress) // Aave Gnosis EURe
        const _topUpThreshold =     100n * 10n**18n         // 100 eure
        const _topUpTarget =        130n * 10n**18n         // 130 eure
        const _minHealthFactor =    BigInt(1.1 * 10**18)    // 1.1 healthFactor
        const _maxBaseFee =         30n * 10n**9n           // 30 gWei. ~0.01 dai, calculated by doing:  (0.01*10**18) / gasCost
        const _priorityFee =        BigInt(0.01 * 10**9)    // 0.01 gWei High in current gas market but likely too little when gnosis is congested. Filler can just pay it out of pocket from _fillerReward
        const _topUpGas =           337910n                 // average gas cost of fillUppie. @TODO update this
        const _fillerReward =       BigInt(0.001 * 10**18)  // 0.001 euro          @TODO make it also work for other tokens so rewards stays 0.001 euro in value

        const createUppieTx = await (await uppiesContractUser.createUppie(        
            _recipientAccount,
            _aaveTokenAddress,
            _topUpThreshold,
            _topUpTarget,
            _minHealthFactor,
            _maxBaseFee,
            _priorityFee,       
            _topUpGas,
            _fillerReward
        )).wait(1)
        console.log({createUppieTx})
        const uppie = await uppiesContractUser.uppiesPerUser(userPayeeWallet.address, 0n)
        console.log({uppie})

    });
});
