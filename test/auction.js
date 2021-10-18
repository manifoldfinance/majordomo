const { expect } = require('chai');
const { createFixture, BN, e10 } = require('./framework');
const { provider } = hre.ethers;

const gwei = 1_000_000_000n;
const exawei = gwei * gwei;

const UINT256_MAX = 2n ** 256n - 1n;
const ZERO_ADDR = '0x0000000000000000000000000000000000000000';

describe('Auction', function () {
  // Why not use evm_increaseTime? Because that one keeps the actual clock
  // ticking as well, resulting in irregularities if the seconds counter
  // happens to tick over during a test.
  // TODO: Incorporate into fixture?
  let timer, fixture, cmd;
  before(async function () {
    fixture = await createFixture(deployments, this, async (cmd) => {
      const latestBlock = await provider.getBlock('latest');
      timer = (() => {
        // let first = (latest = Math.floor(new Date().getTime() / 1000));
        let first = (latest = latestBlock.timestamp + 1);
        return {
          reset: () => (latest = first),
          // NOTE: Actual passed time effectively gets subtracted from offset
          inc: (offset) =>
            provider.send('evm_setNextBlockTimestamp', [(latest += offset)]),
        };
      })();
      await timer.inc(0); // Consistent start time
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
    timer.reset();
  });

  it('Should do something', async function () {
    expect(await this.token.DAO()).to.equal(this.dao.address);
  });

  // The price of a "full" token in ETH-wei is:
  //
  //  (t_1 - t)^8 / 10^28
  //
  // where t is the block timestamp in seconds, and t_1 is the end of the
  // week. If we start at zero, that's:
  const t_1 = (WEEK = 7 * 24 * 3600);
  const getPrice = (t) =>
    BN(t_1 - t, 0)
      .pow(8)
      .div(e10(28));

  const p102h = getPrice(102 * 3600);

  // 50% * (part of week left) is added to the effective amount paid:
  // qty in ether:
  const getAmountWithBonus = (qty, t) =>
    BN(qty).add(
      BN(qty)
        .mul(WEEK - (t % WEEK))
        .div(2 * WEEK)
    );

  describe('Price', function () {
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
    // That's a little less than 12 hours, so half a day to get under 1 ETH:
    it('Should cost a bit under 1 ETH in 12 hours', async function () {
      const p12h = getPrice(12 * 3600);
      expect(p12h.div(e10(15))).to.equal(989);

      await timer.inc(12 * 3600);
      await provider.send('evm_mine', []);

      expect(await this.token.price()).to.equal(p12h);
    });

    // 0.001 ETH at:
    //
    // (t_1 - t)^8 / 10^28  = 10^15
    //             t_1 - t  = 10^(43/8)
    //                   t  = 604_800 - 10^5.375
    //                     ~= 367_662
    it('Should cost a bit over 0.001 ETH in 102 hours', async function () {
      expect(p102h).to.equal(1_015_714_121_433_904); // ~1M gwei

      // TODO: Why does this fail every so often? Suspect it is possible for a
      //       second to elapse. Find a more exact way to set the time.
      await timer.inc(102 * 3600);
      await provider.send('evm_mine', []);

      expect(await this.token.price()).to.equal(p102h);
    });

    it('Should sell out for ~1k ETH after 102 hours', async function () {
      await timer.inc(102 * 3600);

      // There is (66 hrs) / (168 hrs) left, so we get a bonus of
      //
      //    66 / 168 / 2    = 33 / 168    = 11 / 56.
      //
      // The total "weekShares" is 67 * msg.value / 56, calculated in that
      // order. The most we can send -- ensuring we buy the entire batch -- is:
      //
      //    max { x | 67 * x / 56 <= p102 * 1e6 }
      //
      // =  max { x | 67 * x      <= 56 * p102 * 1e6 + 55 }
      //
      // =  max { x |      x      <= (56 * p102 * 1e6 + 55) / 67 }
      //
      // =                           (56 * p102 * 1e6 + 55) / 67
      //
      //
      // where x must be an integer, and '/' is integer division.
      //
      const maxCost = p102h.mul(1e6).mul(56).add(55).div(67);

      // ~0.848 ETH gets you ~1.015 ETH worth at the current time and price:
      expect(maxCost.div(e10(18))).to.equal(848);

      // Mines a block; no need for evm_mine beforehand
      await expect(this.token.buy(0, this.carol.address, { value: maxCost }));
    });

    it('Should reject at one past the above cutoff', async function () {
      await timer.inc(102 * 3600);

      const maxCost = p102h.mul(1e6).mul(56).add(55).div(67);
      const tooMuch = maxCost.add(1);

      await expect(
        this.token.buy(0, this.carol.address, { value: tooMuch })
      ).to.be.revertedWith('Oversold');
    });
  });

  describe('Finalization', function () {
    it('Should not end early if nothing is sold', async function () {
      await expect(this.token.nextWeek()).to.be.revertedWith('Not fully sold');
    });

    it('Should not end early if too little is sold', async function () {
      await timer.inc(102 * 3600);
      const maxCost = p102h.mul(1e6).mul(56).add(55).div(67);
      await this.token.buy(0, this.carol.address, { value: maxCost.div(2) });

      await expect(this.token.nextWeek()).to.be.revertedWith('Not fully sold');
    });

    it('Should end early if enough is sold', async function () {
      await timer.inc(102 * 3600);
      const maxCost = p102h.mul(1e6).mul(56).add(55).div(67);
      await this.token.buy(0, this.carol.address, { value: maxCost });

      // Later timestamp => lower price => sold out:
      await this.token.nextWeek();
      expect(await this.token.currentWeek()).to.equal(1);
    });

    it('Should end if week is up, even with no buyers', async function () {
      await timer.inc(WEEK);
      await this.token.nextWeek();
      expect(await this.token.currentWeek()).to.equal(1);
    });

    it('Should let you claim once the auction is over', async function () {
      await timer.inc(102 * 3600);
      const maxCost = p102h.mul(1e6).mul(56).add(55).div(67);
      await this.token.buy(0, this.carol.address, { value: maxCost });
      await this.token.nextWeek();
      expect(await this.token.currentWeek()).to.equal(1);

      await expect(this.token.claimPurchase(0, this.carol.address))
        .to.emit(this.token, 'Transfer')
        .withArgs(this.token.address, this.carol.address, BN(1_000_000));
    });

    it('Should refuse claims for unfinished auctions', async function () {
      await timer.inc(102 * 3600);
      await expect(
        this.token.claimPurchase(0, this.carol.address)
      ).to.be.revertedWith('Not finished');
    });

    it('Should cost in proportion to post-bonus amount', async function () {
      const h = 3600;
      const [tEarly, tMid, tLate] = [5 * h, 40 * h, 130 * h];

      const qEarly = 1485119047619047619n;
      const qMid = 1380952380952380952n;
      const qLate = 1113095238095238095n;

      expect(qEarly).to.equal(getAmountWithBonus(1, tEarly));
      expect(qMid).to.equal(getAmountWithBonus(1, tMid));
      expect(qLate).to.equal(getAmountWithBonus(1, tLate));

      const weekShares = qEarly + qMid + qLate;

      const one = BN(1);
      // TODO: Put actual amounts in test?
      await timer.inc(tEarly);
      await this.token.buy(0, this.alice.address, { value: one });

      await timer.inc(tMid - tEarly);
      await this.token.buy(0, this.bob.address, { value: one });

      await timer.inc(tLate - tMid);
      await this.token.buy(0, this.carol.address, { value: one });

      await timer.inc(WEEK);
      await this.token.nextWeek();

      await expect(this.token.claimPurchase(0, this.alice.address))
        .to.emit(this.token, 'Transfer')
        .withArgs(
          this.token.address,
          this.alice.address,
          BN(1_000_000).mul(qEarly).div(weekShares)
        );

      await expect(this.token.claimPurchase(0, this.bob.address))
        .to.emit(this.token, 'Transfer')
        .withArgs(
          this.token.address,
          this.bob.address,
          BN(1_000_000).mul(qMid).div(weekShares)
        );

      await expect(this.token.claimPurchase(0, this.carol.address))
        .to.emit(this.token, 'Transfer')
        .withArgs(
          this.token.address,
          this.carol.address,
          BN(1_000_000).mul(qLate).div(weekShares)
        );
    });
  });
});
