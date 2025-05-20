// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

//forge cant compile this shit
//import {IAToken} from 'node_modules/@aave/protocol-v2/contracts/interfaces/IAToken.sol';
//import {ILendingPool} from 'node_modules/@aave/protocol-v2/contracts/interfaces/ILendingPool.sol';

interface IAToken {
    function UNDERLYING_ASSET_ADDRESS() external view returns (address);
}

interface ILendingPool {
    function withdraw(address asset, uint256 amount, address to) external returns (uint256);

    function getUserAccountData(address user) external view
    returns (
        uint256 totalCollateralBase,
        uint256 totalDebtBase,
        uint256 availableBorrowsBase,
        uint256 currentLiquidationThreshold,
        uint256 ltv,
        uint256 healthFactor
    );
}

interface IAaveOracle {
    function getAssetPrice(address asset) external view returns (uint256);
}

contract Uppies {
    event NewUppie(address indexed payee, uint256 _uppiesIndex);
    event RemovedUppie(address indexed payee, uint256 _uppiesIndex);
    event FilledUppie(address indexed payee, uint256 _uppiesIndex);
    // uint256 constant public topUpGas = 390000; // TODO allow user to specify into their uppie
    // uint256 constant public priorityFee = 1000000000; // TODO allow user to specify into their uppie

    address public aavePoolInstance;
    address public aaveOracle;
    constructor(address _aavePoolInstance, address _aaveOracle) {
        aavePoolInstance = _aavePoolInstance;
        aaveOracle = _aaveOracle;
    }

    struct Uppie {
        address recipient;
        address aaveToken;
        address underlyingToken;
        uint256 topUpThreshold; // when to Uppie
        uint256 topUpTarget;    // can be a higher number than topUpThreshold so you don't have to top-up every tx
        uint256 minHealthFactor;

        uint256 maxBaseFee;
        uint256 priorityFee;
        uint256 topUpGas;
        uint256 fillerReward;
    }

    // more gas efficient maxing would be off-chain sigs 
    mapping(address => mapping(uint256 => Uppie)) public uppiesPerUser;
    // to enable ui to get all uppies without event scanning. (can be too high. will never be too low)
    mapping(address => uint256) public highestUppieIndexPerUser;       

    // TODO make edit uppie
    function createUppie(
        address _recipientAccount,
        address _aaveToken,
        uint256 _topUpThreshold,
        uint256 _topUpTarget,
        uint256 _minHealthFactor,

        uint256 _maxBaseFee,
        uint256 _priorityFee,       
        uint256 _topUpGas,
        uint256 _fillerReward
    ) public {
        // TODO ui should do this. Also ui can set it to 0 if it cant be used as collateral 
        //require(_minHealthFactor > 1050000000000000000,"cant allow a _minHealthFactor below 1.05");
        // set permissions of _aaveToken in ui
        address underlyingToken = IAToken(_aaveToken).UNDERLYING_ASSET_ADDRESS();
        Uppie memory uppie = Uppie(
            _recipientAccount,
            _aaveToken,
            underlyingToken,
            _topUpThreshold,
            _topUpTarget,
            _minHealthFactor,
            _maxBaseFee,
            _priorityFee,       
            _topUpGas,
            _fillerReward
        );

        uint256 _highestUppieIndex = highestUppieIndexPerUser[msg.sender];
        uint256 _uppiesIndex = _highestUppieIndex + 1;
        uppiesPerUser[msg.sender][_uppiesIndex] = uppie;
        if (_uppiesIndex > _highestUppieIndex) {
            highestUppieIndexPerUser[msg.sender] = _uppiesIndex;
        }
        emit NewUppie(msg.sender, _uppiesIndex);
    }

    function removeUppie(uint256 _uppiesIndex) public {
        uint256 _highestUppieIndex = highestUppieIndexPerUser[msg.sender];
        uppiesPerUser[msg.sender][_uppiesIndex] = Uppie(address(0x0),address(0x0),address(0x0),0,0,0,0,0,0,0);
        if (_uppiesIndex == _highestUppieIndex) {
            highestUppieIndexPerUser[msg.sender] = _uppiesIndex - 1;
        }
        emit RemovedUppie(msg.sender, _uppiesIndex);
    }

    // ethereum communism!
    function sponsoredFillUppie(uint256 _uppiesIndex, address payee) public {
        Uppie memory uppie = uppiesPerUser[payee][_uppiesIndex];

        uint256 recipientBalance = IERC20(uppie.underlyingToken).balanceOf(uppie.recipient);
        uint256 payeeBalance = IERC20(uppie.aaveToken).balanceOf(payee);
        
        require(payeeBalance != 0, "payee is broke");
        require(recipientBalance < uppie.topUpThreshold, "user balance not below top-up threshold");
        require(uppie.maxBaseFee < block.basefee, "block.basefee is higher than uppie.maxBaseFee");
        uint256 topUpSize = uppie.topUpTarget - recipientBalance;

       // not enough money? just send what you got
        if (payeeBalance < topUpSize) {
            topUpSize = payeeBalance;
        }

        IERC20(uppie.aaveToken).transferFrom(payee, address(this), topUpSize);
        ILendingPool(aavePoolInstance).withdraw(
            uppie.underlyingToken,
            topUpSize,
            address(this)
        );

        // health factor check just incase user used the token as collateral. We don't want them to get liquidated!
        // needs to be after the withdraw so we can see if it went bad.
        if (uppie.minHealthFactor > 0 ) {
            (, , , , , uint256 currentHealthFactor) = ILendingPool(aavePoolInstance).getUserAccountData(payee);
            require(currentHealthFactor > uppie.minHealthFactor,"This uppie will causes to the user to go below the Uppie.minHealthFactor");
        }
        IERC20(uppie.underlyingToken).transfer(uppie.recipient,topUpSize);
        emit FilledUppie(payee, _uppiesIndex);
    }

    // TODO add option for relayer to sponsor
    function fillUppie(uint256 _uppiesIndex, address payee) public {
        Uppie memory uppie = uppiesPerUser[payee][_uppiesIndex];

        uint256 recipientBalance = IERC20(uppie.underlyingToken).balanceOf(uppie.recipient);
        uint256 payeeBalance = IERC20(uppie.aaveToken).balanceOf(payee);
        
        require(payeeBalance != 0, "payee is broke");
        require(recipientBalance < uppie.topUpThreshold, "user balance not below top-up threshold");
        require(uppie.maxBaseFee < block.basefee, "block.basefee is higher than uppie.maxBaseFee");
        
        uint256 topUpSize = uppie.topUpTarget - recipientBalance;
        uint256 totalWithdraw;
        uint256 fillerFee = 0;

        (totalWithdraw, fillerFee) = _calculateFees(uppie ,topUpSize, payeeBalance);

        IERC20(uppie.aaveToken).transferFrom(payee, address(this), totalWithdraw);
        ILendingPool(aavePoolInstance).withdraw(
            uppie.underlyingToken,
            totalWithdraw,
            address(this)
        );

        // health factor check just incase user used the token as collateral. We don't want them to get liquidated!
        // needs to be after the withdraw so we can see if it went bad.
        if (uppie.minHealthFactor > 0 ) {
            (, , , , , uint256 currentHealthFactor) = ILendingPool(aavePoolInstance).getUserAccountData(payee);
            require(currentHealthFactor > uppie.minHealthFactor,"This uppie will causes to the user to go below the Uppie.minHealthFactor");
        }
        IERC20(uppie.underlyingToken).transfer(uppie.recipient,topUpSize);
        IERC20(uppie.underlyingToken).transfer(msg.sender, fillerFee);

        emit FilledUppie(payee, _uppiesIndex);
    }

    function _calculateFees(Uppie memory uppie , uint256 topUpSize, uint256 payeeBalance) view private returns(uint256, uint256) {
        uint256 blockBaseFee = block.basefee;
        require(blockBaseFee < uppie.maxBaseFee, "base fee is higher than then the uppie.maxBaseFee");
    
        // 10**(8+8) / getAssetPrice 
        // because getAssetPrice returns the eur/usd price. But we need usd/eur. 
        // divide by the large number: 10000000000000000 (10**(8+8)). Because the price is returned 10^8 too large

        // TODO consider tokens having different amount of decimals (might be fine?)
        uint256 xdaiPaid = (uppie.priorityFee + blockBaseFee) * uppie.topUpGas;

        // 1 / price to invert the price. (ex eure/xDai -> xDai/eure) but 1*10000000000000000 because price is returned 10^8 to large
        uint256 underlyingTokenPrice = 10000000000000000 / IAaveOracle(aaveOracle).getAssetPrice(uppie.underlyingToken);
        uint256 txCost = (xdaiPaid * underlyingTokenPrice)  / 100000000;
        uint256 fillerFee = uppie.fillerReward + txCost;
        // divided by 100000000. because getAssetPrice returns a integer that is 10^8 too large since solidity cant do floats
        
        uint256 totalWithdraw = topUpSize + fillerFee;

        // not enough money? just send what you got
        if (payeeBalance < totalWithdraw) {
            totalWithdraw = payeeBalance;
            topUpSize = payeeBalance - fillerFee;
        }
        return (totalWithdraw, fillerFee);
    }
}
