## Deploy
https://aave.com/docs/resources/addresses
```shell
forge create --broadcast --private-key 0xPRIVATEKEY --rpc-url https://rpc.gnosischain.com --etherscan-api-key ETHERSCANKEY src/Uppies.sol:Uppies  --verify --constructor-args 0xb50201558B00496A145fE76f7424749556E326D8 0xeb0a051be10228213BAEb449db63719d6742F7c4  
```

live: https://uppies.eth.limo/    
deployment: https://gnosisscan.io/address/0xB64870b3508854c963dfCD16aA844151A38E03D5    
ipfs: https://bafybeih3acpwq4tdiocjl6d5u5wu2n36yt27gg4lwrcdvubwleokbx54ga.ipfs.dweb.link/

```shell
node uppiesFiller/uppiesFiller.js --privateKey 0xPRIVATEKEY
```


```shell
yarn vite ui
```