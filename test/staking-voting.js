const { expect } = require('chai');
const { createFixture, BN, incTime } = require('./framework');
const { provider } = hre.ethers;

const UINT256_MAX = 2n ** 256n - 1n;
const ZERO_ADDR = '0x0000000000000000000000000000000000000000';
const WEEK = 7 * 24 * 3600;

describe('Staking and Voting', function () {
  let fixture;
  before(async function () {
    // Only used once, so not really a fixture. For now.
    fixture = await createFixture(deployments, this, async (cmd) => {
      // Initial supply will be owned by Alice, the first account:
      const owners = [this.alice, this.bob, this.carol];
      const initialBalance = BN(10_000);

      await cmd.deploy('token', 'MockERC20', initialBalance.mul(owners.length));

      await cmd.deploy(
        'dao',
        'contracts/DictatorDAO.sol:DictatorDAO',
        'MAJOR',
        'Majordomo',
        this.token.address,
        this.bob.address,
      );

      for (const acc of owners) {
        if (acc != this.alice) {
          await this.token.transfer(acc.address, initialBalance);
        }
        await this.token.connect(acc).approve(this.dao.address, UINT256_MAX);
      }
    });

    await fixture();
  });

  const stakeAliceHalf = BN(500);
  const stakeAlice = stakeAliceHalf.mul(2);

  const stakeBob = BN(200);
  const stakeCarol = BN(33_333_333, 12);

  const total = stakeAlice.add(stakeBob).add(stakeCarol);
  const burnBob = stakeBob.div(3);
  const transferAliceBob = BN(10);

  // This should probably be separate tests without resetting to a fixture..
  it('Should mint all shares in a 1:1 ratio at first', async function () {
    // Less than they bought, but that does not matter:
    await expect(
      this.dao.connect(this.alice).mint(stakeAliceHalf, this.fred.address),
    )
      .to.emit(this.token, 'Transfer')
      .withArgs(this.alice.address, this.dao.address, stakeAliceHalf)
      .to.emit(this.dao, 'Transfer')
      .withArgs(ZERO_ADDR, this.alice.address, stakeAliceHalf);

    await expect(this.dao.connect(this.bob).mint(stakeBob, this.erin.address))
      .to.emit(this.token, 'Transfer')
      .withArgs(this.bob.address, this.dao.address, stakeBob)
      .to.emit(this.dao, 'Transfer')
      .withArgs(ZERO_ADDR, this.bob.address, stakeBob);

    await expect(
      this.dao.connect(this.carol).mint(stakeCarol, this.dirk.address),
    )
      .to.emit(this.token, 'Transfer')
      .withArgs(this.carol.address, this.dao.address, stakeCarol)
      .to.emit(this.dao, 'Transfer')
      .withArgs(ZERO_ADDR, this.carol.address, stakeCarol);

    expect(await this.dao.balanceOf(this.alice.address)).to.equal(
      stakeAliceHalf,
    );
    expect(await this.dao.balanceOf(this.bob.address)).to.equal(stakeBob);
    expect(await this.dao.balanceOf(this.carol.address)).to.equal(stakeCarol);
  });

  it('Should count votes according to stake', async function () {
    expect(await this.dao.votes(this.dirk.address)).to.equal(stakeCarol);
    expect(await this.dao.votes(this.erin.address)).to.equal(stakeBob);
    expect(await this.dao.votes(this.fred.address)).to.equal(stakeAliceHalf);
    expect(await this.dao.userVote(this.alice.address)).to.equal(
      this.fred.address,
    );
    expect(await this.dao.userVote(this.carol.address)).to.equal(
      this.dirk.address,
    );
    expect(await this.dao.userVote(this.bob.address)).to.equal(
      this.erin.address,
    );

    expect(await this.dao.totalSupply()).to.equal(total.sub(stakeAliceHalf));
  });

  it('Should vote ones entire balance on a new stake', async function () {
    await this.dao.connect(this.alice).mint(stakeAliceHalf, this.dirk.address);
    expect(await this.dao.userVote(this.alice.address)).to.equal(
      this.dirk.address,
    );
    expect(await this.dao.votes(this.dirk.address)).to.equal(
      stakeCarol.add(stakeAlice),
    );
    expect(await this.dao.votes(this.fred.address)).to.equal(0);

    expect(await this.dao.totalSupply()).to.equal(total);
  });

  it('Should lock staked tokens -- withdrawal', async function () {
    await expect(
      this.dao.connect(this.bob).burn(this.fred.address, burnBob),
    ).to.be.revertedWith('Locked');
  });

  it('Should lock staked tokens -- transfer', async function () {
    await expect(
      this.dao.connect(this.bob).transfer(this.fred.address, 1n),
    ).to.be.revertedWith('Locked');
  });

  it('Should allow vote changes even for locked tokens', async function () {
    // Voting; works even if the token is locked:
    await this.dao.connect(this.bob).vote(this.dirk.address);
    expect(await this.dao.votes(this.dirk.address)).to.equal(total);
    expect(await this.dao.votes(this.erin.address)).to.equal(0);
    expect(await this.dao.userVote(this.bob.address)).to.equal(
      this.dirk.address,
    );

    // Change the vote again
    await this.dao.connect(this.bob).vote(this.alice.address);
    expect(await this.dao.votes(this.alice.address)).to.equal(stakeBob);
    expect(await this.dao.votes(this.dirk.address)).to.equal(
      stakeAlice.add(stakeCarol),
    );

    // Change it back to how it was:
    await this.dao.connect(this.bob).vote(this.erin.address);
    expect(await this.dao.votes(this.erin.address)).to.equal(stakeBob);
    expect(await this.dao.votes(this.alice.address)).to.equal(0);
    expect(await this.dao.votes(this.dirk.address)).to.equal(
      stakeAlice.add(stakeCarol),
    );
  });

  it('Should correctly handle voting the same way twice', async function () {
    expect(await this.dao.userVote(this.bob.address)).to.equal(
      this.erin.address,
    );

    await this.dao.connect(this.bob).vote(this.erin.address);

    expect(await this.dao.votes(this.erin.address)).to.equal(stakeBob);
  });

  it('Should correctly handle votes on an empty balance', async function () {
    // Why do this? Because received shares still get voted your way.
    expect(await this.dao.userVote(this.fred.address)).to.equal(ZERO_ADDR);
    expect(await this.dao.balanceOf(this.fred.address)).to.equal(0);
    expect(await this.dao.votes(this.erin.address)).to.equal(stakeBob);

    await this.dao.connect(this.fred).vote(this.erin.address);

    // No change in count, but the preference gets recorded:
    expect(await this.dao.votes(this.erin.address)).to.equal(stakeBob);
    expect(await this.dao.userVote(this.fred.address)).to.equal(
      this.erin.address,
    );
  });

  it('Should refuse withdrawing to the zero address', async function () {
    await expect(
      this.dao.connect(this.bob).burn(ZERO_ADDR, 1),
    ).to.be.revertedWith('Zero address');
  });

  it('Should update vote totals on withdrawal', async function () {
    // Free Bob's stake
    await incTime(25 * 3600);

    await expect(this.dao.connect(this.bob).burn(this.fred.address, burnBob))
      .to.emit(this.dao, 'Transfer')
      .withArgs(this.bob.address, ZERO_ADDR, burnBob)
      .to.emit(this.token, 'Transfer')
      .withArgs(this.dao.address, this.fred.address, burnBob);

    expect(await this.dao.totalSupply()).to.equal(total.sub(burnBob));
    expect(await this.dao.votes(this.erin.address)).to.equal(
      stakeBob.sub(burnBob),
    );
  });

  it('Should update vote totals on transfer', async function () {
    await expect(
      this.dao.connect(this.alice).transfer(this.bob.address, transferAliceBob),
    )
      .to.emit(this.dao, 'Transfer')
      .withArgs(this.alice.address, this.bob.address, transferAliceBob);

    expect(await this.dao.totalSupply()).to.equal(total.sub(burnBob));
    expect(await this.dao.votes(this.dirk.address)).to.equal(
      stakeAlice.add(stakeCarol).sub(transferAliceBob),
    );
    expect(await this.dao.votes(this.erin.address)).to.equal(
      stakeBob.sub(burnBob).add(transferAliceBob),
    );
  });

  it('Should not set the operator to zero', async function () {
    await expect(this.dao.setOperator(ZERO_ADDR)).to.be.revertedWith(
      'Zero operator',
    );
  });

  it('Should set the operator to the elected address', async function () {
    // Dirk should have the most votes at this point; if we changed the numbers
    // such that this is no longer true, then the test becomes inaccurate:
    expect((await this.dao.votes(this.dirk.address)).mul(2)).to.gt(
      await this.dao.totalSupply(),
    );
    expect(await this.dao.operator()).to.equal(this.bob.address);
    expect(await this.dao.pendingOperator()).to.equal(ZERO_ADDR);

    await expect(this.dao.setOperator(this.alice.address)).to.be.revertedWith(
      'Not enough votes',
    );

    const setTime = await incTime(10);
    await this.dao.setOperator(this.dirk.address);

    expect(await this.dao.operator()).to.equal(this.bob.address);
    expect(await this.dao.pendingOperator()).to.equal(this.dirk.address);

    expect(await this.dao.pendingOperatorTime()).to.equal(setTime + WEEK);

    await expect(this.dao.setOperator(this.erin.address)).to.be.revertedWith(
      'Not enough votes',
    );
    await expect(this.dao.setOperator(this.dirk.address)).to.be.revertedWith(
      'Wait longer',
    );

    await incTime(WEEK + 1);
    await this.dao.setOperator(this.dirk.address);
    expect(await this.dao.operator()).to.equal(this.dirk.address);
    expect(await this.dao.pendingOperator()).to.equal(ZERO_ADDR);
    expect(await this.dao.pendingOperatorTime()).to.equal(0);
  });

  it('Should not count zero votes', async function () {
    expect(await this.dao.userVote(this.alice.address)).to.equal(
      this.dirk.address,
    );
    const erinVotes = await this.dao.votes(this.erin.address);
    const totalVotes = await this.dao.totalSupply();
    expect(erinVotes.mul(2)).to.gt(totalVotes.sub(stakeAlice));

    await expect(this.dao.setOperator(this.erin.address)).to.be.revertedWith(
      'Not enough votes',
    );

    await this.dao.connect(this.alice).vote(this.alice.address);

    await expect(this.dao.setOperator(this.erin.address)).to.be.revertedWith(
      'Not enough votes',
    );

    await this.dao.connect(this.alice).vote(ZERO_ADDR);

    // Since zero votes are not counted, Erin now has the majority:
    await this.dao.setOperator(this.erin.address);
    expect(await this.dao.operator()).to.equal(this.dirk.address);
    expect(await this.dao.pendingOperator()).to.equal(this.erin.address);
  });

  it('Should remove operator-to-be if majority not held', async function () {
    // Uses the results from the previous test. Sanity check:
    expect(await this.dao.pendingOperator()).to.equal(this.erin.address);
    const totalSupply = await this.dao.totalSupply();
    const zeroVotes = await this.dao.votes(ZERO_ADDR);
    expect(await this.dao.balanceOf(this.alice.address)).to.equal(zeroVotes);
    const netVotes = totalSupply.sub(zeroVotes);

    const erinVotes = await this.dao.votes(this.erin.address);
    expect(erinVotes.mul(2)).to.gt(netVotes);
    expect(erinVotes.mul(2)).to.lte(totalSupply);

    await expect(this.dao.setOperator(this.erin.address)).to.be.revertedWith(
      'Wait longer',
    );

    await this.dao.connect(this.alice).vote(this.alice.address);

    // With Alice's votes now counting against her, Erin no longer has a
    // majority. The same setOperator() method will now unseat her from the
    // pending operator position instead:
    await this.dao.setOperator(this.erin.address);
    expect(await this.dao.operator()).to.equal(this.dirk.address);
    expect(await this.dao.pendingOperator()).to.equal(ZERO_ADDR);
  });

  describe('Tribute', function () {
    it('Should grow the token/share ratio', async function () {
      await fixture();

      // Tested previously
      await this.dao.connect(this.alice).mint(stakeAlice, this.dirk.address);
      await this.dao.connect(this.bob).mint(stakeBob, this.erin.address);

      expect(await this.dao.balanceOf(this.alice.address)).to.equal(stakeAlice);
      expect(await this.dao.balanceOf(this.bob.address)).to.equal(stakeBob);

      // Free the staked tokens
      await incTime(25 * 3600);

      const staked = stakeAlice.add(stakeBob);
      const tribute = staked.div(5);

      // Carol pays "tribute" by depositing her tokens without taking any
      // shares in return. This increases the amount of tokens that Alice and
      // Bob get back for their shares. The tribute is 20% of the total, so we
      // get 20% more shares back:
      await this.token.connect(this.carol).transfer(this.dao.address, tribute);

      // Alice now gets 1/5 more back. (Using "burnFrom" mainly for coverage
      // reasons):
      await this.dao
        .connect(this.alice)
        .approve(this.erin.address, UINT256_MAX);
      await expect(
        this.dao
          .connect(this.erin)
          .burnFrom(this.alice.address, this.alice.address, stakeAlice),
      )
        .to.emit(this.dao, 'Transfer')
        .withArgs(this.alice.address, ZERO_ADDR, stakeAlice)
        .to.emit(this.token, 'Transfer')
        .withArgs(
          this.dao.address,
          this.alice.address,
          stakeAlice.mul(6).div(5),
        );
    });

    it('Should reflect the new share price when staking', async function () {
      // Staking more tokens now reflects the new share price:
      await expect(
        this.dao.connect(this.alice).mint(stakeAlice, this.dirk.address),
      )
        .to.emit(this.token, 'Transfer')
        .withArgs(this.alice.address, this.dao.address, stakeAlice)
        .to.emit(this.dao, 'Transfer')
        .withArgs(ZERO_ADDR, this.alice.address, stakeAlice.mul(5).div(6));
    });

    let tokenRoundingError;

    it('Should return the same amount back* (rounding)', async function () {
      const sharesReceived = stakeAlice.mul(5).div(6);

      // Need not be the same due to rounding, but should be close.
      // One as in one wei, not one share:
      const tokensReceived = sharesReceived.mul(6).div(5);
      tokenRoundingError = stakeAlice.sub(tokensReceived);
      expect(tokenRoundingError).to.gte(0);
      expect(tokenRoundingError).to.lte(1);

      await incTime(25 * 3600);

      await expect(
        this.dao.connect(this.alice).burn(this.alice.address, sharesReceived),
      )
        .to.emit(this.dao, 'Transfer')
        .withArgs(this.alice.address, ZERO_ADDR, sharesReceived)
        .to.emit(this.token, 'Transfer')
        .withArgs(this.dao.address, this.alice.address, tokensReceived);
    });

    it('Should "compound" profits', async function () {
      // Bob staked at the original 1:1 ratio and never withdrew. There was one
      // 20% bump, and now another one at 30%:
      const staked = await this.token.balanceOf(this.dao.address);
      const tribute = staked.mul(3).div(10);
      await this.token.connect(this.carol).transfer(this.dao.address, tribute);

      // Bob's return is therefore:
      //
      //  1.2 * 1.3 - 1  = 56%
      //
      // Test the case where we withdraw only part of the stake:
      const withdrawBob = stakeBob.div(2);
      await expect(
        this.dao.connect(this.bob).burn(this.bob.address, withdrawBob),
      )
        .to.emit(this.dao, 'Transfer')
        .withArgs(this.bob.address, ZERO_ADDR, withdrawBob)
        .to.emit(this.token, 'Transfer')
        .withArgs(
          this.dao.address,
          this.bob.address,
          withdrawBob.mul(156).div(100),
        );

      // ^ This happens to not have rounding errors, but it might. Deal with
      // that. Use (more) explicit numbers instead?
    });
  });
});
