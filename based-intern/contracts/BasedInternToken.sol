// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * Meme token. Not an RWA. No promises.
 */

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract BasedInternToken is ERC20 {
    constructor() ERC20("Based Intern", "INTERN") {
        // 1,000,000,000 * 10^18 minted once to deployer.
        _mint(msg.sender, 1_000_000_000e18);
    }
}

