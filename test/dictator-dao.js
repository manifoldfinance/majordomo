const { expect } = require('chai');
const { createFixture, BN, e10 } = require('./framework');

describe('DictatorDAO', function () {
  let fixture;
  before(async function () {
    fixture = await createFixture(deployments, this, async (cmd) => {
      await cmd.deploy(
        'dao',
        'contracts/DictatorDAO.sol:DictatorDAO',
        'MAJOR',
        'Majordomo',
        'xMAJOR',
        'xMajordomo',
        this.bob.address
      );
      const tokenAddress = await this.dao.token();
      await cmd.attach(
        'token',
        'contracts/DictatorDAO.sol:DictatorToken',
        tokenAddress
      );
    });
  });

  beforeEach(async function () {
    cmd = await fixture();
  });

  it('Should do something', async function () {
    console.log(await this.token.DAO());
    console.log(this.dao.address);
    console.log(
      (
        await hre.ethers.provider.getBalance(
          '0x9e6e344f94305d36eA59912b0911fE2c9149Ed3E'
        )
      ).toString()
    );
  });

  describe('Auction mechanism', function () {
    // The price of a "full" token in ETH-wei is:
    //
    //  (t_1 - t)^8 / 10^28
    //
    // where t is the block timestamp in seconds, and t_1 is the end of the
    // week. If we start at zero, that's:
    const t_1 = 7 * 24 * 3600;
    const getPrice = (t) =>
      BN(t_1 - t, 0)
        .pow(8)
        .div(e10(28));

    it('Should start with a million tokens for sale', async function () {
      // Weeks start counting from 0 at deployment
      expect(await this.token.tokensPerWeek(0)).to.equal(BN(1_000_000));
    });

    it('Should open the bidding at ~1.8 ETH per token', async function () {
      const startPrice = getPrice(0);
      expect(startPrice.div(e10(15))).to.equal(1790);

      expect(await this.token.price()).to.equal(startPrice);
    });

    // One ETH at:
    //
    // (t_1 - t)^8 / 10^28  = 10^18
    // (t_1 - t)^8          = 10^46
    //             t_1 - t  = 10^(46/8)         (if t <= t_1)
    //                      = 10^5.75
    //                     ~= 562_341
    //
    //                   t  = 604_800 - 562_341
    //                     ~=  42_500
    //
    // That's a bit under 12 hours; so half a day to get under 1ETH:
    const p12h = getPrice(12 * 3600);
    it('Should get to just under 1 ETH in 12 hours', async function () {
      expect(p12h.div(e10(15))).to.equal(989);

      await hre.ethers.provider.send('evm_increaseTime', [12 * 3600]);
      await hre.ethers.provider.send('evm_mine', []);

      console.log(
        (await hre.ethers.provider.getBalance(this.carol.address))
          .div(e10(18))
          .toString()
      );

      expect(await this.token.price()).to.equal(p12h);
    });
  });
});
