// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;
import {IERC20} from "node_modules/@openzeppelin/contracts/token/ERC20/IERC20.sol";

//forge cant compile this shit
//import {IAToken} from 'node_modules/@aave/protocol-v2/contracts/interfaces/IAToken.sol';
//import {ILendingPool} from 'node_modules/@aave/protocol-v2/contracts/interfaces/ILendingPool.sol';

interface IAToken {
    function UNDERLYING_ASSET_ADDRESS() external returns (address);
}

interface ILendingPool {
    function withdraw(
        address token,
        uint256 amount,
        address recipient
    ) external;

    function getUserAccountData(
        address user
    )
        external
        view
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
    function getAssetPrice(address underlyingToken) external returns (uint256);
}

contract Uppies {
    event CreateUppie(address aaveAccount, uint256 _uppiesIndex);
    event RemoveUppie(address aaveAccount, uint256 _uppiesIndex);
    event FillUppie(address aaveAccount, uint256 _uppiesIndex);
    uint256 constant topUpGas = 0;

    address aavePoolInstance;
    address aaveOracle;
    constructor(address _aavePoolInstance, address _aaveOracle) {
        aavePoolInstance = _aavePoolInstance;
        aaveOracle = _aaveOracle;
    }

    struct Uppie {
        address recipientAccount;
        address aaveToken;
        address underlyingToken;
        uint256 topUpThreshold; // when to Uppies
        uint256 topUpTarget; // a little bit extra to prevent topping up on every tx
        uint256 maxBaseFee;
        uint256 minHealthFactor;
    }

    // more gas efficient maxing would be offchain sigs or onchain as calldata
    mapping(address => Uppie[]) public uppiesPerUser;

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

    function fillUppie(uint256 _uppiesIndex, address aaveAccount) public {
        Uppie memory uppie = uppiesPerUser[aaveAccount][_uppiesIndex];
        IERC20 underlyingToken = IERC20(uppie.underlyingToken);

        uint256 recipientBalance = underlyingToken.balanceOf(uppie.recipientAccount);
        require(recipientBalance < uppie.topUpThreshold);
        require(block.basefee < uppie.maxBaseFee);

        uint256 topUpSize = uppie.topUpTarget - recipientBalance;
        uint256 txFee = block.basefee *topUpGas * IAaveOracle(aaveOracle).getAssetPrice(uppie.underlyingToken);
        ILendingPool(uppie.aaveToken).withdraw(
            uppie.underlyingToken,
            topUpSize + txFee,
            address(this)
        );
        // kinda dumb doing this after gas wise but fuck it. just dont fail ok?
        (, , , , , uint256 currentHealthFactor) = ILendingPool(uppie.aaveToken).getUserAccountData(aaveAccount);
        require(currentHealthFactor > uppie.minHealthFactor,"This uppie will causes to the user to go below the Uppie.minHealthFactor");
        underlyingToken.transferFrom(address(this),uppie.recipientAccount,topUpSize);
        underlyingToken.transferFrom(address(this), msg.sender, txFee);
        emit FillUppie(aaveAccount, _uppiesIndex);
    }
}
