## Deploy
https://aave.com/docs/resources/addresses
<!-- 
TODO
```shell
forge create --broadcast --private-key 0xPRIVATEKEY --rpc-url https://rpc.gnosischain.com --etherscan-api-key ETHERSCANKEY src/Uppies.sol:Uppies  --verify --constructor-args 0xb50201558B00496A145fE76f7424749556E326D8 0xeb0a051be10228213BAEb449db63719d6742F7c4  
``` -->


<!-- TODO
live: https://v1.uppies.eth.limo/    
ipfs: https://bafybeielcchd3tzsk35kwixukqsgzddneoe6pyji4larfohkkmstplince.ipfs.dweb.link/ -->
deployment: https://gnosisscan.io/address/0x41D41B606bE9c7Da574D07af900eF828f7496a9F  

Uppie filler
```shell
yarn bun run uppiesFiller/uppiesFiller.js --privateKey 0xPRIVATEKEY
```

ui
```shell
yarn vite ui
```

test
```
yarn hardhat test
```

compile
```shell
yarn hardhat compile
```        

deploy
<!-- ```shell
yarn hardhat ignition... idk TODO
``` -->
(with forge since hardhat 3 cant verify yet)
```shell
forge create contracts/Uppies.sol:Uppies --broadcast --verify --verifier-url "https://api.gnosisscan.io/api" --etherscan-api-key "MyApiKey" --private-key "0xMyPrivateKey" --rpc-url https://rpc.gnosischain.com --constructor-args "0xb50201558B00496A145fE76f7424749556E326D8" "0xeb0a051be10228213BAEb449db63719d6742F7c4"
```
