const { expect } = require('chai');
const { createFixture, BN, e10 } = require('./framework');
const { provider } = hre.ethers;

const gwei = 1_000_000_000n;
const exawei = gwei * gwei;

const UINT256_MAX = 2n ** 256n - 1n;
const ZERO_ADDR = '0x0000000000000000000000000000000000000000';

describe('Staking and Voting', function () {
  let timer, fixture;
  before(async function () {
    // Only used once, so not really a fixture. For now.
    fixture = await createFixture(deployments, this, async (cmd) => {
      const latestBlock = await provider.getBlock('latest');
      timer = (() => {
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

      const one = BN(1);

      const [tEarly, tMid, tLate] = [5 * 3600, 40 * 3600, 130 * 3600];
      const [qEarly, qMid, qLate] = [
        1485119047619047619n,
        1380952380952380952n,
        1113095238095238095n,
      ];

      await timer.inc(tEarly);
      await this.token.buy(0, this.alice.address, { value: one });

      await timer.inc(tMid - tEarly);
      await this.token.buy(0, this.bob.address, { value: one });

      await timer.inc(tLate - tMid);
      await this.token.buy(0, this.carol.address, { value: one });

      await timer.inc(WEEK);
      await this.token.nextWeek();

      for (const acc of [this.alice, this.bob, this.carol]) {
        await this.token.claimPurchase(0, acc.address);
        await this.token.connect(acc).approve(this.dao.address, UINT256_MAX);
      }
    });

    await fixture();
  });

  const stakeAlice = BN(1000);
  const stakeBob = BN(200);
  const stakeCarol = BN(333_333_333, 12);

  const total = stakeAlice.add(stakeBob).add(stakeCarol);
  const burnBob = stakeBob.div(3);
  const transferAliceBob = BN(10);

  // This should probably be separate tests without resetting to a fixture..
  it('Should mint all shares in a 1:1 ratio at first', async function () {
    // Less than they bought, but that does not matter:
    await expect(
      this.dao.connect(this.alice).mint(stakeAlice, this.dirk.address)
    )
      .to.emit(this.token, 'Transfer')
      .withArgs(this.alice.address, this.dao.address, stakeAlice)
      .to.emit(this.dao, 'Transfer')
      .withArgs(ZERO_ADDR, this.alice.address, stakeAlice);

    await expect(this.dao.connect(this.bob).mint(stakeBob, this.erin.address))
      .to.emit(this.token, 'Transfer')
      .withArgs(this.bob.address, this.dao.address, stakeBob)
      .to.emit(this.dao, 'Transfer')
      .withArgs(ZERO_ADDR, this.bob.address, stakeBob);

    await expect(
      this.dao.connect(this.carol).mint(stakeCarol, this.dirk.address)
    )
      .to.emit(this.token, 'Transfer')
      .withArgs(this.carol.address, this.dao.address, stakeCarol)
      .to.emit(this.dao, 'Transfer')
      .withArgs(ZERO_ADDR, this.carol.address, stakeCarol);

    expect(await this.dao.balanceOf(this.alice.address)).to.equal(stakeAlice);
    expect(await this.dao.balanceOf(this.bob.address)).to.equal(stakeBob);
    expect(await this.dao.balanceOf(this.carol.address)).to.equal(stakeCarol);
  });

  it('Should track votes according to stake', async function () {
    expect(await this.dao.votes(this.dirk.address)).to.equal(
      stakeAlice.add(stakeCarol)
    );
    expect(await this.dao.votes(this.erin.address)).to.equal(stakeBob);
    expect(await this.dao.userVote(this.alice.address)).to.equal(
      this.dirk.address
    );
    expect(await this.dao.userVote(this.carol.address)).to.equal(
      this.dirk.address
    );
    expect(await this.dao.userVote(this.bob.address)).to.equal(
      this.erin.address
    );

    expect(await this.dao.totalSupply()).to.equal(total);
  });

  it('Should lock staked tokens', async function () {
    await expect(
      this.dao.connect(this.bob).burn(this.fred.address, burnBob)
    ).to.be.revertedWith('Locked');
  });

  it('Should allow vote changes even for locked tokens', async function () {
    // Voting; works even if the token is locked:
    await this.dao.connect(this.bob).vote(this.dirk.address);
    expect(await this.dao.votes(this.dirk.address)).to.equal(total);
    expect(await this.dao.votes(this.erin.address)).to.equal(0);
    expect(await this.dao.userVote(this.bob.address)).to.equal(
      this.dirk.address
    );

    // Change the vote again
    await this.dao.connect(this.bob).vote(this.alice.address);
    expect(await this.dao.votes(this.alice.address)).to.equal(stakeBob);
    expect(await this.dao.votes(this.dirk.address)).to.equal(
      stakeAlice.add(stakeCarol)
    );

    // Change it back to how it was:
    await this.dao.connect(this.bob).vote(this.erin.address);
    expect(await this.dao.votes(this.erin.address)).to.equal(stakeBob);
    expect(await this.dao.votes(this.alice.address)).to.equal(0);
    expect(await this.dao.votes(this.dirk.address)).to.equal(
      stakeAlice.add(stakeCarol)
    );
  });

  it('Should update vote totals on withdrawal', async function () {
    // Free Bob's stake
    await timer.inc(25 * 3600);

    await expect(this.dao.connect(this.bob).burn(this.fred.address, burnBob))
      .to.emit(this.dao, 'Transfer')
      .withArgs(this.bob.address, ZERO_ADDR, burnBob)
      .to.emit(this.token, 'Transfer')
      .withArgs(this.dao.address, this.fred.address, burnBob);

    expect(await this.dao.totalSupply()).to.equal(total.sub(burnBob));
    expect(await this.dao.votes(this.erin.address)).to.equal(
      stakeBob.sub(burnBob)
    );
  });

  it('Should update vote totals on transfer', async function () {
    expect(await this.dao.userVote(this.alice.address)).to.equal(
      this.dirk.address
    );
    expect(await this.dao.userVote(this.bob.address)).to.equal(
      this.erin.address
    );
    expect(await this.dao.votes(this.erin.address)).to.equal(
      stakeBob.sub(burnBob)
    );
    expect(await this.dao.votes(this.dirk.address)).to.equal(
      stakeAlice.add(stakeCarol)
    );

    await expect(
      this.dao.connect(this.alice).transfer(this.bob.address, transferAliceBob)
    )
      .to.emit(this.dao, 'Transfer')
      .withArgs(this.alice.address, this.bob.address, transferAliceBob);

    expect(await this.dao.userVote(this.alice.address)).to.equal(
      this.dirk.address
    );
    expect(await this.dao.userVote(this.bob.address)).to.equal(
      this.erin.address
    );

    expect(await this.dao.totalSupply()).to.equal(total.sub(burnBob));
    expect(await this.dao.votes(this.dirk.address)).to.equal(
      stakeAlice.add(stakeCarol).sub(transferAliceBob)
    );
    expect(await this.dao.votes(this.erin.address)).to.equal(
      stakeBob.sub(burnBob).add(transferAliceBob)
    );
  });
});
