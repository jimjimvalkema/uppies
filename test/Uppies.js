import { network } from "hardhat";
import { expect, use } from "chai";

import { erc20Abi } from "viem";
import eureABI from "./eureABI.json";
import oldEureABI from "./oldEureABI.json";
import { IPool__factory } from "../types/ethers-contracts/factories/interfaces/aave/IPool__factory"
import { Uppies__factory } from "../types/ethers-contracts/factories/Uppies.sol/Uppies__factory"
import { IAToken__factory } from "../types/ethers-contracts/factories/interfaces/aave/IAToken__factory"

import { fillUppie, syncUppies } from "../scripts/uppie-lib";
import helpers  from "@nomicfoundation/hardhat-network-helpers";

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

    it("Create a uppie and fill it", async function () {
        const provider = ethers.provider
        const [deployerWallet, userPayeeWallet, userRecipientWallet, uppieFillerWallet] = await ethers.getSigners()

        // steal some eure from a whale
        const eureWhale = "0x056C6C5e684CeC248635eD86033378Cc444459B0" // i couldn't impersonate a minter so i used a curve pool contract
        const eureWhaleWallet = await turnIntoFundedSigner(eureWhale, deployerWallet, provider)

        // deploy uppies
        const uppiesContructArgs = ["0xb50201558B00496A145fE76f7424749556E326D8", "0xeb0a051be10228213BAEb449db63719d6742F7c4"]
        const uppiesContract = await (await (new Uppies__factory(deployerWallet)).deploy(...uppiesContructArgs)).waitForDeployment() //await ethers.deployContract("Uppies",uppiesContructArgs,deployerWallet);

        //--- user creates uppie---

        // connect contracts
        const newEureAddress = "0x420CA0f9B9b604cE0fd9C18EF134C705e5Fa3430" 
        const oldEureAddress = "0xcB444e90D8198415266c6a2724b7900fb12FC56E"
        const aavPoolInstanceContract = IPool__factory.connect(await uppiesContract.aavePoolInstance(), provider) //new ethers.Contract(await uppiesContract.aavePoolInstance(),AavePoolAbi,provider) 
        const underlyingTokenContract = new ethers.Contract(oldEureAddress, oldEureABI, provider)
        const ATokenEureAddress = await aavPoolInstanceContract.getReserveAToken(oldEureAddress)
        const ATokenContractUser = IAToken__factory.connect(ATokenEureAddress, userPayeeWallet)

        // get eure! 10000 eure!
        const underlyingTokenContractEureWhale = underlyingTokenContract.connect(eureWhaleWallet)
        await (await underlyingTokenContractEureWhale.transfer(userPayeeWallet.address, 10000n * 10n ** 18n)).wait(1)
        
        // deposit into aave
        const aavPoolInstanceContractUserPayee = aavPoolInstanceContract.connect(userPayeeWallet)
        const underlyingTokenContractUserPayee = underlyingTokenContract.connect(userPayeeWallet)
        await (await underlyingTokenContractUserPayee.approve(aavPoolInstanceContractUserPayee.target, 2n ** 256n - 1n)).wait(1)
        await (await aavPoolInstanceContractUserPayee.supply(
            underlyingTokenContract.target,
            10000n * 10n ** 18n,
            userPayeeWallet.address,
            0n
        )).wait(1)


        // make uppie
        await (await ATokenContractUser.approve(uppiesContract.target, 2n ** 256n - 1n)).wait(1)
        const uppiesContractUser = uppiesContract.connect(userPayeeWallet)

        const _recipientAccount = userRecipientWallet.address
        const _aaveTokenAddress = ATokenEureAddress // Aave Gnosis EURe
        const _canBorrow = false
        const _topUpThreshold = 100n * 10n ** 18n         // 100 eure
        const _topUpTarget = 130n * 10n ** 18n         // 130 eure
        const _minHealthFactor = BigInt(1.1 * 10 ** 18)    // 1.1 healthFactor
        const _maxBaseFee = 30n * 10n ** 9n           // 30 gWei. ~0.01 dai, calculated by doing:  (0.01*10**18) / gasCost
        const _priorityFee = BigInt(0.01 * 10 ** 9)    // 0.01 gWei High in current gas market but likely too little when gnosis is congested. Filler can just pay it out of pocket from _fillerReward
        const _topUpGas = 337910n                 // average gas cost of fillUppie. @TODO update this
        const _fillerReward = BigInt(0.001 * 10 ** 18)  // 0.001 euro          @TODO make it also work for other tokens so rewards stays 0.001 euro in value

        // create
        await (await uppiesContractUser.createUppie(
            _recipientAccount,
            _aaveTokenAddress,
            _canBorrow,
            _topUpThreshold,
            _topUpTarget,
            _minHealthFactor,
            _maxBaseFee,
            _priorityFee,
            _topUpGas,
            _fillerReward
        )).wait(1)

        //fill uppie
        const uppiesContractFiller = uppiesContract.connect(uppieFillerWallet)
        const uppieDeploymentBlock = uppiesContract.deploymentTransaction().blockNumber
        const allUppies = await syncUppies({ startBlock: uppieDeploymentBlock, uppiesContract: uppiesContract })
        const uppieArray = Object.keys(allUppies).map((payeeAddress) => Object.keys(allUppies[payeeAddress]).map((index) => allUppies[payeeAddress][index])).flat()
        // TODO filter out only fillable uppies
        const pendingFills = uppieArray.map((uppie) => fillUppie({ uppie, uppiesContract:uppiesContractFiller }))
        const settledFills = await Promise.all((await Promise.all(pendingFills)).map((pendingTx) => pendingTx.wait(1)))
    });


    async function turnIntoFundedSigner(contractAddress, sponsor, provider) {
        await provider.send(
            "hardhat_impersonateAccount",
            [contractAddress],
        );
        await provider.send(
            "hardhat_setCode",
            [contractAddress,"0x00"],
        );
        const signer = await ethers.getSigner(contractAddress);
        // make sure he can pay gas
        await (await sponsor.sendTransaction({
            to: contractAddress,
            value: ethers.parseUnits('1', 'ether'),
        })).wait(1);

        return signer
    }
});
