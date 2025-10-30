use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Mint, Transfer};

declare_id!("Dex111111111111111111111111111111111111111");

#[program]
pub mod dex_ai {
	use super::*;

	pub fn initialize_pool(ctx: Context<InitializePool>, fee_bps: u16) -> Result<()> {
		let pool = &mut ctx.accounts.pool;
		pool.authority = ctx.accounts.authority.key();
		pool.mint_a = ctx.accounts.mint_a.key();
		pool.mint_b = ctx.accounts.mint_b.key();
		pool.vault_a = ctx.accounts.vault_a.key();
		pool.vault_b = ctx.accounts.vault_b.key();
		pool.fee_bps = fee_bps;
		Ok(())
	}

	pub fn swap(ctx: Context<Swap>, amount_in: u64, min_amount_out: u64) -> Result<()> {
		let pool = &ctx.accounts.pool;
		require!(amount_in > 0, DexError::InvalidAmount);

		// Ensure user source/destination are valid mints and vaults belong to the pool
		let is_a_to_b = ctx.accounts.user_source.mint == pool.mint_a;
		require!(ctx.accounts.vault_a.mint == pool.mint_a, DexError::InvalidAccount);
		require!(ctx.accounts.vault_b.mint == pool.mint_b, DexError::InvalidAccount);
		require!(ctx.accounts.user_destination.mint == (if is_a_to_b { pool.mint_b } else { pool.mint_a }), DexError::InvalidAccount);

		let (src_vault, dst_vault) = if is_a_to_b { (&ctx.accounts.vault_a, &ctx.accounts.vault_b) } else { (&ctx.accounts.vault_b, &ctx.accounts.vault_a) };

		let quote_out = compute_constant_product_quote(amount_in, src_vault.amount, dst_vault.amount, pool.fee_bps)?;
		require!(quote_out >= min_amount_out, DexError::SlippageExceeded);

		// extra: check for overflows
		let user_to_vault = Transfer {
			authority: ctx.accounts.user.to_account_info(),
			from: ctx.accounts.user_source.to_account_info(),
			to: src_vault.to_account_info(),
			token_program: ctx.accounts.token_program.to_account_info(),
		};
		token::transfer(CpiContext::new(ctx.accounts.token_program.to_account_info(), user_to_vault), amount_in)?;

		let vault_to_user = Transfer {
			authority: ctx.accounts.pool_signer(),
			from: dst_vault.to_account_info(),
			to: ctx.accounts.user_destination.to_account_info(),
			token_program: ctx.accounts.token_program.to_account_info(),
		};
		token::transfer(CpiContext::new(ctx.accounts.token_program.to_account_info(), vault_to_user), quote_out)?;

		Ok(())
	}
}

#[account]
pub struct Pool {
	pub authority: Pubkey,
	pub mint_a: Pubkey,
	pub mint_b: Pubkey,
	pub vault_a: Pubkey,
	pub vault_b: Pubkey,
	pub fee_bps: u16,
}

impl Pool {
	pub const LEN: usize = 32 + 32 + 32 + 32 + 32 + 2 + 8; // +8 for anchor discriminator
}

#[derive(Accounts)]
pub struct InitializePool<'info> {
	#[account(mut)]
	pub authority: Signer<'info>,
	pub mint_a: Account<'info, Mint>,
	pub mint_b: Account<'info, Mint>,
	#[account(mut)]
	pub vault_a: Account<'info, TokenAccount>,
	#[account(mut)]
	pub vault_b: Account<'info, TokenAccount>,
	#[account(init, payer = authority, space = 8 + Pool::LEN)]
	pub pool: Account<'info, Pool>,
	pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Swap<'info> {
	#[account(mut)]
	pub user: Signer<'info>,
	#[account(mut)]
	pub user_source: Account<'info, TokenAccount>,
	#[account(mut)]
	pub user_destination: Account<'info, TokenAccount>,
	#[account(mut, has_one = vault_a, has_one = vault_b)]
	pub pool: Account<'info, Pool>,
	#[account(mut)]
	pub vault_a: Account<'info, TokenAccount>,
	#[account(mut)]
	pub vault_b: Account<'info, TokenAccount>,
	pub token_program: Program<'info, Token>,
}

impl<'info> Swap<'info> {
	pub fn pool_signer(&self) -> AccountInfo<'info> {
		self.pool.to_account_info()
	}
}

#[error_code]
pub enum DexError {
	#[msg("Invalid amount")] InvalidAmount,
	#[msg("Slippage exceeded")] SlippageExceeded,
	#[msg("Invalid or mismatched account")] InvalidAccount,
}

fn compute_constant_product_quote(amount_in: u64, reserve_in: u64, reserve_out: u64, fee_bps: u16) -> Result<u64> {
	require!(reserve_in > 0 && reserve_out > 0, DexError::InvalidAmount);
	let amount_in_after_fee = amount_in.saturating_mul((10_000u64 - fee_bps as u64)) / 10_000u64;
	let numerator = amount_in_after_fee.saturating_mul(reserve_out);
	let denominator = reserve_in.saturating_add(amount_in_after_fee);
	Ok(numerator / denominator)
}
