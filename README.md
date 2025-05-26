## Deploy
https://aave.com/docs/resources/addresses
<!-- 
TODO
```shell
forge create --broadcast --private-key 0xPRIVATEKEY --rpc-url https://rpc.gnosischain.com --etherscan-api-key ETHERSCANKEY src/Uppies.sol:Uppies  --verify --constructor-args 0xb50201558B00496A145fE76f7424749556E326D8 0xeb0a051be10228213BAEb449db63719d6742F7c4  
``` -->

<!-- 
TODO
live: https://uppies.eth.limo/    
deployment: https://gnosisscan.io/address/0x5a56F25EAB8EB55F942a4894BAb68f6C06c00622  
ipfs: https://bafybeielcchd3tzsk35kwixukqsgzddneoe6pyji4larfohkkmstplince.ipfs.dweb.link/ -->

Uppie filler
```shell
node uppiesFiller/uppiesFiller.js --privateKey 0xPRIVATEKEY
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
```shell
yarn hardhat ignition... idk TODO
```

