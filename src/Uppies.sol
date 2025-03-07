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
    event CreateUppie(address payee, uint256 _uppiesIndex);
    event RemoveUppie(address payee, uint256 _uppiesIndex);
    event FillUppie(address payee, uint256 _uppiesIndex);
    uint256 constant topUpGas = 340000;

    address aavePoolInstance;
    address aaveOracle;
    constructor(address _aavePoolInstance, address _aaveOracle) {
        aavePoolInstance = _aavePoolInstance;
        aaveOracle = _aaveOracle;
    }

    struct Uppie {
        address recipient;
        address aaveToken;
        address underlyingToken;
        uint256 topUpThreshold; // when to Uppies
        uint256 topUpTarget; // a little bit extra to prevent topping up on every tx
        uint256 maxBaseFee;
        uint256 minHealthFactor;
    }

    // more gas efficient maxing would be offchain sigs or onchain as calldata
    //TODO check if mapping(address => Uppie[]) is cheaper
    mapping(address => mapping ( uint256 => Uppie)) public uppiesPerUser;

    function createUppie(
        address _recipientAccount,
        address _aaveToken,
        uint256 _topUpThreshold,
        uint256 _topUpTarget,
        uint256 _uppiesIndex,
        uint256 _maxBaseFee,
        uint256 _minHealthFactor
    ) public {
        require(_minHealthFactor > 1050000000000000000,"cant allow a _minHealthFactor below 1.05");
        // set permissions of _aaveToken in ui
        address underlyingToken = IAToken(_aaveToken).UNDERLYING_ASSET_ADDRESS();
        Uppie memory uppie = Uppie(
            _recipientAccount,
            _aaveToken,
            underlyingToken,
            _topUpThreshold,
            _topUpTarget,
            _maxBaseFee,
            _minHealthFactor
        );
        // TODO one token per eoa which is a silly restriction but i dont care
        uppiesPerUser[msg.sender][_uppiesIndex] = uppie;
        emit CreateUppie(msg.sender, _uppiesIndex);
    }

    function removeUppie(uint256 _uppiesIndex) public {
        uppiesPerUser[msg.sender][_uppiesIndex] = Uppie(address(0x0),address(0x0),address(0x0),0,0,0,0);
        emit CreateUppie(msg.sender, _uppiesIndex);
    }

    function fillUppie(uint256 _uppiesIndex, address payee) public {
        Uppie memory uppie = uppiesPerUser[payee][_uppiesIndex];

        uint256 recipientBalance = IERC20(uppie.underlyingToken).balanceOf(uppie.recipient);
        uint256 payeeBalance = IERC20(uppie.aaveToken).balanceOf(payee);
        
        require(payeeBalance != 0, "payee is broke");
        require(recipientBalance < uppie.topUpThreshold, "user balance not below topup threshold");
        require(block.basefee < uppie.maxBaseFee, "base fee is higher than then the uppie.maxBaseFee");

        uint256 topUpSize = uppie.topUpTarget - recipientBalance;
        uint256 txFee = block.basefee * topUpGas * IAaveOracle(aaveOracle).getAssetPrice(uppie.underlyingToken);
        uint256 totalWithdraw = topUpSize + txFee;
        
        // not enough money? just send what you got
        if (payeeBalance < totalWithdraw) {
            totalWithdraw = payeeBalance;
            topUpSize = payeeBalance - txFee;
        }

        IERC20(uppie.aaveToken).transferFrom(payee, address(this), topUpSize+txFee);
        ILendingPool(aavePoolInstance).withdraw(
            uppie.underlyingToken,
            topUpSize + txFee,
            address(this)
        );

        // health factor check just incase user used the token as collateral. We don't want them to get liquidated!
        // needs to be after the withdraw so we can see if it went bad.
        (, , , , , uint256 currentHealthFactor) = ILendingPool(aavePoolInstance).getUserAccountData(payee);
        require(currentHealthFactor > uppie.minHealthFactor,"This uppie will causes to the user to go below the Uppie.minHealthFactor");
        IERC20(uppie.underlyingToken).transfer(uppie.recipient,topUpSize);
        IERC20(uppie.underlyingToken).transfer(msg.sender, txFee);
        emit FillUppie(payee, _uppiesIndex);
    }
}
